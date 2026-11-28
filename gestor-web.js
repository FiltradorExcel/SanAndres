import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// CONFIGURACIÓN SUPABASE
// ==========================================
const SUPABASE_URL = "https://fchcuzbqhmptbazyfzfc.supabase.co";
const SUPABASE_KEY = "sb_publishable_D7nmdaIOySv4XL0h6Ho9Eg_TnPF1zjq";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Imágenes vectoriales inline de respaldo (evitan iconos rotos o 404)
const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='%23cbd5e1'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";
const DEFAULT_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Crect width='24' height='24' fill='%23f1f5f9'/%3E%3Cpath d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'/%3E%3C/svg%3E";

// ==========================================
// UTILIDADES (UI, Archivos y Vistas Previas)
// ==========================================
const showLoader = () => document.getElementById('globalLoader')?.classList.add('show');
const hideLoader = () => document.getElementById('globalLoader')?.classList.remove('show');

function showToast(mensaje, tipo = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.textContent = mensaje;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function confirmAction(mensaje) {
    return window.confirm(mensaje);
}

// Limpia tildes, espacios y caracteres especiales para evitar InvalidKey en Supabase
function sanitizarNombreArchivo(prefijo, nombreOriginal) {
    const partes = nombreOriginal.split('.');
    const ext = partes.length > 1 ? partes.pop().toLowerCase().replace(/[^a-z0-9]/g, '') : 'jpg';
    const base = partes.join('.')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 40);
    return `${prefijo}_${Date.now()}_${base || 'archivo'}.${ext}`;
}

function validarImagen(file) {
    if (!file) return true;
    if (!file.type.startsWith('image/')) {
        throw new Error("El archivo seleccionado no es una imagen válida.");
    }
    if (file.size > MAX_FILE_SIZE) {
        throw new Error("La imagen supera el límite permitido de 5 MB.");
    }
    return true;
}

// Vista previa inmediata al seleccionar un archivo desde la PC/celular
function vincularVistaPrevia(inputId, imgId) {
    const input = document.getElementById(inputId);
    const img = document.getElementById(imgId);
    if (!input || !img) return;

    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            validarImagen(file);
            const objectUrl = URL.createObjectURL(file);
            img.src = objectUrl;
            img.classList.remove('hidden');
            img.style.display = 'block';
        } catch (err) {
            showToast(err.message, 'error');
            input.value = '';
        }
    });
}

function ocultarVistaPrevia(imgId) {
    const img = document.getElementById(imgId);
    if (!img) return;
    img.src = '';
    img.classList.add('hidden');
    img.style.display = 'none';
}

// ==========================================
// NAVEGACIÓN (TABS) Y MENÚ DE USUARIO
// ==========================================
document.querySelectorAll('.nav-item[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item[data-target]').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.target);
        if (target) target.classList.add('active');
    });
});

const userWidget = document.getElementById('userMenuBtn');
if (userWidget) {
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn';
    logoutBtn.textContent = 'Cerrar Sesión';
    const dropdown = document.createElement('div');
    dropdown.className = 'user-dropdown-menu';
    dropdown.appendChild(logoutBtn);
    userWidget.appendChild(dropdown);

    userWidget.addEventListener('click', (e) => {
        if (e.target === logoutBtn) return;
        userWidget.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!userWidget.contains(e.target)) userWidget.classList.remove('open');
    });

    logoutBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirmAction("¿Deseas cerrar sesión en el Gestor Web?")) return;
        await supabase.auth.signOut();
        window.location.replace('index.html');
    });
}

