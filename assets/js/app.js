// assets/js/app.js - Router principal completo del sistema SAGUA
import { initAuth, login } from './modules/auth.js';
import { supabase } from './modules/config.js';
import { showMsg, formatDate, getStatusChip, confirmAction } from './modules/ui.js';
import { CalculadoraHidrica } from './modules/calculadora.js';

const TTL_20_MINUTOS = 20 * 60 * 1000;

function obtenerFechaLocalISO() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const d = String(hoy.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function fmt(value, digits = 2) {
    return Number(value).toLocaleString('es-PE', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function formatearResumenAforo(detalle) {
    if (!detalle || typeof detalle !== 'object') return 'Registro simple';
    if (detalle.metodo === 'flotador') {
        const rec = detalle.cantidad_recorridos || 1;
        return `Flotador: ${fmt(detalle.ancho_m)}×${fmt(detalle.profundidad_m)} m · ${fmt(detalle.distancia_m)} m / ${fmt(detalle.tiempo_s)} s (c=${detalle.coeficiente}, ${rec} rec.)`;
    }
    return `Directo: ${escapeHtml(detalle.instrumento || 'Instrumental')}`;
}

function habilitarAutoGuardadoFormulario(formId, alRestaurarCallback) {
    const form = document.getElementById(formId);
    if (!form) return;
    const claveStorage = `sagua_borrador_${formId}`;

    try {
        const borradorGuardado = localStorage.getItem(claveStorage);
        if (borradorGuardado) {
            const { timestamp, datos } = JSON.parse(borradorGuardado);
            if (Date.now() - timestamp < TTL_20_MINUTOS) {
                Object.keys(datos).forEach(idCampo => {
                    const campo = form.querySelector(`#${idCampo}`);
                    if (!campo) return;
                    if (campo.tagName === 'SELECT') {
                        const existeOpcion = Array.from(campo.options).some(opt => opt.value === datos[idCampo]);
                        if (existeOpcion) campo.value = datos[idCampo];
                    } else {
                        campo.value = datos[idCampo];
                    }
                });
                if (typeof alRestaurarCallback === 'function') alRestaurarCallback();
            } else {
                localStorage.removeItem(claveStorage);
            }
        }
    } catch {
        localStorage.removeItem(claveStorage);
    }

    form.addEventListener('input', () => {
        const datos = {};
        form.querySelectorAll('input, select, textarea').forEach(campo => {
            if (campo.id && campo.type !== 'password' && campo.type !== 'file') {
                datos[campo.id] = campo.value;
            }
        });
        localStorage.setItem(claveStorage, JSON.stringify({ timestamp: Date.now(), datos }));
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

        const loadStats = async () => {
            const [{ count: cSec }, { count: cMed }, { count: cPend }] = await Promise.all([
                supabase.from('sectores').select('*', { count: 'exact', head: true }).eq('activo', true),
                supabase.from('mediciones').select('*', { count: 'exact', head: true }),
                supabase.from('mediciones').select('*', { count: 'exact', head: true }).eq('estado_revision', 'pendiente')
            ]);
            document.getElementById('c-sectores').textContent = cSec || 0;
            document.getElementById('c-mediciones').textContent = cMed || 0;
            document.getElementById('c-pendientes').textContent = cPend || 0;
        };

        const loadRecent = async () => {
            const { data: recents } = await supabase.from('mediciones')
                .select('id, caudal_l_s, punto_medicion, fecha_hora, estado_revision, sectores(nombre)')
                .order('fecha_hora', { ascending: false })
                .limit(5);

            const tbody = document.getElementById('recent-table');
            tbody.innerHTML = recents?.length ? recents.map(r => `
                <tr>
                    <td><strong>${escapeHtml(r.sectores?.nombre || 'N/A')}</strong></td>
                    <td><span style="text-transform:uppercase; font-size:0.8rem; color:#718096; font-weight:bold">${escapeHtml(r.punto_medicion)}</span></td>
                    <td><strong>${fmt(r.caudal_l_s)}</strong> L/s</td>
                    <td>${formatDate(r.fecha_hora)}</td>
                    <td>${getStatusChip(r.estado_revision)}</td>
                    <td style="text-align:center;">
                        <button onclick="window.eliminarMedicionDashboard('${r.id}')" class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Eliminar</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center; padding:1.5rem;">No hay registros recientes.</td></tr>';
        };

        window.eliminarMedicionDashboard = async (id) => {
            if (!confirmAction('¿Deseas eliminar este registro de medición?')) return;
            const { error } = await supabase.from('mediciones').delete().eq('id', id);
            if (error) alert('Error al eliminar: ' + error.message);
            else await Promise.all([loadStats(), loadRecent()]);
        };

        await Promise.all([loadStats(), loadRecent()]);
    }

   // ==========================================
    // PÁGINA: MEDICIONES Y CALCULADORA (mediciones.html)
    // ==========================================
    else if (page === 'page-mediciones') {
        const auth = await initAuth(true);
        if (!auth) return;

        const $ = (id) => document.getElementById(id);

        const [{ data: sectores }, { data: campanas }] = await Promise.all([
            supabase.from('sectores').select('id, codigo, nombre, orden_canal').eq('activo', true).order('codigo'),
            supabase.from('campanas').select('id, nombre, estado, fecha_fin').in('estado', ['planificada', 'en_curso']).order('fecha_inicio', { ascending: false })
        ]);

        const hoy = obtenerFechaLocalISO();
        const vencidasIds = (campanas || [])
            .filter(c => c.fecha_fin && c.fecha_fin < hoy)
            .map(c => c.id);

        if (vencidasIds.length > 0) {
            await supabase.from('campanas').update({ estado: 'cerrada' }).in('id', vencidasIds);
        }

        const campanasVigentes = (campanas || []).filter(c => !vencidasIds.includes(c.id));

        const sectoresOrdenados = (sectores || []).sort((a, b) => {
            const oa = a.orden_canal ?? Number.MAX_SAFE_INTEGER;
            const ob = b.orden_canal ?? Number.MAX_SAFE_INTEGER;
            return oa - ob || String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true });
        });

        $('sector_id').innerHTML = '<option value="">Selecciona sector...</option>' +
            sectoresOrdenados.map(s => `<option value="${s.id}">${escapeHtml(s.codigo)} - ${escapeHtml(s.nombre)}</option>`).join('');

        $('campana_id').innerHTML = campanasVigentes.length
            ? '<option value="">Selecciona campaña...</option>' +
              campanasVigentes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('')
            : '<option value="">No hay campañas activas (crea una en Sectores y Campañas)</option>';

        // Cambio de modo: Flotador vs Lectura Directa
        const aplicarModo = (modo) => {
            $('modo_registro').value = modo;
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === modo));
            $('bloque-flotador').style.display = modo === 'flotador' ? 'flex' : 'none';
            $('bloque-directo').style.display = modo === 'directo' ? 'flex' : 'none';
        };

        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => aplicarModo(btn.dataset.mode));
        });

        // Vista previa en tiempo real del aforo por flotador
        const updateAforoPreview = () => {
            const ancho = Number($('ancho_m').value);
            const profundidad = Number($('profundidad_m').value);
            const distancia = Number($('distancia_m').value);
            const coeficiente = Number($('coeficiente').value);
            const tiemposRaw = $('tiempos_s').value.trim();

            if (!(ancho > 0 && profundidad > 0 && distancia > 0 && coeficiente > 0 && coeficiente <= 1.2 && tiemposRaw)) {
                $('prev-area').textContent = '— m²';
                $('prev-velocidad').textContent = '— m/s';
                $('prev-caudal').textContent = '— L/s';
                $('prev-calidad').textContent = 'Completa dimensiones y tiempos para calcular.';
                return;
            }

            try {
                const analisisTiempos = CalculadoraHidrica.analizarTiempos(tiemposRaw);
                const result = CalculadoraHidrica.calcularAforoFlotador(
                    ancho, profundidad, distancia, analisisTiempos.tiempo_promedio_s, coeficiente
                );

                $('prev-area').textContent = `${fmt(result.area_m2, 3)} m²`;
                $('prev-velocidad').textContent = `${fmt(result.velocidad_media_ms, 3)} m/s`;
                $('prev-caudal').textContent = `${fmt(result.caudal_l_s)} L/s`;

                if (analisisTiempos.cantidad_recorridos < 3) {
                    $('prev-calidad').textContent = `Tiempo prom: ${analisisTiempos.tiempo_promedio_s} s (${analisisTiempos.cantidad_recorridos} recorrido). Se recomiendan al menos 3 recorridos.`;
                } else if (analisisTiempos.dispersion_pct > 15) {
                    $('prev-calidad').textContent = `Alerta: dispersión alta entre tiempos (${analisisTiempos.dispersion_pct}%). Verifica el flujo antes de guardar.`;
                } else {
                    $('prev-calidad').textContent = `Calidad aceptable: ${analisisTiempos.cantidad_recorridos} recorridos (prom: ${analisisTiempos.tiempo_promedio_s} s, dispersión: ${analisisTiempos.dispersion_pct}%).`;
                }
            } catch (err) {
                $('prev-calidad').textContent = err.message;
            }
        };

        ['ancho_m', 'profundidad_m', 'distancia_m', 'tiempos_s', 'coeficiente'].forEach(id => {
            $(id)?.addEventListener('input', updateAforoPreview);
        });

        habilitarAutoGuardadoFormulario('medicionForm', () => {
            aplicarModo($('modo_registro').value || 'flotador');
            updateAforoPreview();
        });

        const loadMediciones = async () => {
            const { data, error } = await supabase.from('mediciones')
                .select('id, caudal_l_s, punto_medicion, fecha_hora, estado_revision, detalle_aforo, sectores(codigo, nombre)')
                .order('fecha_hora', { ascending: false });

            const tbody = $('mediciones-table');
            if (error) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Error: ${escapeHtml(error.message)}</td></tr>`;
                return;
            }

            tbody.innerHTML = data?.length ? data.map(m => {
                const ref = m.detalle_aforo?.referencia_punto ? ` · ${escapeHtml(m.detalle_aforo.referencia_punto)}` : '';
                return `
                    <tr>
                        <td>
                            <strong>${escapeHtml(m.sectores?.codigo || '—')} - ${escapeHtml(m.sectores?.nombre || 'N/A')}</strong><br>
                            <small style="color:var(--text-muted); text-transform:uppercase;">${escapeHtml(m.punto_medicion)}</small><small style="color:var(--text-muted);">${ref}</small>
                        </td>
                        <td><strong>${fmt(m.caudal_l_s)}</strong> L/s</td>
                        <td><small>${formatearResumenAforo(m.detalle_aforo)}</small></td>
                        <td>${formatDate(m.fecha_hora)}</td>
                        <td>${getStatusChip(m.estado_revision)}</td>
                        <td style="text-align:center;">
                            <button onclick="window.eliminarMedicion('${m.id}')" class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Eliminar</button>
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="6" style="text-align:center; padding:2rem;">No hay mediciones registradas.</td></tr>';
        };

        window.eliminarMedicion = async (id) => {
            if (!confirmAction('¿Confirmas la eliminación de esta medición de caudal?')) return;
            const { error } = await supabase.from('mediciones').delete().eq('id', id);
            if (error) alert('No se pudo eliminar la medición: ' + error.message);
            else await loadMediciones();
        };

        $('medicionForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Guardando...';

            try {
                const modo = $('modo_registro').value;
                const campanaId = $('campana_id').value;
                const sectorId = $('sector_id').value;
                const punto = $('punto_medicion').value;
                const referenciaPunto = $('referencia_punto').value.trim() || null;

                const puntosPermitidos = ['entrada', 'salida', 'intermedio', 'otro'];
                if (!campanaId || !sectorId || !puntosPermitidos.includes(punto)) {
                    throw new Error('Selecciona una campaña, un sector y un tipo de punto válido.');
                }

                let caudalFinal = 0;
                let metodoTexto = '';
                let detalleAforo = null;

                if (modo === 'flotador') {
                    const ancho = Number($('ancho_m').value);
                    const profundidad = Number($('profundidad_m').value);
                    const distancia = Number($('distancia_m').value);
                    const coeficiente = Number($('coeficiente').value);
                    const analisisTiempos = CalculadoraHidrica.analizarTiempos($('tiempos_s').value);
                    const calc = CalculadoraHidrica.calcularAforoFlotador(
                        ancho, profundidad, distancia, analisisTiempos.tiempo_promedio_s, coeficiente
                    );

                    caudalFinal = calc.caudal_l_s;
                    metodoTexto = 'Método del flotador con corrección de velocidad media';
                    detalleAforo = {
                        metodo: 'flotador',
                        referencia_punto: referenciaPunto,
                        ancho_m: ancho,
                        profundidad_m: profundidad,
                        distancia_m: distancia,
                        tiempos_s: analisisTiempos.tiempos,
                        tiempo_s: analisisTiempos.tiempo_promedio_s,
                        dispersion_pct: analisisTiempos.dispersion_pct,
                        cantidad_recorridos: analisisTiempos.cantidad_recorridos,
                        coeficiente,
                        area_m2: calc.area_m2,
                        velocidad_superficial_ms: calc.velocidad_superficial_ms,
                        velocidad_media_ms: calc.velocidad_media_ms,
                        caudal_m3_s: calc.caudal_m3_s,
                        caudal_l_s: calc.caudal_l_s,
                        calidad: analisisTiempos.cantidad_recorridos >= 3 && analisisTiempos.dispersion_pct <= 15
                            ? 'validable' : 'preliminar'
                    };
                } else {
                    caudalFinal = Number($('caudal_directo').value);
                    const instrumento = $('instrumento_directo').value.trim();
                    if (!Number.isFinite(caudalFinal) || caudalFinal <= 0 || !instrumento) {
                        throw new Error('Ingresa un caudal mayor a cero y especifica el instrumento utilizado.');
                    }
                    metodoTexto = `Aforo directo (${instrumento})`;
                    detalleAforo = {
                        metodo: 'directo',
                        referencia_punto: referenciaPunto,
                        instrumento,
                        caudal_l_s: caudalFinal
                    };
                }

                const payload = {
                    campana_id: campanaId,
                    sector_id: sectorId,
                    punto_medicion: punto,
                    fecha_hora: $('fecha_hora').value || new Date().toISOString(),
                    caudal_l_s: caudalFinal,
                    metodo_medicion: metodoTexto,
                    observaciones: $('observaciones').value.trim() || null,
                    registrado_por: auth.user.id,
                    estado_revision: 'pendiente',
                    detalle_aforo: detalleAforo
                };

                const { error } = await supabase.from('mediciones').insert([payload]);
                if (error) throw error;

                showMsg('formMsg', `Medición (${fmt(caudalFinal)} L/s) registrada y enviada a aprobación.`, 'success');
                e.target.reset();
                $('punto_medicion').value = 'intermedio';
                $('distancia_m').value = '20.00';
                $('coeficiente').value = '0.85';
                $('fecha_hora').value = new Date().toISOString().slice(0, 16);
                aplicarModo('flotador');
                limpiarBorradorFormulario('medicionForm');
                updateAforoPreview();
                await loadMediciones();
            } catch (err) {
                showMsg('formMsg', err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Guardar Medición para Revisión';
            }
        });

        $('fecha_hora').value = new Date().toISOString().slice(0, 16);
        await loadMediciones();
        updateAforoPreview();
    }

    // ==========================================
    // PÁGINA: SECTORES Y CAMPAÑAS (sectores.html)
    // ==========================================
    else if (page === 'page-sectores') {
        const auth = await initAuth(true);
        if (!auth) return;

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
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Error: ${escapeHtml(error.message)}</td></tr>`;
                return;
            }
            tbody.innerHTML = data?.length ? data.map(s => `
                <tr>
                    <td><strong>${escapeHtml(s.codigo)}</strong><br><small>${escapeHtml(s.nombre)}</small></td>
                    <td>${s.longitud_m ? s.longitud_m + ' m' : '—'}</td>
                    <td><span style="text-transform:capitalize;">${escapeHtml(s.tipo_revestimiento.replace(/_/g, ' '))}</span></td>
                    <td>${getStatusChip(s.estado_infraestructura)}</td>
                    <td style="text-align:center;">
                        <button onclick="window.eliminarSector('${s.id}')" class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Eliminar</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="5" style="text-align:center; padding:2rem;">No hay sectores registrados.</td></tr>';
        };

        window.eliminarSector = async (id) => {
            if (!confirmAction('¿Deseas deshabilitar este sector del sistema?')) return;
            const { error } = await supabase.from('sectores').update({ activo: false }).eq('id', id);
            if (error) alert('No se pudo eliminar el sector: ' + error.message);
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

        // --- 2. LÓGICA DE CAMPAÑAS (AUTO-CIERRE + CONTROL MANUAL) ---
        const loadCampanas = async () => {
            const { data, error } = await supabase.from('campanas')
                .select('id, nombre, fecha_inicio, fecha_fin, estado')
                .order('fecha_inicio', { ascending: false });

            const tbody = document.getElementById('campanas-table');
            if (error) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Error: ${escapeHtml(error.message)}</td></tr>`;
                return;
            }

            const hoy = obtenerFechaLocalISO();
            const campanas = data || [];

            // Cerrar automáticamente campañas cuya fecha_fin ya venció
            const vencidasIds = campanas
                .filter(c => c.estado !== 'cerrada' && c.fecha_fin && c.fecha_fin < hoy)
                .map(c => c.id);

            if (vencidasIds.length > 0) {
                const { error: autoCloseErr } = await supabase
                    .from('campanas')
                    .update({ estado: 'cerrada' })
                    .in('id', vencidasIds);

                if (!autoCloseErr) {
                    campanas.forEach(c => {
                        if (vencidasIds.includes(c.id)) c.estado = 'cerrada';
                    });
                }
            }

            tbody.innerHTML = campanas.length ? campanas.map(c => {
                let botonesEstado = '';

                if (c.estado === 'planificada') {
                    botonesEstado = `
                        <button onclick="window.cambiarEstadoCampana('${c.id}', 'en_curso', '${c.fecha_fin || ''}')" class="btn btn-primary" style="padding:0.25rem 0.55rem; font-size:0.75rem;">Iniciar</button>
                        <button onclick="window.cambiarEstadoCampana('${c.id}', 'cerrada', '${c.fecha_fin || ''}')" class="btn btn-outline" style="padding:0.25rem 0.55rem; font-size:0.75rem;">Cerrar</button>
                    `;
                } else if (c.estado === 'en_curso') {
                    botonesEstado = `
                        <button onclick="window.cambiarEstadoCampana('${c.id}', 'cerrada', '${c.fecha_fin || ''}')" class="btn btn-outline" style="padding:0.25rem 0.55rem; font-size:0.75rem; color:var(--warning); border-color:#fde68a;">Cerrar</button>
                    `;
                } else if (c.estado === 'cerrada') {
                    botonesEstado = `
                        <button onclick="window.cambiarEstadoCampana('${c.id}', 'en_curso', '${c.fecha_fin || ''}')" class="btn btn-outline" style="padding:0.25rem 0.55rem; font-size:0.75rem;">Reabrir</button>
                    `;
                }

                return `
                    <tr>
                        <td><strong>${escapeHtml(c.nombre)}</strong></td>
                        <td>${c.fecha_inicio || '—'}</td>
                        <td>${c.fecha_fin || (c.estado === 'cerrada' ? 'Cerrada manualmente' : 'Sin fecha límite')}</td>
                        <td>${getStatusChip(c.estado)}</td>
                        <td style="text-align:center; display:flex; gap:0.4rem; justify-content:center; flex-wrap:wrap;">
                            ${botonesEstado}
                            <button onclick="window.eliminarCampana('${c.id}')" class="btn btn-outline" style="padding:0.25rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Eliminar</button>
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="5" style="text-align:center; padding:2rem;">No hay campañas registradas.</td></tr>';
        };

        window.cambiarEstadoCampana = async (id, nuevoEstado, fechaFinActual) => {
            const hoy = obtenerFechaLocalISO();
            const mensajes = {
                en_curso: '¿Deseas activar esta campaña para habilitar el registro de mediciones?',
                cerrada: '¿Deseas cerrar esta campaña? Ya no se podrán registrar nuevas mediciones en ella.'
            };
            if (!confirmAction(mensajes[nuevoEstado] || '¿Confirmas el cambio de estado?')) return;

            const actualizacion = { estado: nuevoEstado };

            if (nuevoEstado === 'cerrada' && !fechaFinActual) {
                actualizacion.fecha_fin = hoy;
            } else if (nuevoEstado === 'en_curso' && fechaFinActual && fechaFinActual < hoy) {
                actualizacion.fecha_fin = null;
            }

            const { error } = await supabase.from('campanas').update(actualizacion).eq('id', id);
            if (error) alert('No se pudo actualizar el estado: ' + error.message);
            else await loadCampanas();
        };

        window.eliminarCampana = async (id) => {
            if (!confirmAction('¿Deseas eliminar esta campaña?')) return;
            const { error } = await supabase.from('campanas').delete().eq('id', id);
            if (error) alert('No se pudo eliminar la campaña: ' + error.message);
            else await loadCampanas();
        };

        document.getElementById('campanaForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.textContent = 'Creando...';

            try {
                const fechaInicio = document.getElementById('fecha_inicio').value;
                let fechaFin = document.getElementById('fecha_fin').value || null;
                let estado = document.getElementById('estado_campana').value;
                const hoy = obtenerFechaLocalISO();

                if (fechaFin && fechaFin < fechaInicio) {
                    throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio.');
                }

                if (fechaFin && fechaFin < hoy && estado !== 'cerrada') {
                    estado = 'cerrada';
                } else if (estado === 'cerrada' && !fechaFin) {
                    fechaFin = hoy;
                }

                const payload = {
                    nombre: document.getElementById('nombre_campana').value.trim(),
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin,
                    estado,
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
            (sectores || []).map(s => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('');

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
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Error: ${escapeHtml(error.message)}</td></tr>`;
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
                            <strong>${escapeHtml(item.sectores?.nombre || 'Sector')}</strong><br>
                            <small style="color:var(--text-muted);">${escapeHtml(item.descripcion || 'Sin descripción')}</small>
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
            if (!confirmAction('¿Deseas eliminar permanentemente esta evidencia fotográfica?')) return;
            await supabase.storage.from('canal-evidencias').remove([rutaArchivo]);
            const { error: dbError } = await supabase.from('archivos_sector').delete().eq('id', id);
            if (dbError) alert('Error al eliminar registro: ' + dbError.message);
            else await loadEvidencias();
        };

        document.getElementById('evidenciaForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('button');
            const file = fileInput.files[0];
            const sectorId = document.getElementById('sector_id').value;

            if (!file || !sectorId) return showMsg('formMsg', 'Debes seleccionar un sector y una imagen.', 'error');

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
                .select('id, caudal_l_s, punto_medicion, fecha_hora, observaciones, detalle_aforo, sectores(codigo, nombre), campanas(nombre)')
                .eq('estado_revision', 'pendiente')
                .order('fecha_hora', { ascending: false });

            const tbody = document.getElementById('aprobaciones-table');
            if (error) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Error: ${escapeHtml(error.message)}</td></tr>`;
                return;
            }

            tbody.innerHTML = data?.length ? data.map(r => `
                <tr>
                    <td>
                        <strong>${escapeHtml(r.sectores?.codigo || '')} ${escapeHtml(r.sectores?.nombre || 'Sector')}</strong><br>
                        <small style="color:var(--text-muted);">${escapeHtml(r.campanas?.nombre || 'Campaña')}</small>
                    </td>
                    <td><span style="text-transform:uppercase; font-weight:bold;">${escapeHtml(r.punto_medicion)}</span></td>
                    <td>
                        <strong>${fmt(r.caudal_l_s)} L/s</strong><br>
                        <small style="color:var(--text-muted);">${formatearResumenAforo(r.detalle_aforo)}</small>
                    </td>
                    <td>${formatDate(r.fecha_hora)}</td>
                    <td><small>${escapeHtml(r.observaciones || 'Sin notas')}</small></td>
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
    // PÁGINA: ANÁLISIS DEL CANAL (resultados.html)
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
        const filtroCampana = $('filtro-campana');
        const checkSoloAprobadas = $('solo-aprobadas');
        const comparacionBody = $('comparacion-table');
        const aforosBody = $('aforos-table');

        const { data: campanas, error: campError } = await supabase
            .from('campanas')
            .select('id, nombre, estado, fecha_inicio')
            .order('fecha_inicio', { ascending: false });

        if (campError) {
            comparacionBody.innerHTML = `<tr><td colspan="6">Error al cargar campañas: ${escapeHtml(campError.message)}</td></tr>`;
            return;
        }

        filtroCampana.innerHTML = (campanas || []).length
            ? campanas.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)} (${c.estado})</option>`).join('')
            : '<option value="">No hay campañas registradas</option>';

        const activa = (campanas || []).find(c => c.estado === 'en_curso');
        if (activa) filtroCampana.value = activa.id;

        const renderAnalisis = async () => {
            const campanaId = filtroCampana.value;
            const soloAprobadas = checkSoloAprobadas.checked;

            if (!campanaId) {
                comparacionBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;">Selecciona una campaña.</td></tr>';
                aforosBody.innerHTML = '';
                return;
            }

            const { data, error } = await supabase.from('mediciones')
                .select('id, campana_id, sector_id, punto_medicion, fecha_hora, caudal_l_s, estado_revision, detalle_aforo, sectores(codigo, nombre, orden_canal)')
                .eq('campana_id', campanaId)
                .order('fecha_hora', { ascending: false });

            if (error) {
                comparacionBody.innerHTML = `<tr><td colspan="6">Error: ${escapeHtml(error.message)}</td></tr>`;
                return;
            }

            const registrosCampana = data || [];

            aforosBody.innerHTML = registrosCampana.length ? registrosCampana.map(r => `
                <tr>
                    <td><strong>${escapeHtml(r.sectores?.codigo || '—')}</strong> - ${escapeHtml(r.sectores?.nombre || '')}</td>
                    <td>${escapeHtml(r.punto_medicion)}</td>
                    <td><strong>${fmt(r.caudal_l_s)} L/s</strong></td>
                    <td>${r.detalle_aforo?.ancho_m != null ? `${fmt(r.detalle_aforo.ancho_m)} × ${fmt(r.detalle_aforo.profundidad_m)} m` : '—'}</td>
                    <td>${r.detalle_aforo?.velocidad_media_ms != null ? `${fmt(r.detalle_aforo.velocidad_media_ms, 3)} m/s (${r.detalle_aforo.cantidad_recorridos || 1} rec.)` : 'Directo'}</td>
                    <td>${formatDate(r.fecha_hora)}</td>
                    <td>${getStatusChip(r.estado_revision)}</td>
                </tr>
            `).join('') : '<tr><td colspan="7" style="text-align:center;padding:1.5rem;">Sin registros en esta campaña.</td></tr>';

            const validosParaAnalisis = registrosCampana.filter(r =>
                soloAprobadas ? r.estado_revision === 'aprobada' : r.estado_revision !== 'requiere_correccion'
            );

            const latestBySector = new Map();
            validosParaAnalisis.forEach(r => {
                const actual = latestBySector.get(r.sector_id);
                if (!actual || new Date(r.fecha_hora) > new Date(actual.fecha_hora)) {
                    latestBySector.set(r.sector_id, r);
                }
            });

            const rows = [...latestBySector.values()].sort((a, b) => {
                const oa = a.sectores?.orden_canal ?? Number.MAX_SAFE_INTEGER;
                const ob = b.sectores?.orden_canal ?? Number.MAX_SAFE_INTEGER;
                return oa - ob || String(a.sectores?.codigo || '').localeCompare(String(b.sectores?.codigo || ''), 'es', { numeric: true });
            });

            if (rows.length >= 1) {
                const qIni = Number(rows[0].caudal_l_s);
                const qFin = Number(rows[rows.length - 1].caudal_l_s);
                $('kpi-q-inicial').textContent = `${fmt(qIni)} L/s`;
                $('kpi-q-final').textContent = `${fmt(qFin)} L/s`;

                if (rows.length >= 2) {
                    const comp = CalculadoraHidrica.compararCaudales(qIni, qFin);
                    const signo = comp.diferencia_ls > 0 ? '+' : '';
                    $('kpi-variacion-total').textContent = `${signo}${fmt(comp.diferencia_ls)} L/s (${signo}${fmt(comp.variacion_pct)}%)`;
                } else {
                    $('kpi-variacion-total').textContent = 'Requiere ≥ 2 sectores';
                }
            } else {
                $('kpi-q-inicial').textContent = '— L/s';
                $('kpi-q-final').textContent = '— L/s';
                $('kpi-variacion-total').textContent = '—';
            }

            comparacionBody.innerHTML = rows.length ? rows.map((r, index) => {
                const anterior = rows[index - 1];
                let variacionTexto = 'Punto inicial del tramo';
                if (anterior) {
                    const comp = CalculadoraHidrica.compararCaudales(Number(anterior.caudal_l_s), Number(r.caudal_l_s));
                    const signo = comp.diferencia_ls > 0 ? '+' : '';
                    variacionTexto = `${signo}${fmt(comp.diferencia_ls)} L/s (${signo}${fmt(comp.variacion_pct)}%)`;
                }

                return `<tr>
                    <td><strong>${escapeHtml(r.sectores?.codigo || '—')}</strong> - ${escapeHtml(r.sectores?.nombre || '')}</td>
                    <td><strong>${fmt(r.caudal_l_s)} L/s</strong></td>
                    <td>${variacionTexto}</td>
                    <td><small>${formatearResumenAforo(r.detalle_aforo)}</small></td>
                    <td>${formatDate(r.fecha_hora)}</td>
                    <td>${getStatusChip(r.estado_revision)}</td>
                </tr>`;
            }).join('') : `<tr><td colspan="6" style="text-align:center;padding:1.5rem;">No hay mediciones ${soloAprobadas ? 'aprobadas' : 'disponibles'} para comparar en esta campaña.</td></tr>`;
        };

        filtroCampana.addEventListener('change', renderAnalisis);
        checkSoloAprobadas.addEventListener('change', renderAnalisis);
        await renderAnalisis();
    }
});
