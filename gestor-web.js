import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==========================================
// CONFIGURACIÓN SUPABASE
// ==========================================
const SUPABASE_URL = "https://fchcuzbqhmptbazyfzfc.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_D7nmdaIOySv4XL0h6Ho9Eg_TnPF1zjq"; 
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;

// ==========================================
// UTILIDADES (UI y Carga)
// ==========================================
const showLoader = () => document.getElementById('globalLoader').classList.add('show');
const hideLoader = () => document.getElementById('globalLoader').classList.remove('show');

function showToast(mensaje, tipo = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.textContent = mensaje;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function confirmAction(mensaje) {
    return window.confirm(mensaje);
}

// ==========================================
// NAVEGACIÓN (TABS) Y MENÚ DE USUARIO
// ==========================================
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

const userWidget = document.getElementById('userMenuBtn');
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

// ==========================================
// MÓDULO 1: INSTITUCIONAL
// ==========================================
async function cargarInstitucional() {
    const { data, error } = await supabase.from('web_institucional').select('*').limit(1).maybeSingle();
    
    if (error) console.error("Error al cargar institucional:", error);
    
    if (data) {
        document.getElementById('inst_id').value = data.id;
        document.getElementById('inst_nombre').value = data.nombre_entidad || '';
        document.getElementById('inst_telefono').value = data.telefono || '';
        document.getElementById('inst_email').value = data.email || '';
        document.getElementById('inst_direccion').value = data.direccion || '';
        document.getElementById('inst_horario').value = data.horario_atencion || '';
        document.getElementById('inst_mision').value = data.mision || '';
        document.getElementById('inst_vision').value = data.vision || '';
        document.getElementById('inst_facebook').value = data.facebook_url || '';
        document.getElementById('inst_mapa').value = data.mapa_url || '';
        if (data.logo_url) {
            const preview = document.getElementById('previewLogo');
            preview.src = data.logo_url;
            preview.classList.remove('hidden');
        }
    }
}

document.getElementById('formInstitucional').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        const id = document.getElementById('inst_id').value;
        const file = document.getElementById('inst_logo').files[0];
        let logo_url = null, logo_path = null;

        if (file) {
            const fileName = `logo_${Date.now()}_${file.name}`;
            const { error: upErr } = await supabase.storage.from('web-institucional').upload(fileName, file, { upsert: true });
            if (upErr) throw upErr;
            logo_path = fileName;
            logo_url = supabase.storage.from('web-institucional').getPublicUrl(fileName).data.publicUrl;
        }

        const payload = {
            nombre_entidad: document.getElementById('inst_nombre').value,
            telefono: document.getElementById('inst_telefono').value,
            email: document.getElementById('inst_email').value,
            direccion: document.getElementById('inst_direccion').value,
            horario_atencion: document.getElementById('inst_horario').value,
            mision: document.getElementById('inst_mision').value,
            vision: document.getElementById('inst_vision').value,
            facebook_url: document.getElementById('inst_facebook').value,
            mapa_url: document.getElementById('inst_mapa').value,
            actualizado_en: new Date().toISOString(),
            actualizado_por: currentUser.id
        };
        if (logo_url) { payload.logo_url = logo_url; payload.logo_path = logo_path; }

        let errorGuardar;
        if (id) {
            const { error } = await supabase.from('web_institucional').update(payload).eq('id', id);
            errorGuardar = error;
        } else {
            const { error } = await supabase.from('web_institucional').insert([payload]);
            errorGuardar = error;
        }

        if (errorGuardar) throw errorGuardar;

        showToast("Información institucional actualizada.");
        cargarInstitucional();
    } catch (err) { 
        showToast("Error: " + err.message, "error"); 
        console.error(err);
    } finally { 
        hideLoader(); 
    }
});