// ==========================================
// MÓDULO 1: INSTITUCIONAL
// ==========================================
async function cargarInstitucional() {
    const { data, error } = await supabase.from('web_institucional').select('*').limit(1).maybeSingle();
    if (error) {
        console.error("Error al cargar institucional:", error);
        return;
    }

    if (data) {
        document.getElementById('inst_id').value = data.id;
        document.getElementById('inst_logo_actual_path').value = data.logo_path || '';
        document.getElementById('inst_nombre').value = data.nombre_entidad || '';
        document.getElementById('inst_telefono').value = data.telefono || '';
        document.getElementById('inst_email').value = data.email || '';
        document.getElementById('inst_direccion').value = data.direccion || '';
        document.getElementById('inst_horario').value = data.horario_atencion || '';
        document.getElementById('inst_mision').value = data.mision || '';
        document.getElementById('inst_vision').value = data.vision || '';
        document.getElementById('inst_facebook').value = data.facebook_url || '';
        document.getElementById('inst_mapa').value = data.mapa_url || '';

        const preview = document.getElementById('previewLogo');
        if (preview && data.logo_url) {
            preview.src = `${data.logo_url}?t=${Date.now()}`;
            preview.onerror = () => { preview.src = DEFAULT_IMAGE; };
            preview.classList.remove('hidden');
            preview.style.display = 'block';
        }
    }
}

document.getElementById('formInstitucional')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        const id = document.getElementById('inst_id').value;
        const oldPath = document.getElementById('inst_logo_actual_path').value;
        const file = document.getElementById('inst_logo').files[0];

        let logo_url = null;
        let logo_path = null;

        if (file) {
            validarImagen(file);
            const fileName = sanitizarNombreArchivo('logo', file.name);
            const { error: upErr } = await supabase.storage
                .from('web-institucional')
                .upload(fileName, file, { cacheControl: '3600', upsert: true, contentType: file.type });

            if (upErr) throw upErr;
            logo_path = fileName;
            logo_url = supabase.storage.from('web-institucional').getPublicUrl(fileName).data.publicUrl;
        }

        const payload = {
            nombre_entidad: document.getElementById('inst_nombre').value.trim(),
            telefono: document.getElementById('inst_telefono').value.trim() || null,
            email: document.getElementById('inst_email').value.trim() || null,
            direccion: document.getElementById('inst_direccion').value.trim() || null,
            horario_atencion: document.getElementById('inst_horario').value.trim() || null,
            mision: document.getElementById('inst_mision').value.trim() || null,
            vision: document.getElementById('inst_vision').value.trim() || null,
            facebook_url: document.getElementById('inst_facebook').value.trim() || null,
            mapa_url: document.getElementById('inst_mapa').value.trim() || null,
            actualizado_en: new Date().toISOString(),
            actualizado_por: currentUser.id
        };

        if (logo_url) {
            payload.logo_url = logo_url;
            payload.logo_path = logo_path;
        }

        let errorGuardar;
        if (id) {
            const { error } = await supabase.from('web_institucional').update(payload).eq('id', id);
            errorGuardar = error;
        } else {
            const { error } = await supabase.from('web_institucional').insert([payload]);
            errorGuardar = error;
        }

        if (errorGuardar) throw errorGuardar;

        // Borrar logo anterior de Storage si se subió uno nuevo
        if (logo_path && oldPath && oldPath !== logo_path) {
            await supabase.storage.from('web-institucional').remove([oldPath]);
        }

        document.getElementById('inst_logo').value = '';
        showToast("Información institucional guardada correctamente.");
        await cargarInstitucional();
    } catch (err) {
        showToast("Error al guardar: " + err.message, "error");
        console.error(err);
    } finally {
        hideLoader();
    }
});

