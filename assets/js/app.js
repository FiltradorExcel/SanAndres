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
                            <img src="${publicUrl}" alt="Evidencia" style="width:50px; height:50px; object-fit:cover; border-radius:6px;" onerror="this.src='assets/img/placeholder.png'">
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
    // PÁGINA: RESULTADOS (resultados.html)
    // ==========================================
    else if (page === 'page-resultados') {
        const auth = await initAuth(true);
        if (!auth) return;

        if (auth.role !== 'gerencia') {
            document.querySelector('.main-content').innerHTML = '<div class="card"><div class="card-body"><h2>Acceso Restringido</h2><p>Este módulo es exclusivo para usuarios con perfil de Gerencia.</p></div></div>';
            return;
        }

        // Cargar sectores y campañas
        const [{ data: sectores }, { data: campanas }] = await Promise.all([
            supabase.from('sectores').select('id, codigo, nombre').eq('activo', true).order('codigo'),
            supabase.from('campanas').select('id, nombre').in('estado', ['planificada', 'en_curso']).order('fecha_inicio', { ascending: false })
        ]);

        document.getElementById('sector_id').innerHTML = '<option value="">Selecciona sector...</option>' + 
            (sectores || []).map(s => `<option value="${s.id}">${s.codigo} - ${s.nombre}</option>`).join('');
            
        document.getElementById('campana_id').innerHTML = '<option value="">Selecciona campaña...</option>' + 
            (campanas || []).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

        // Cálculo dinámico en tiempo real
        const updatePreview = () => {
            const qIn = parseFloat(document.getElementById('caudal_entrada').value) || 0;
            const qOut = parseFloat(document.getElementById('caudal_salida').value) || 0;
            const qDer = parseFloat(document.getElementById('caudal_derivado').value) || 0;

            if (qIn > 0) {
                try {
                    const res = CalculadoraHidrica.calcularIndicadores(qIn, qOut, qDer);
                    document.getElementById('prev-dif-aparente').textContent = `${res.diferenciaAparente_ls} L/s`;
                    document.getElementById('prev-dif-ajustada').textContent = `${res.diferenciaAjustada_ls} L/s`;
                    document.getElementById('prev-eficiencia').textContent = `${res.eficienciaAparente_pct}%`;
                } catch (err) {
                    // Mantener ceros si la entrada no es válida
                }
            }
        };

        // Activar borrador temporal y actualizar la vista previa al restaurar datos
        habilitarAutoGuardadoFormulario('resultadoForm', updatePreview);

        ['caudal_entrada', 'caudal_salida', 'caudal_derivado'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updatePreview);
        });

        // Cargar historial de resultados
        const loadResultados = async () => {
            const { data, error } = await supabase.from('resultados_calculo')
                .select('id, caudal_entrada_l_s, caudal_salida_l_s, caudal_derivado_l_s, eficiencia_aparente_pct, estado_revision, sectores(nombre)')
                .order('calculado_en', { ascending: false });

            const tbody = document.getElementById('resultados-table');
            if (error) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }

            tbody.innerHTML = data?.length ? data.map(r => `
                <tr>
                    <td><strong>${r.sectores?.nombre || 'N/A'}</strong></td>
                    <td>${r.caudal_entrada_l_s} L/s</td>
                    <td>${r.caudal_salida_l_s} L/s</td>
                    <td>${r.caudal_derivado_l_s} L/s</td>
                    <td><strong style="color:var(--primary); font-size:1rem;">${r.eficiencia_aparente_pct}%</strong></td>
                    <td>${getStatusChip(r.estado_revision)}</td>
                    <td style="text-align:center;">
                        <button onclick="window.eliminarResultado('${r.id}')" class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Eliminar</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="7" style="text-align:center; padding:2rem;">No hay cálculos guardados.</td></tr>';
        };

        window.eliminarResultado = async (id) => {
            if (!confirmAction("¿Deseas eliminar este cálculo guardado de la base de datos?")) return;
            const { error } = await supabase.from('resultados_calculo').delete().eq('id', id);
            if (error) alert("Error al eliminar resultado: " + error.message);
            else await loadResultados();
        };

        document.getElementById('resultadoForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true; 
            btn.textContent = 'Procesando...';

            try {
                const qIn = parseFloat(document.getElementById('caudal_entrada').value);
                const qOut = parseFloat(document.getElementById('caudal_salida').value);
                const qDer = parseFloat(document.getElementById('caudal_derivado').value) || 0;

                const calc = CalculadoraHidrica.calcularIndicadores(qIn, qOut, qDer);

                const payload = {
                    campana_id: document.getElementById('campana_id').value,
                    sector_id: document.getElementById('sector_id').value,
                    caudal_entrada_l_s: qIn,
                    caudal_salida_l_s: qOut,
                    caudal_derivado_l_s: qDer,
                    diferencia_aparente_l_s: calc.diferenciaAparente_ls,
                    diferencia_ajustada_l_s: calc.diferenciaAjustada_ls,
                    diferencia_porcentual: calc.diferenciaPorcentual,
                    eficiencia_aparente_pct: calc.eficienciaAparente_pct,
                    notas_metodologicas: document.getElementById('notas_metodologicas').value.trim() || null,
                    calculado_por: auth.user.id,
                    estado_revision: 'aprobado'
                };

                const { error } = await supabase.from('resultados_calculo').insert([payload]);
                if (error) throw error;

                showMsg('formMsg', 'Cálculo de eficiencia evaluado y guardado con éxito.', 'success');
                e.target.reset();
                limpiarBorradorFormulario('resultadoForm');
                updatePreview();
                await loadResultados();
            } catch (err) {
                showMsg('formMsg', err.message, 'error');
            } finally {
                btn.disabled = false; 
                btn.textContent = 'Guardar Resultado Evaluado';
            }
        });

        await loadResultados();
    }
});