// ==========================================
// MÓDULO 2: DIRECTORIO
// ==========================================
async function cargarDirectorio() {
    const { data, error } = await supabase.from('web_directorio').select('*').order('orden_jerarquia', { ascending: true });
    
    if (error) console.error("Error al cargar directorio:", error);

    const tbody = document.getElementById('tablaDirectorio');
    tbody.innerHTML = data && data.length > 0 ? data.map(d => `
        <tr>
            <td><img src="${d.foto_url || 'assets/img/placeholder.png'}" alt="Foto" style="width:40px;height:40px;object-fit:cover;border-radius:50%;"></td>
            <td><strong>${d.nombre_completo}</strong><br><small>${d.cargo}</small></td>
            <td>${d.orden_jerarquia}</td>
            <td style="text-align:center;">
                <button onclick="window.editarDirectivo('${d.id}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem;">Editar</button>
                <button onclick="window.eliminarDirectivo('${d.id}', '${d.foto_path}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Borrar</button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="4" style="text-align:center;">No hay directivos.</td></tr>';
}

document.getElementById('formDirectorio').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        const id = document.getElementById('dir_id').value;
        const file = document.getElementById('dir_foto').files[0];
        const payload = {
            nombre_completo: document.getElementById('dir_nombre').value,
            cargo: document.getElementById('dir_cargo').value,
            orden_jerarquia: parseInt(document.getElementById('dir_orden').value) || 0,
            descripcion: document.getElementById('dir_desc').value,
            actualizado_en: new Date().toISOString()
        };

        if (file) {
            const fileName = `perfil_${Date.now()}_${file.name}`;
            const { error: upErr } = await supabase.storage.from('web-directorio').upload(fileName, file, { upsert: true });
            if (upErr) throw upErr;
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

        showToast("Directivo guardado exitosamente.");
        document.getElementById('formDirectorio').reset();
        document.getElementById('dir_id').value = '';
        document.getElementById('btnCancelarDir').classList.add('hidden');
        cargarDirectorio();
    } catch (err) { 
        showToast(err.message, "error"); 
        console.error(err);
    } finally { 
        hideLoader(); 
    }
});

window.editarDirectivo = async (id) => {
    const { data, error } = await supabase.from('web_directorio').select('*').eq('id', id).single();
    if (error) {
        showToast("Error al cargar datos", "error");
        return;
    }
    if (data) {
        document.getElementById('dir_id').value = data.id;
        document.getElementById('dir_nombre').value = data.nombre_completo;
        document.getElementById('dir_cargo').value = data.cargo;
        document.getElementById('dir_orden').value = data.orden_jerarquia;
        document.getElementById('dir_desc').value = data.descripcion || '';
        document.getElementById('btnCancelarDir').classList.remove('hidden');
    }
};

document.getElementById('btnCancelarDir').addEventListener('click', () => {
    document.getElementById('formDirectorio').reset();
    document.getElementById('dir_id').value = '';
    document.getElementById('btnCancelarDir').classList.add('hidden');
});

window.eliminarDirectivo = async (id, path) => {
    if (!confirmAction("¿Eliminar este directivo?")) return;
    showLoader();
    try {
        if (path && path !== 'null' && path !== 'undefined') {
            await supabase.storage.from('web-directorio').remove([path]);
        }
        const { error } = await supabase.from('web_directorio').delete().eq('id', id);
        if (error) throw error;
        showToast("Eliminado correctamente.");
        cargarDirectorio();
    } catch(err) {
        showToast("Error al eliminar", "error");
        console.error(err);
    } finally {
        hideLoader();
    }
};

// ==========================================
// MÓDULO 3: GALERÍA
// ==========================================
async function cargarGaleria() {
    const { data, error } = await supabase.from('web_galeria').select('*').order('creado_en', { ascending: false });
    
    if (error) console.error("Error al cargar galería:", error);

    const grid = document.getElementById('gridGaleria');
    grid.innerHTML = data && data.length > 0 ? data.map(g => `
        <div class="galeria-item">
            <img src="${g.imagen_url}" alt="${g.titulo}">
            <button class="btn-delete-img" onclick="window.eliminarImagen('${g.id}', '${g.imagen_path}')">✕</button>
            <div class="galeria-info">
                <h4>${g.titulo}</h4>
                <span>${g.categoria.toUpperCase()}</span>
            </div>
        </div>
    `).join('') : '<p style="grid-column: 1 / -1;">No hay imágenes en la galería.</p>';
}

document.getElementById('formGaleria').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        const file = document.getElementById('gal_imagen').files[0];
        const fileName = `${Date.now()}_${file.name}`;
        
        const { error: upErr } = await supabase.storage.from('web-galeria').upload(fileName, file, { upsert: true });
        if (upErr) throw upErr;
        
        const payload = {
            titulo: document.getElementById('gal_titulo').value,
            categoria: document.getElementById('gal_categoria').value,
            imagen_path: fileName,
            imagen_url: supabase.storage.from('web-galeria').getPublicUrl(fileName).data.publicUrl,
            creado_por: currentUser.id
        };
        
        const { error: inErr } = await supabase.from('web_galeria').insert([payload]);
        if (inErr) throw inErr;

        showToast("Imagen subida a la galería.");
        e.target.reset();
        cargarGaleria();
    } catch (err) { 
        showToast(err.message, "error"); 
        console.error(err);
    } finally { 
        hideLoader(); 
    }
});

window.eliminarImagen = async (id, path) => {
    if (!confirmAction("¿Eliminar imagen pública?")) return;
    showLoader();
    try {
        if (path && path !== 'null') {
            await supabase.storage.from('web-galeria').remove([path]);
        }
        const { error } = await supabase.from('web_galeria').delete().eq('id', id);
        if (error) throw error;
        showToast("Imagen eliminada.");
        cargarGaleria();
    } catch(err) {
        showToast("Error al eliminar", "error");
        console.error(err);
    } finally {
        hideLoader();
    }
};

// ==========================================
// MÓDULO 4: NOTICIAS
// ==========================================
async function cargarNoticias() {
    const { data, error } = await supabase.from('noticias').select('*').order('creado_en', { ascending: false });
    
    if (error) console.error("Error al cargar noticias:", error);

    const tbody = document.getElementById('tablaNoticias');
    tbody.innerHTML = data && data.length > 0 ? data.map(n => {
        const dateStr = new Date(n.creado_en).toLocaleDateString();
        return `
        <tr>
            <td><span class="text-ellipsis" title="${n.titulo}"><strong>${n.titulo}</strong></span></td>
            <td>${dateStr}</td>
            <td><span class="badge badge-${n.estado}">${n.estado.toUpperCase()}</span></td>
            <td style="text-align:center;">
                <button onclick="window.editarNoticia('${n.id}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem;">Editar</button>
                <button onclick="window.eliminarNoticia('${n.id}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Borrar</button>
            </td>
        </tr>
    `}).join('') : '<tr><td colspan="4" style="text-align:center;">No hay noticias publicadas.</td></tr>';
}

document.getElementById('formNoticia').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        const id = document.getElementById('not_id').value;
        const estado = document.getElementById('not_estado').value;
        const payload = {
            titulo: document.getElementById('not_titulo').value,
            resumen: document.getElementById('not_resumen').value,
            contenido: document.getElementById('not_contenido').value,
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
        document.getElementById('formNoticia').reset();
        document.getElementById('not_id').value = '';
        document.getElementById('btnCancelarNoticia').classList.add('hidden');
        cargarNoticias();
    } catch (err) { 
        showToast(err.message, "error"); 
        console.error(err);
    } finally { 
        hideLoader(); 
    }
});

window.editarNoticia = async (id) => {
    const { data, error } = await supabase.from('noticias').select('*').eq('id', id).single();
    if (error) {
        showToast("Error al cargar datos", "error");
        return;
    }
    if (data) {
        document.getElementById('not_id').value = data.id;
        document.getElementById('not_titulo').value = data.titulo;
        document.getElementById('not_resumen').value = data.resumen || '';
        document.getElementById('not_contenido').value = data.contenido;
        document.getElementById('not_estado').value = data.estado;
        document.getElementById('btnCancelarNoticia').classList.remove('hidden');
    }
};

document.getElementById('btnCancelarNoticia').addEventListener('click', () => {
    document.getElementById('formNoticia').reset();
    document.getElementById('not_id').value = '';
    document.getElementById('btnCancelarNoticia').classList.add('hidden');
});

window.eliminarNoticia = async (id) => {
    if (!confirmAction("¿Eliminar esta noticia por completo?")) return;
    showLoader();
    try {
        const { error } = await supabase.from('noticias').delete().eq('id', id);
        if (error) throw error;
        showToast("Noticia eliminada.");
        cargarNoticias();
    } catch(err) {
        showToast("Error al eliminar", "error");
        console.error(err);
    } finally {
        hideLoader();
    }
};

// ==========================================
// MÓDULO 5: COMUNICADOS
// ==========================================
async function cargarComunicados() {
    const { data, error } = await supabase.from('comunicados').select('*').order('creado_en', { ascending: false });
    
    if (error) console.error("Error al cargar comunicados:", error);

    const tbody = document.getElementById('tablaComunicados');
    tbody.innerHTML = data && data.length > 0 ? data.map(c => `
        <tr>
            <td><span class="text-ellipsis" title="${c.titulo}"><strong>${c.titulo}</strong></span></td>
            <td><span class="badge badge-${c.prioridad}">${c.prioridad.toUpperCase()}</span></td>
            <td><span class="badge badge-${c.estado}">${c.estado.toUpperCase()}</span></td>
            <td style="text-align:center;">
                <button onclick="window.editarComunicado('${c.id}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem;">Editar</button>
                <button onclick="window.eliminarComunicado('${c.id}')" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.75rem; color:var(--danger); border-color:#fecaca;">Borrar</button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="4" style="text-align:center;">No hay comunicados registrados.</td></tr>';
}

document.getElementById('formComunicado').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader();
    try {
        const id = document.getElementById('com_id').value;
        const estado = document.getElementById('com_estado').value;
        const payload = {
            titulo: document.getElementById('com_titulo').value,
            contenido: document.getElementById('com_contenido').value,
            prioridad: document.getElementById('com_prioridad').value,
            estado: estado,
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
        document.getElementById('formComunicado').reset();
        document.getElementById('com_id').value = '';
        document.getElementById('btnCancelarComunicado').classList.add('hidden');
        cargarComunicados();
    } catch (err) { 
        showToast(err.message, "error"); 
        console.error(err);
    } finally { 
        hideLoader(); 
    }
});