// ==========================================
// MÓDULO 2: DIRECTORIO
// ==========================================
async function cargarDirectorio() {
    const { data, error } = await supabase
        .from('web_directorio')
        .select('*')
        .order('orden_jerarquia', { ascending: true });

    if (error) console.error("Error al cargar directorio:", error);

    const tbody = document.getElementById('tablaDirectorio');
    if (!tbody) return;

    tbody.innerHTML = data && data.length > 0 ? data.map(d => `
        <tr>
            <td>
                <img src="${d.foto_url || DEFAULT_AVATAR}"
                     onerror="this.onerror=null; this.src='${DEFAULT_AVATAR}';"
                     alt="Foto de ${d.nombre_completo}"
                     style="width:42px;height:42px;object-fit:cover;border-radius:50%;border:1px solid #e2e8f0;">
            </td>
            <td><strong>${d.nombre_completo}</strong><br><small>${d.cargo}</small></td>
            <td>${d.orden_jerarquia}</td>
            <td style="text-align:center;">
                <button type="button" onclick="window.editarDirectivo('${d.id}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem;">Editar</button>
                <button type="button" onclick="window.eliminarDirectivo('${d.id}', '${encodeURIComponent(d.foto_path || '')}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Borrar</button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="4" style="text-align:center;">No hay directivos registrados.</td></tr>';
}

function resetearFormDirectorio() {
    document.getElementById('formDirectorio').reset();
    document.getElementById('dir_id').value = '';
    document.getElementById('dir_foto_actual_path').value = '';
    document.getElementById('tituloFormDir').textContent = 'Agregar Directivo';
    document.getElementById('btnCancelarDir').classList.add('hidden');
    ocultarVistaPrevia('previewDirectorio');
}

document.getElementById('formDirectorio')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        const id = document.getElementById('dir_id').value;
        const oldPath = document.getElementById('dir_foto_actual_path').value;
        const file = document.getElementById('dir_foto').files[0];

        const payload = {
            nombre_completo: document.getElementById('dir_nombre').value.trim(),
            cargo: document.getElementById('dir_cargo').value.trim(),
            orden_jerarquia: parseInt(document.getElementById('dir_orden').value, 10) || 0,
            descripcion: document.getElementById('dir_desc').value.trim() || null,
            actualizado_en: new Date().toISOString()
        };

        let nuevaFotoPath = null;
        if (file) {
            validarImagen(file);
            const fileName = sanitizarNombreArchivo('perfil', file.name);
            const { error: upErr } = await supabase.storage
                .from('web-directorio')
                .upload(fileName, file, { cacheControl: '3600', upsert: true, contentType: file.type });

            if (upErr) throw upErr;
            nuevaFotoPath = fileName;
            payload.foto_path = fileName;
            payload.foto_url = supabase.storage.from('web-directorio').getPublicUrl(fileName).data.publicUrl;
        }

        let errorGuardar;
        if (id) {
            const { error } = await supabase.from('web_directorio').update(payload).eq('id', id);
            errorGuardar = error;
        } else {
            payload.creado_por = currentUser.id;
            const { error } = await supabase.from('web_directorio').insert([payload]);
            errorGuardar = error;
        }

        if (errorGuardar) throw errorGuardar;

        if (nuevaFotoPath && oldPath && oldPath !== nuevaFotoPath) {
            await supabase.storage.from('web-directorio').remove([oldPath]);
        }

        showToast("Directivo guardado exitosamente.");
        resetearFormDirectorio();
        await cargarDirectorio();
    } catch (err) {
        showToast("Error: " + err.message, "error");
        console.error(err);
    } finally {
        hideLoader();
    }
});

window.editarDirectivo = async (id) => {
    const { data, error } = await supabase.from('web_directorio').select('*').eq('id', id).single();
    if (error) {
        showToast("Error al cargar datos del directivo", "error");
        return;
    }
    if (data) {
        document.getElementById('dir_id').value = data.id;
        document.getElementById('dir_foto_actual_path').value = data.foto_path || '';
        document.getElementById('dir_nombre').value = data.nombre_completo;
        document.getElementById('dir_cargo').value = data.cargo;
        document.getElementById('dir_orden').value = data.orden_jerarquia;
        document.getElementById('dir_desc').value = data.descripcion || '';
        document.getElementById('tituloFormDir').textContent = 'Editar Directivo';
        document.getElementById('btnCancelarDir').classList.remove('hidden');

        const preview = document.getElementById('previewDirectorio');
        if (preview && data.foto_url) {
            preview.src = data.foto_url;
            preview.onerror = () => { preview.src = DEFAULT_AVATAR; };
            preview.classList.remove('hidden');
            preview.style.display = 'block';
        } else {
            ocultarVistaPrevia('previewDirectorio');
        }
    }
};

document.getElementById('btnCancelarDir')?.addEventListener('click', resetearFormDirectorio);

window.eliminarDirectivo = async (id, encodedPath) => {
    if (!confirmAction("¿Eliminar este directivo?")) return;
    showLoader();
    try {
        const path = decodeURIComponent(encodedPath || '');
        if (path && path !== 'null' && path !== 'undefined') {
            await supabase.storage.from('web-directorio').remove([path]);
        }
        const { error } = await supabase.from('web_directorio').delete().eq('id', id);
        if (error) throw error;
        showToast("Directivo eliminado correctamente.");
        resetearFormDirectorio();
        await cargarDirectorio();
    } catch (err) {
        showToast("Error al eliminar: " + err.message, "error");
        console.error(err);
    } finally {
        hideLoader();
    }
};

// ==========================================
// MÓDULO 3: GALERÍA
// ==========================================
async function cargarGaleria() {
    const { data, error } = await supabase
        .from('web_galeria')
        .select('*')
        .order('creado_en', { ascending: false });

    if (error) console.error("Error al cargar galería:", error);

    const grid = document.getElementById('gridGaleria');
    if (!grid) return;

    grid.innerHTML = data && data.length > 0 ? data.map(g => `
        <div class="galeria-item">
            <img src="${g.imagen_url}"
                 onerror="this.onerror=null; this.src='${DEFAULT_IMAGE}';"
                 alt="${g.titulo}">
            <button type="button" class="btn-delete-img" onclick="window.eliminarImagen('${g.id}', '${encodeURIComponent(g.imagen_path || '')}')">✕</button>
            <div class="galeria-info">
                <h4>${g.titulo}</h4>
                <span>${(g.categoria || 'general').toUpperCase()}</span>
            </div>
        </div>
    `).join('') : '<p style="grid-column: 1 / -1;">No hay imágenes en la galería.</p>';
}

document.getElementById('formGaleria')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        const file = document.getElementById('gal_imagen').files[0];
        if (!file) throw new Error("Debes seleccionar una imagen.");
        validarImagen(file);

        const fileName = sanitizarNombreArchivo('gal', file.name);
        const { error: upErr } = await supabase.storage
            .from('web-galeria')
            .upload(fileName, file, { cacheControl: '3600', upsert: true, contentType: file.type });

        if (upErr) throw upErr;

        const payload = {
            titulo: document.getElementById('gal_titulo').value.trim(),
            categoria: document.getElementById('gal_categoria').value,
            imagen_path: fileName,
            imagen_url: supabase.storage.from('web-galeria').getPublicUrl(fileName).data.publicUrl,
            creado_por: currentUser.id
        };

        const { error: inErr } = await supabase.from('web_galeria').insert([payload]);
        if (inErr) throw inErr;

        showToast("Imagen subida a la galería.");
        e.target.reset();
        ocultarVistaPrevia('previewGaleria');
        await cargarGaleria();
    } catch (err) {
        showToast("Error: " + err.message, "error");
        console.error(err);
    } finally {
        hideLoader();
    }
});

window.eliminarImagen = async (id, encodedPath) => {
    if (!confirmAction("¿Eliminar esta imagen de la galería?")) return;
    showLoader();
    try {
        const path = decodeURIComponent(encodedPath || '');
        if (path && path !== 'null' && path !== 'undefined') {
            await supabase.storage.from('web-galeria').remove([path]);
        }
        const { error } = await supabase.from('web_galeria').delete().eq('id', id);
        if (error) throw error;
        showToast("Imagen eliminada.");
        await cargarGaleria();
    } catch (err) {
        showToast("Error al eliminar: " + err.message, "error");
        console.error(err);
    } finally {
        hideLoader();
    }
};

// ==========================================
// MÓDULO 4: NOTICIAS
// ==========================================
async function cargarNoticias() {
    const { data, error } = await supabase
        .from('noticias')
        .select('*')
        .order('creado_en', { ascending: false });

    if (error) console.error("Error al cargar noticias:", error);

    const tbody = document.getElementById('tablaNoticias');
    if (!tbody) return;

    tbody.innerHTML = data && data.length > 0 ? data.map(n => {
        const dateStr = new Date(n.creado_en).toLocaleDateString('es-PE');
        return `
        <tr>
            <td><span class="text-ellipsis" title="${n.titulo}"><strong>${n.titulo}</strong></span></td>
            <td>${dateStr}</td>
            <td><span class="badge badge-${n.estado}">${n.estado.toUpperCase()}</span></td>
            <td style="text-align:center;">
                <button type="button" onclick="window.editarNoticia('${n.id}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem;">Editar</button>
                <button type="button" onclick="window.eliminarNoticia('${n.id}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Borrar</button>
            </td>
        </tr>
    `}).join('') : '<tr><td colspan="4" style="text-align:center;">No hay noticias publicadas.</td></tr>';
}

function resetearFormNoticia() {
    document.getElementById('formNoticia').reset();
    document.getElementById('not_id').value = '';
    document.getElementById('tituloFormNoticia').textContent = 'Publicar Noticia';
    document.getElementById('btnCancelarNoticia').classList.add('hidden');
}

document.getElementById('formNoticia')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        const id = document.getElementById('not_id').value;
        const estado = document.getElementById('not_estado').value;
        const payload = {
            titulo: document.getElementById('not_titulo').value.trim(),
            resumen: document.getElementById('not_resumen').value.trim() || null,
            contenido: document.getElementById('not_contenido').value.trim(),
            estado: estado,
            fecha_publicacion: estado === 'publicado' ? new Date().toISOString() : null
        };

        let errorGuardar;
        if (id) {
            const { error } = await supabase.from('noticias').update(payload).eq('id', id);
            errorGuardar = error;
        } else {
            payload.creado_por = currentUser.id;
            const { error } = await supabase.from('noticias').insert([payload]);
            errorGuardar = error;
        }

        if (errorGuardar) throw errorGuardar;

        showToast("Noticia guardada con éxito.");
        resetearFormNoticia();
        await cargarNoticias();
    } catch (err) {
        showToast("Error: " + err.message, "error");
        console.error(err);
    } finally {
        hideLoader();
    }
});

window.editarNoticia = async (id) => {
    const { data, error } = await supabase.from('noticias').select('*').eq('id', id).single();
    if (error) {
        showToast("Error al cargar noticia", "error");
        return;
    }
    if (data) {
        document.getElementById('not_id').value = data.id;
        document.getElementById('not_titulo').value = data.titulo;
        document.getElementById('not_resumen').value = data.resumen || '';
        document.getElementById('not_contenido').value = data.contenido;
        document.getElementById('not_estado').value = data.estado;
        document.getElementById('tituloFormNoticia').textContent = 'Editar Noticia';
        document.getElementById('btnCancelarNoticia').classList.remove('hidden');
    }
};

document.getElementById('btnCancelarNoticia')?.addEventListener('click', resetearFormNoticia);

window.eliminarNoticia = async (id) => {
    if (!confirmAction("¿Eliminar esta noticia por completo?")) return;
    showLoader();
    try {
        const { error } = await supabase.from('noticias').delete().eq('id', id);
        if (error) throw error;
        showToast("Noticia eliminada.");
        resetearFormNoticia();
        await cargarNoticias();
    } catch (err) {
        showToast("Error al eliminar: " + err.message, "error");
        console.error(err);
    } finally {
        hideLoader();
    }
};

// ==========================================
// MÓDULO 5: COMUNICADOS
// ==========================================
async function cargarComunicados() {
    const { data, error } = await supabase
        .from('comunicados')
        .select('*')
        .order('creado_en', { ascending: false });

    if (error) console.error("Error al cargar comunicados:", error);

    const tbody = document.getElementById('tablaComunicados');
    if (!tbody) return;

    tbody.innerHTML = data && data.length > 0 ? data.map(c => `
        <tr>
            <td><span class="text-ellipsis" title="${c.titulo}"><strong>${c.titulo}</strong></span></td>
            <td><span class="badge badge-${c.prioridad}">${c.prioridad.toUpperCase()}</span></td>
            <td><span class="badge badge-${c.estado}">${c.estado.toUpperCase()}</span></td>
            <td style="text-align:center;">
                <button type="button" onclick="window.editarComunicado('${c.id}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem;">Editar</button>
                <button type="button" onclick="window.eliminarComunicado('${c.id}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Borrar</button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="4" style="text-align:center;">No hay comunicados registrados.</td></tr>';
}

function resetearFormComunicado() {
    document.getElementById('formComunicado').reset();
    document.getElementById('com_id').value = '';
    document.getElementById('tituloFormComunicado').textContent = 'Emitir Comunicado';
    document.getElementById('btnCancelarComunicado').classList.add('hidden');
}

document.getElementById('formComunicado')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        const id = document.getElementById('com_id').value;
        const titulo = document.getElementById('com_titulo').value.trim();
        const contenido = document.getElementById('com_contenido').value.trim();
        const prioridad = document.getElementById('com_prioridad').value.toLowerCase();
        const estado = document.getElementById('com_estado').value.toLowerCase();

        if (titulo.length < 3) {
            throw new Error("El título debe tener al menos 3 caracteres.");
        }

        const payload = {
            titulo,
            contenido,
            prioridad,
            estado,
            fecha_publicacion: estado === 'publicado' ? new Date().toISOString() : null
        };

        let errorGuardar;
        if (id) {
            const { error } = await supabase.from('comunicados').update(payload).eq('id', id);
            errorGuardar = error;
        } else {
            payload.creado_por = currentUser.id;
            const { error } = await supabase.from('comunicados').insert([payload]);
            errorGuardar = error;
        }

        if (errorGuardar) throw errorGuardar;

        showToast("Comunicado guardado con éxito.");
        resetearFormComunicado();
        await cargarComunicados();
    } catch (err) {
        showToast("Error: " + err.message, "error");
        console.error(err);
    } finally {
        hideLoader();
    }
});

