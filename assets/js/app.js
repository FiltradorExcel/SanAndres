// assets/js/app.js - Router principal del sistema con funciones CRUD y auto-guardado temporal (20 min)
import { initAuth, login } from './modules/auth.js';
import { supabase } from './modules/config.js';
import { showMsg, formatDate, getStatusChip, confirmAction } from './modules/ui.js';
import { CalculadoraHidrica } from './modules/calculadora.js';

// --- SISTEMA DE PERSISTENCIA DE BORRADORES (TTL: 20 MINUTOS) ---
const TTL_20_MINUTOS = 20 * 60 * 1000;

function habilitarAutoGuardadoFormulario(formId, alRestaurarCallback) {
    const form = document.getElementById(formId);
    if (!form) return;

    const claveStorage = `sagua_borrador_${formId}`;

    // 1. Restaurar datos si no han pasado 20 minutos
    try {
        const borradorGuardado = localStorage.getItem(claveStorage);
        if (borradorGuardado) {
            const { timestamp, datos } = JSON.parse(borradorGuardado);
            if (Date.now() - timestamp < TTL_20_MINUTOS) {
                Object.keys(datos).forEach(idCampo => {
                    const campo = form.querySelector(`#${idCampo}`);
                    if (campo) campo.value = datos[idCampo];
                });
                if (typeof alRestaurarCallback === 'function') {
                    alRestaurarCallback();
                }
            } else {
                localStorage.removeItem(claveStorage);
            }
        }
    } catch (err) {
        localStorage.removeItem(claveStorage);
    }

    // 2. Guardar borrador en tiempo real al escribir o seleccionar
    form.addEventListener('input', () => {
        const datos = {};
        form.querySelectorAll('input, select, textarea').forEach(campo => {
            if (campo.id && campo.type !== 'password' && campo.type !== 'file') {
                datos[campo.id] = campo.value;
            }
        });
        localStorage.setItem(claveStorage, JSON.stringify({
            timestamp: Date.now(),
            datos
        }));
    });
}

function limpiarBorradorFormulario(formId) {
    localStorage.removeItem(`sagua_borrador_${formId}`);
}