window.editarComunicado = async (id) => {
    const { data, error } = await supabase.from('comunicados').select('*').eq('id', id).single();
    if (error) {
        showToast("Error al cargar datos", "error");
        return;
    }
    if (data) {
        document.getElementById('com_id').value = data.id;
        document.getElementById('com_titulo').value = data.titulo;
        document.getElementById('com_contenido').value = data.contenido;
        document.getElementById('com_prioridad').value = data.prioridad;
        document.getElementById('com_estado').value = data.estado;
        document.getElementById('btnCancelarComunicado').classList.remove('hidden');
    }
};

document.getElementById('btnCancelarComunicado').addEventListener('click', () => {
    document.getElementById('formComunicado').reset();
    document.getElementById('com_id').value = '';
    document.getElementById('btnCancelarComunicado').classList.add('hidden');
});

window.eliminarComunicado = async (id) => {
    if (!confirmAction("¿Eliminar este comunicado?")) return;
    showLoader();
    try {
        const { error } = await supabase.from('comunicados').delete().eq('id', id);
        if (error) throw error;
        showToast("Comunicado eliminado.");
        cargarComunicados();
    } catch(err) {
        showToast("Error al eliminar", "error");
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
    
    // Carga inicial de todos los módulos
    cargarInstitucional();
    cargarDirectorio();
    cargarGaleria();
    cargarNoticias();
    cargarComunicados();
});