window.editarComunicado = async (id) => {
    const { data, error } = await supabase.from('comunicados').select('*').eq('id', id).single();
    if (error) {
        showToast("Error al cargar comunicado", "error");
        return;
    }
    if (data) {
        document.getElementById('com_id').value = data.id;
        document.getElementById('com_titulo').value = data.titulo;
        document.getElementById('com_contenido').value = data.contenido;
        document.getElementById('com_prioridad').value = data.prioridad;
        document.getElementById('com_estado').value = data.estado;
        document.getElementById('tituloFormComunicado').textContent = 'Editar Comunicado';
        document.getElementById('btnCancelarComunicado').classList.remove('hidden');
    }
};

document.getElementById('btnCancelarComunicado')?.addEventListener('click', resetearFormComunicado);

window.eliminarComunicado = async (id) => {
    if (!confirmAction("¿Eliminar este comunicado?")) return;
    showLoader();
    try {
        const { error } = await supabase.from('comunicados').delete().eq('id', id);
        if (error) throw error;
        showToast("Comunicado eliminado.");
        resetearFormComunicado();
        await cargarComunicados();
    } catch (err) {
        showToast("Error al eliminar: " + err.message, "error");
        console.error(err);
    } finally {
        hideLoader();
    }
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
        window.location.replace('index.html');
        return;
    }

    currentUser = session.user;

    // Mostrar usuario logueado en el sidebar
    const email = currentUser.email || 'Admin Web';
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    if (userNameEl) userNameEl.textContent = email.split('@')[0];
    if (userAvatarEl) userAvatarEl.textContent = email.substring(0, 2).toUpperCase();

    // Activar vistas previas instantáneas en los 3 inputs de archivo
    vincularVistaPrevia('inst_logo', 'previewLogo');
    vincularVistaPrevia('dir_foto', 'previewDirectorio');
    vincularVistaPrevia('gal_imagen', 'previewGaleria');

    await Promise.all([
        cargarInstitucional(),
        cargarDirectorio(),
        cargarGaleria(),
        cargarNoticias(),
        cargarComunicados()
    ]);
});