document.addEventListener('DOMContentLoaded', async () => {
    const page = document.body.id;

    // ==========================================
    // PÁGINA: LOGIN (index.html)
    // ==========================================
    if (page === 'page-login') {
        await initAuth(false);
        const form = document.getElementById('loginForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('loginBtn');
                btn.disabled = true; 
                btn.innerHTML = 'Verificando...';
                try {
                    await login(
                        document.getElementById('email').value, 
                        document.getElementById('password').value
                    );
                    window.location.replace('dashboard.html');
                } catch (err) {
                    showMsg('loginMsg', err.message, 'error');
                    btn.disabled = false; 
                    btn.innerHTML = 'Ingresar al sistema';
                }
            });
        }
    } 

    // ==========================================
    // PÁGINA: DASHBOARD (dashboard.html)
    // ==========================================
    else if (page === 'page-dashboard') {
        const auth = await initAuth(true);
        if (!auth) return;
        
        // Cargar contadores de métricas
        const [{ count: cSec }, { count: cMed }, { count: cPend }] = await Promise.all([
            supabase.from('sectores').select('*', { count: 'exact', head: true }).eq('activo', true),
            supabase.from('mediciones').select('*', { count: 'exact', head: true }),
            supabase.from('mediciones').select('*', { count: 'exact', head: true }).eq('estado_revision', 'pendiente')
        ]);
        
        document.getElementById('c-sectores').textContent = cSec || 0;
        document.getElementById('c-mediciones').textContent = cMed || 0;
        document.getElementById('c-pendientes').textContent = cPend || 0;

        // Cargar actividad reciente
        const loadRecent = async () => {
            const { data: recents } = await supabase.from('mediciones')
                .select('id, caudal_l_s, punto_medicion, fecha_hora, estado_revision, sectores(nombre)')
                .order('fecha_hora', { ascending: false })
                .limit(5);
            
            const tbody = document.getElementById('recent-table');
            tbody.innerHTML = recents?.length ? recents.map(r => `
                <tr>
                    <td><strong>${r.sectores?.nombre || 'N/A'}</strong></td>
                    <td><span style="text-transform:uppercase; font-size:0.8rem; color:#718096; font-weight:bold">${r.punto_medicion}</span></td>
                    <td><strong>${r.caudal_l_s}</strong> L/s</td>
                    <td>${formatDate(r.fecha_hora)}</td>
                    <td>${getStatusChip(r.estado_revision)}</td>
                    <td style="text-align:center;">
                        <button onclick="window.eliminarMedicionDashboard('${r.id}')" class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Eliminar</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center; padding:1.5rem;">No hay registros recientes.</td></tr>';
        };

        window.eliminarMedicionDashboard = async (id) => {
            if (!confirmAction("¿Deseas eliminar este registro de medición?")) return;
            const { error } = await supabase.from('mediciones').delete().eq('id', id);
            if (error) alert("Error al eliminar: " + error.message);
            else await loadRecent();
        };

        await loadRecent();
    }

    // ==========================================
    // PÁGINA: MEDICIONES (mediciones.html)
    // ==========================================
    else if (page === 'page-mediciones') {
        const auth = await initAuth(true);
        if (!auth) return;

        // Cargar selectores de sectores y campañas
        const [{ data: sectores }, { data: campanas }] = await Promise.all([
            supabase.from('sectores').select('id, codigo, nombre').eq('activo', true).order('codigo'),
            supabase.from('campanas').select('id, nombre').in('estado', ['planificada', 'en_curso']).order('fecha_inicio', { ascending: false })
        ]);
        
        document.getElementById('sector_id').innerHTML = '<option value="">Selecciona sector...</option>' + 
            (sectores || []).map(s => `<option value="${s.id}">${s.codigo} - ${s.nombre}</option>`).join('');
            
        document.getElementById('campana_id').innerHTML = '<option value="">Selecciona campaña...</option>' + 
            (campanas || []).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

        // Habilitar borrador temporal (20 min)
        habilitarAutoGuardadoFormulario('medicionForm');

        // Cargar tabla de mediciones
        const loadMediciones = async () => {
            const { data, error } = await supabase.from('mediciones')
                .select('id, caudal_l_s, punto_medicion, fecha_hora, estado_revision, sectores(nombre)')
                .order('fecha_hora', { ascending: false });

            const tbody = document.getElementById('mediciones-table');
            if (error) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }
            tbody.innerHTML = data?.length ? data.map(m => `
                <tr>
                    <td><strong>${m.sectores?.nombre || 'N/A'}</strong></td>
                    <td><span style="text-transform:uppercase; font-size:0.8rem; font-weight:bold">${m.punto_medicion}</span></td>
                    <td><strong>${m.caudal_l_s}</strong> L/s</td>
                    <td>${formatDate(m.fecha_hora)}</td>
                    <td>${getStatusChip(m.estado_revision)}</td>
                    <td style="text-align:center;">
                        <button onclick="window.eliminarMedicion('${m.id}')" class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Eliminar</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center; padding:2rem;">No hay mediciones registradas.</td></tr>';
        };

        window.eliminarMedicion = async (id) => {
            if (!confirmAction("¿Confirmas la eliminación de esta medición de caudal?")) return;
            const { error } = await supabase.from('mediciones').delete().eq('id', id);
            if (error) {
                alert("No se pudo eliminar la medición: " + error.message);
            } else {
                await loadMediciones();
            }
        };

        document.getElementById('medicionForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true; 
            btn.textContent = 'Guardando...';

            try {
                const payload = {
                    campana_id: document.getElementById('campana_id').value,
                    sector_id: document.getElementById('sector_id').value,
                    punto_medicion: document.getElementById('punto_medicion').value,
                    fecha_hora: document.getElementById('fecha_hora').value || new Date().toISOString(),
                    caudal_l_s: parseFloat(document.getElementById('caudal_l_s').value),
                    metodo_medicion: document.getElementById('metodo_medicion').value.trim(),
                    observaciones: document.getElementById('observaciones').value.trim() || null,
                    registrado_por: auth.user.id,
                    estado_revision: 'pendiente'
                };
                if (payload.caudal_l_s < 0) throw new Error("El caudal no puede ser un valor negativo.");

                const { error } = await supabase.from('mediciones').insert([payload]);
                if (error) throw error;

                showMsg('formMsg', 'Registro de medición guardado correctamente.', 'success');
                e.target.reset();
                limpiarBorradorFormulario('medicionForm');
                await loadMediciones();
            } catch (err) {
                showMsg('formMsg', err.message, 'error');
            } finally {
                btn.disabled = false; 
                btn.textContent = 'Registrar Medición';
            }
        });

        await loadMediciones();
    }

    // ==========================================
    // PÁGINA: SECTORES Y CAMPAÑAS (sectores.html)
    // ==========================================
    else if (page === 'page-sectores') {
        const auth = await initAuth(true);
        if (!auth) return;

        // Habilitar borrador temporal para ambos formularios
        habilitarAutoGuardadoFormulario('sectorForm');
        habilitarAutoGuardadoFormulario('campanaForm');

        // --- 1. LÓGICA DE SECTORES ---
        const loadSectores = async () => {
            const { data, error } = await supabase.from('sectores')
                .select('id, codigo, nombre, longitud_m, tipo_revestimiento, estado_infraestructura')
                .eq('activo', true)
                .order('codigo', { ascending: true });

            const tbody = document.getElementById('sectores-table');
            if (error) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }
            tbody.innerHTML = data?.length ? data.map(s => `
                <tr>
                    <td><strong>${s.codigo}</strong><br><small>${s.nombre}</small></td>
                    <td>${s.longitud_m ? s.longitud_m + ' m' : '—'}</td>
                    <td><span style="text-transform:capitalize;">${s.tipo_revestimiento.replace(/_/g, ' ')}</span></td>
                    <td>${getStatusChip(s.estado_infraestructura)}</td>
                    <td style="text-align:center;">
                        <button onclick="window.eliminarSector('${s.id}')" class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Eliminar</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="5" style="text-align:center; padding:2rem;">No hay sectores registrados.</td></tr>';
        };

        window.eliminarSector = async (id) => {
            if (!confirmAction("¿Deseas deshabilitar este sector del sistema?")) return;
            const { error } = await supabase.from('sectores').update({ activo: false }).eq('id', id);
            if (error) alert("No se pudo eliminar el sector: " + error.message);
            else await loadSectores();
        };

        document.getElementById('sectorForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true; 
            btn.textContent = 'Guardando...';

            try {
                const payload = {
                    codigo: document.getElementById('codigo').value.trim(),
                    nombre: document.getElementById('nombre').value.trim(),
                    descripcion: document.getElementById('descripcion').value.trim() || null,
                    longitud_m: document.getElementById('longitud_m').value ? parseFloat(document.getElementById('longitud_m').value) : null,
                    tipo_revestimiento: document.getElementById('tipo_revestimiento').value,
                    estado_infraestructura: document.getElementById('estado_infraestructura').value,
                    latitud: document.getElementById('latitud').value ? parseFloat(document.getElementById('latitud').value) : null,
                    longitud_gps: document.getElementById('longitud_gps').value ? parseFloat(document.getElementById('longitud_gps').value) : null,
                    creado_por: auth.user.id
                };

                const { error } = await supabase.from('sectores').insert([payload]);
                if (error) throw error;

                showMsg('formMsg', 'Sector registrado correctamente.', 'success');
                e.target.reset();
                limpiarBorradorFormulario('sectorForm');
                await loadSectores();
            } catch (err) {
                showMsg('formMsg', err.message, 'error');
            } finally {
                btn.disabled = false; 
                btn.textContent = 'Guardar Sector';
            }
        });

        // --- 2. LÓGICA DE CAMPAÑAS ---
        const loadCampanas = async () => {
            const { data, error } = await supabase.from('campanas')
                .select('id, nombre, fecha_inicio, fecha_fin, estado')
                .order('fecha_inicio', { ascending: false });

            const tbody = document.getElementById('campanas-table');
            if (error) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }
            tbody.innerHTML = data?.length ? data.map(c => `
                <tr>
                    <td><strong>${c.nombre}</strong></td>
                    <td>${c.fecha_inicio || '—'}</td>
                    <td>${c.fecha_fin || 'En curso'}</td>
                    <td>${getStatusChip(c.estado)}</td>
                    <td style="text-align:center;">
                        <button onclick="window.eliminarCampana('${c.id}')" class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Eliminar</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="5" style="text-align:center; padding:2rem;">No hay campañas registradas.</td></tr>';
        };

        window.eliminarCampana = async (id) => {
            if (!confirmAction("¿Deseas eliminar esta campaña? Ten en cuenta que si tiene mediciones vinculadas podría generar inconvenientes de integridad.")) return;
            const { error } = await supabase.from('campanas').delete().eq('id', id);
            if (error) alert("No se pudo eliminar la campaña: " + error.message);
            else await loadCampanas();
        };

        document.getElementById('campanaForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true; 
            btn.textContent = 'Creando...';

            try {
                const payload = {
                    nombre: document.getElementById('nombre_campana').value.trim(),
                    fecha_inicio: document.getElementById('fecha_inicio').value,
                    fecha_fin: document.getElementById('fecha_fin').value || null,
                    estado: document.getElementById('estado_campana').value,
                    observaciones: document.getElementById('obs_campana').value.trim() || null,
                    creado_por: auth.user.id
                };

                const { error } = await supabase.from('campanas').insert([payload]);
                if (error) throw error;

                showMsg('campanaMsg', 'Campaña creada exitosamente.', 'success');
                e.target.reset();
                limpiarBorradorFormulario('campanaForm');
                await loadCampanas();
            } catch (err) {
                showMsg('campanaMsg', err.message, 'error');
            } finally {
                btn.disabled = false; 
                btn.textContent = 'Crear Campaña';
            }
        });

        await Promise.all([loadSectores(), loadCampanas()]);
    }

    // ==========================================
    // PÁGINA: EVIDENCIAS (evidencias.html)
    // ==========================================
    else if (page === 'page-evidencias') {
        const auth = await initAuth(true);
        if (!auth) return;

        const { data: sectores } = await supabase.from('sectores').select('id, nombre').eq('activo', true).order('nombre');
        document.getElementById('sector_id').innerHTML = '<option value="">Selecciona sector...</option>' + 
            (sectores || []).map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');

        const fileInput = document.getElementById('archivo');
        const preview = document.getElementById('preview');
        const dropArea = document.getElementById('dropArea');

        dropArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                preview.style.display = 'block';
                preview.src = URL.createObjectURL(e.target.files[0]);
                document.getElementById('dropText').textContent = e.target.files[0].name;
            }
        });

        const loadEvidencias = async () => {
            const { data, error } = await supabase.from('archivos_sector')
                .select('id, ruta_archivo, nombre_original, descripcion, creado_en, estado_revision, sectores(nombre)')
                .order('creado_en', { ascending: false });

            const tbody = document.getElementById('evidencias-table');
            if (error) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }

            tbody.innerHTML = data?.length ? data.map(item => {
                const publicUrl = supabase.storage.from('canal-evidencias').getPublicUrl(item.ruta_archivo).data.publicUrl;
                return `
                    <tr>
                        <td>
                            <img src="${publicUrl}" alt="Evidencia"
     style="width:50px; height:50px; object-fit:cover; border-radius:6px; background:#e2e8f0;"
     onerror="this.onerror=null; this.style.opacity='0.3';">
                        </td>
                        <td>
                            <strong>${item.sectores?.nombre || 'Sector'}</strong><br>
                            <small style="color:var(--text-muted);">${item.descripcion || 'Sin descripción'}</small>
                        </td>
                        <td>${formatDate(item.creado_en)}</td>
                        <td>${getStatusChip(item.estado_revision)}</td>
                        <td style="text-align:center;">
                            <button onclick="window.eliminarEvidencia('${item.id}', '${item.ruta_archivo}')" class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Eliminar</button>
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="5" style="text-align:center; padding:2rem;">No hay fotografías subidas.</td></tr>';
        };

        window.eliminarEvidencia = async (id, rutaArchivo) => {
            if (!confirmAction("¿Deseas eliminar permanentemente esta evidencia fotográfica?")) return;

            const { error: storageError } = await supabase.storage.from('canal-evidencias').remove([rutaArchivo]);
            if (storageError) console.warn("Advertencia en Storage:", storageError.message);

            const { error: dbError } = await supabase.from('archivos_sector').delete().eq('id', id);
            if (dbError) alert("Error al eliminar registro: " + dbError.message);
            else await loadEvidencias();
        };

        document.getElementById('evidenciaForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const file = fileInput.files[0];
            const sectorId = document.getElementById('sector_id').value;

            if (!file || !sectorId) {
                return showMsg('formMsg', 'Debes seleccionar un sector y una imagen.', 'error');
            }
            
            btn.disabled = true; 
            btn.textContent = 'Subiendo archivo...';

            try {
                const fileExt = file.name.split('.').pop();
                const fileName = `${sectorId}/${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage.from('canal-evidencias').upload(fileName, file);
                if (uploadError) throw uploadError;

                const { error: dbError } = await supabase.from('archivos_sector').insert([{
                    sector_id: sectorId,
                    ruta_archivo: fileName,
                    nombre_original: file.name,
                    tipo_archivo: 'fotografia',
                    descripcion: document.getElementById('descripcion').value.trim(),
                    subido_por: auth.user.id,
                    estado_revision: 'pendiente'
                }]);
                if (dbError) throw dbError;

                showMsg('formMsg', 'Fotografía subida exitosamente.', 'success');
                e.target.reset(); 
                preview.style.display = 'none'; 
                document.getElementById('dropText').textContent = 'Haz clic aquí o arrastra la imagen';
                await loadEvidencias();
            } catch (err) {
                showMsg('formMsg', err.message, 'error');
            } finally {
                btn.disabled = false; 
                btn.textContent = 'Subir Fotografía';
            }
        });

        await loadEvidencias();
    }

    // ==========================================
    // PÁGINA: APROBACIONES (aprobaciones.html)
    // ==========================================
    else if (page === 'page-aprobaciones') {
        const auth = await initAuth(true);
        if (!auth) return;

        if (auth.role !== 'gerencia') {
            document.querySelector('.main-content').innerHTML = '<div class="card"><div class="card-body"><h2>Acceso Restringido</h2><p>Este módulo es exclusivo para usuarios con perfil de Gerencia.</p></div></div>';
            return;
        }

        const loadPendientes = async () => {
            const { data, error } = await supabase.from('mediciones')
                .select('id, caudal_l_s, punto_medicion, fecha_hora, observaciones, sectores(nombre)')
                .eq('estado_revision', 'pendiente')
                .order('fecha_hora', { ascending: false });
            
            const tbody = document.getElementById('aprobaciones-table');
            if (error) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }

            tbody.innerHTML = data?.length ? data.map(r => `
                <tr>
                    <td><strong>${r.sectores?.nombre || 'Sector'}</strong></td>
                    <td><span style="text-transform:uppercase; font-weight:bold;">${r.punto_medicion}</span></td>
                    <td><strong>${r.caudal_l_s}</strong> L/s</td>
                    <td>${formatDate(r.fecha_hora)}</td>
                    <td><small>${r.observaciones || 'Sin notas'}</small></td>
                    <td style="text-align:center; display:flex; gap:0.5rem; justify-content:center;">
                        <button onclick="window.aprobarRegistro('${r.id}')" class="btn btn-primary" style="padding:0.3rem 0.6rem; font-size:0.75rem;">Aprobar</button>
                        <button onclick="window.rechazarRegistro('${r.id}')" class="btn btn-outline" style="padding:0.3rem 0.6rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Rechazar</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center; padding:2rem;">No hay mediciones pendientes de revisión.</td></tr>';
        };

        window.aprobarRegistro = async (id) => {
            const { error } = await supabase.from('mediciones').update({ 
                estado_revision: 'aprobada', 
                revisado_por: auth.user.id,
                revisado_en: new Date().toISOString()
            }).eq('id', id);

            if (error) alert('Error al aprobar: ' + error.message);
            else await loadPendientes();
        };

        window.rechazarRegistro = async (id) => {
            if (!confirmAction("¿Deseas marcar este registro como 'requiere corrección'?")) return;
            const { error } = await supabase.from('mediciones').update({ 
                estado_revision: 'requiere_correccion', 
                revisado_por: auth.user.id,
                revisado_en: new Date().toISOString()
            }).eq('id', id);

            if (error) alert('Error al procesar: ' + error.message);
            else await loadPendientes();
        };

        await loadPendientes();
    }

    // ==========================================
    // PÁGINA: RESULTADOS Y AFORO DEL CANAL
    // ==========================================
    else if (page === 'page-resultados') {
        const auth = await initAuth(true);
        if (!auth) return;

        if (auth.role !== 'gerencia') {
            document.querySelector('.main-content').innerHTML = `
                <div class="card"><div class="card-body">
                    <h2>Acceso restringido</h2>
                    <p>Este módulo es exclusivo para usuarios con perfil de Gerencia.</p>
                </div></div>`;
            return;
        }

        const $ = (id) => document.getElementById(id);
        const form = $('aforoForm');
        const tbody = $('aforos-table');
        const comparacionBody = $('comparacion-table');
        const campaignSelect = $('campana_id');
        const sectorSelect = $('sector_id');

        const { data: sectores, error: sectoresError } = await supabase
            .from('sectores')
            .select('id, codigo, nombre, longitud_m, orden_canal, progresiva_inicio_m, progresiva_fin_m')
            .eq('activo', true)
            .order('codigo', { ascending: true });

        const { data: campanas, error: campanasError } = await supabase
            .from('campanas')
            .select('id, nombre, estado, fecha_inicio')
            .in('estado', ['planificada', 'en_curso'])
            .order('fecha_inicio', { ascending: false });

        if (sectoresError) {
            showMsg('formMsg', `No se pudieron cargar los sectores: ${sectoresError.message}`, 'error');
            return;
        }
        if (campanasError) {
            showMsg('formMsg', `No se pudieron cargar las campañas: ${campanasError.message}`, 'error');
            return;
        }

        const sectoresOrdenados = (sectores || []).sort((a, b) => {
            const oa = a.orden_canal ?? Number.MAX_SAFE_INTEGER;
            const ob = b.orden_canal ?? Number.MAX_SAFE_INTEGER;
            return oa - ob || String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true });
        });

        campaignSelect.innerHTML = '<option value="">Selecciona campaña...</option>' +
            (campanas || []).map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');

        sectorSelect.innerHTML = '<option value="">Selecciona sector...</option>' +
            sectoresOrdenados.map(s => {
                const progresiva = s.progresiva_inicio_m != null && s.progresiva_fin_m != null
                    ? ` · ${Number(s.progresiva_inicio_m).toFixed(2)}–${Number(s.progresiva_fin_m).toFixed(2)} m`
                    : (s.longitud_m != null ? ` · ${Number(s.longitud_m).toFixed(2)} m de longitud` : '');
                return `<option value="${s.id}">${escapeHtml(s.codigo)} - ${escapeHtml(s.nombre)}${progresiva}</option>`;
            }).join('');

        function escapeHtml(value) {
            return String(value ?? '').replace(/[&<>"']/g, ch => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[ch]));
        }

        const num = (id) => {
            const value = Number($(id).value);
            return Number.isFinite(value) ? value : 0;
        };
        const fmt = (value, digits = 2) => Number(value).toLocaleString('es-PE', {
            minimumFractionDigits: digits, maximumFractionDigits: digits
        });

        function getAforoInput() {
            return {
                ancho: num('ancho_m'),
                profundidad: num('profundidad_m'),
                distancia: num('distancia_m'),
                tiempo: num('tiempo_s'),
                coeficiente: num('coeficiente'),
                recorridos: num('cantidad_recorridos')
            };
        }

        function updateAforoPreview() {
            const d = getAforoInput();
            const valid = d.ancho > 0 && d.profundidad > 0 && d.distancia > 0 &&
                d.tiempo > 0 && d.coeficiente > 0 && d.coeficiente <= 1.2;

            if (!valid) {
                $('prev-area').textContent = '— m²';
                $('prev-velocidad').textContent = '— m/s';
                $('prev-caudal').textContent = '— L/s';
                $('prev-calidad').textContent = 'Completa los datos para calcular';
                return;
            }

            try {
                const result = CalculadoraHidrica.calcularAforoFlotador(
                    d.ancho, d.profundidad, d.distancia, d.tiempo, d.coeficiente
                );
                $('prev-area').textContent = `${fmt(result.area_m2, 3)} m²`;
                $('prev-velocidad').textContent = `${fmt(result.velocidad_media_ms, 3)} m/s`;
                $('prev-caudal').textContent = `${fmt(result.caudal_l_s)} L/s`;
                $('prev-calidad').textContent = d.recorridos >= 3
                    ? `${d.recorridos} recorridos registrados; revisar dispersión de tiempos`
                    : 'Estimación preliminar: se recomienda realizar al menos 3 recorridos';
            } catch (error) {
                $('prev-calidad').textContent = error.message;
            }
        }

        habilitarAutoGuardadoFormulario('aforoForm', updateAforoPreview);
        ['ancho_m', 'profundidad_m', 'distancia_m', 'tiempo_s', 'coeficiente', 'cantidad_recorridos']
            .forEach(id => $(id)?.addEventListener('input', updateAforoPreview));

        const loadAforos = async () => {
            const { data, error } = await supabase.from('mediciones')
                .select('id, campana_id, sector_id, punto_medicion, fecha_hora, caudal_l_s, metodo_medicion, observaciones, estado_revision, detalle_aforo, sectores(codigo, nombre, longitud_m, orden_canal)')
                .order('fecha_hora', { ascending: false });

            if (error) {
                tbody.innerHTML = `<tr><td colspan="8">Error al cargar aforos: ${escapeHtml(error.message)}</td></tr>`;
                comparacionBody.innerHTML = '';
                return;
            }

            const campaignNames = Object.fromEntries((campanas || []).map(c => [c.id, c.nombre]));
            const campaignFilter = $('filtro-campana').value;
            const selected = (data || []).filter(r => !campaignFilter || r.campana_id === campaignFilter);

            tbody.innerHTML = selected.length ? selected.map(r => `
                <tr>
                    <td><strong>${escapeHtml(r.sectores?.codigo || '—')}</strong><br><small>${escapeHtml(r.sectores?.nombre || 'Sector')}</small></td>
                    <td>${escapeHtml(campaignNames[r.campana_id] || 'Campaña')}</td>
                    <td>${fmt(r.caudal_l_s)} L/s</td>
                    <td>${r.detalle_aforo?.ancho_m != null ? `${fmt(r.detalle_aforo.ancho_m)} × ${fmt(r.detalle_aforo.profundidad_m)} m` : '—'}</td>
                    <td>${r.detalle_aforo?.distancia_m != null ? `${fmt(r.detalle_aforo.distancia_m)} m / ${fmt(r.detalle_aforo.tiempo_s)} s` : '—'}</td>
                    <td>${formatDate(r.fecha_hora)}</td>
                    <td>${getStatusChip(r.estado_revision)}</td>
                    <td style="text-align:center"><button onclick="window.eliminarAforo('${r.id}')" class="btn btn-outline btn-small">Eliminar</button></td>
                </tr>`).join('') :
                '<tr><td colspan="8" style="text-align:center;padding:1.5rem">No hay aforos registrados para esta selección.</td></tr>';

            // Comparación de lecturas del mismo canal, dentro de una misma campaña.
            // Se toma la lectura más reciente de cada sector para evitar duplicar sectores.
            const campaignForCompare = $('filtro-campana').value;
            if (!campaignForCompare) {
                comparacionBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1rem">Selecciona una campaña para comparar sus sectores.</td></tr>';
                return;
            }

            const latestBySector = new Map();
            (data || []).filter(r => r.campana_id === campaignForCompare).forEach(r => {
                const current = latestBySector.get(r.sector_id);
                if (!current || new Date(r.fecha_hora) > new Date(current.fecha_hora)) {
                    latestBySector.set(r.sector_id, r);
                }
            });

            const rows = [...latestBySector.values()].sort((a, b) => {
                const oa = a.sectores?.orden_canal ?? Number.MAX_SAFE_INTEGER;
                const ob = b.sectores?.orden_canal ?? Number.MAX_SAFE_INTEGER;
                return oa - ob || String(a.sectores?.codigo || '').localeCompare(String(b.sectores?.codigo || ''), 'es', { numeric: true });
            });

            comparacionBody.innerHTML = rows.length ? rows.map((r, index) => {
                const previous = rows[index - 1];
                const delta = previous ? Number(r.caudal_l_s) - Number(previous.caudal_l_s) : null;
                const pct = previous && Number(previous.caudal_l_s) !== 0
                    ? (delta / Number(previous.caudal_l_s)) * 100 : null;
                const variation = delta == null ? 'Punto inicial' :
                    `${delta > 0 ? '+' : ''}${fmt(delta)} L/s (${pct > 0 ? '+' : ''}${fmt(pct)}%)`;
                return `<tr>
                    <td><strong>${escapeHtml(r.sectores?.codigo || '—')}</strong> - ${escapeHtml(r.sectores?.nombre || '')}</td>
                    <td>${fmt(r.caudal_l_s)} L/s</td>
                    <td>${variation}</td>
                    <td>${formatDate(r.fecha_hora)}</td>
                    <td>${getStatusChip(r.estado_revision)}</td>
                </tr>`;
            }).join('') : '<tr><td colspan="5" style="text-align:center;padding:1rem">Todavía no hay mediciones en esta campaña.</td></tr>';
        };

        $('filtro-campana').addEventListener('change', loadAforos);

        window.eliminarAforo = async (id) => {
            if (!confirmAction('¿Deseas eliminar este aforo? Esta acción no se puede deshacer.')) return;
            const { error } = await supabase.from('mediciones').delete().eq('id', id);
            if (error) alert(`No se pudo eliminar: ${error.message}`);
            else await loadAforos();
        };

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Guardando aforo...';

            try {
                const sector = sectoresOrdenados.find(s => s.id === sectorSelect.value);
                const campaign = (campanas || []).find(c => c.id === campaignSelect.value);
                if (!sector || !campaign) throw new Error('Selecciona una campaña y un sector válidos.');

                const d = getAforoInput();
                const calc = CalculadoraHidrica.calcularAforoFlotador(
                    d.ancho, d.profundidad, d.distancia, d.tiempo, d.coeficiente
                );
                const fecha = $('fecha_hora').value || new Date().toISOString();

                const detalle = {
                    metodo: 'flotador',
                    ancho_m: d.ancho,
                    profundidad_m: d.profundidad,
                    distancia_m: d.distancia,
                    tiempo_s: d.tiempo,
                    coeficiente: d.coeficiente,
                    cantidad_recorridos: d.recorridos,
                    area_m2: calc.area_m2,
                    area_aproximada: true,
                    velocidad_superficial_ms: calc.velocidad_superficial_ms,
                    velocidad_media_ms: calc.velocidad_media_ms,
                    caudal_m3_s: calc.caudal_m3_s,
                    caudal_l_s: calc.caudal_l_s,
                    calidad: d.recorridos >= 3 ? 'revisar_repetibilidad' : 'preliminar',
                    nota_metodologica: 'Área aproximada ancho × profundidad; sección irregular no levantada mediante perfiles.'
                };

                const payload = {
                    campana_id: campaign.id,
                    sector_id: sector.id,
                    punto_medicion: $('punto_medicion').value.trim() || 'aforo_sector',
                    fecha_hora: fecha,
                    caudal_l_s: calc.caudal_l_s,
                    metodo_medicion: 'Método del flotador; estimación de velocidad media mediante coeficiente',
                    observaciones: $('observaciones').value.trim() || null,
                    registrado_por: auth.user.id,
                    estado_revision: 'pendiente',
                    detalle_aforo: detalle
                };

                const { error } = await supabase.from('mediciones').insert([payload]);
                if (error) throw error;

                showMsg('formMsg', `Aforo estimado en ${fmt(calc.caudal_l_s)} L/s y guardado para revisión.`, 'success');
                form.reset();
                $('coeficiente').value = '0.85';
                $('cantidad_recorridos').value = '1';
                $('fecha_hora').value = new Date().toISOString().slice(0, 16);
                limpiarBorradorFormulario('aforoForm');
                updateAforoPreview();
                await loadAforos();
            } catch (error) {
                showMsg('formMsg', error.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Calcular y guardar aforo';
            }
        });

        $('filtro-campana').innerHTML = '<option value="">Selecciona campaña para comparar...</option>' +
            (campanas || []).map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');

        $('fecha_hora').value = new Date().toISOString().slice(0, 16);
        await loadAforos();
        updateAforoPreview();
    }
});
