// assets/js/modules/auth.js
import { supabase } from './config.js';
import { confirmAction } from './ui.js';

/**
 * Verifica la sesión activa del usuario y configura el panel según su rol.
 */
export async function initAuth(requireSession = true) {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    // Si la página requiere sesión y no hay una activa -> Regresar a login
    if (requireSession && (!session || error)) {
        window.location.replace('index.html');
        return null;
    }
    
    // Si la página NO requiere sesión (ej. index.html) y SÍ hay una activa -> Ir al dashboard
    if (!requireSession && session) {
        window.location.replace('dashboard.html');
        return null;
    }
    
    if (!session) return null;

    // Obtener rol y perfil del usuario
    const user = session.user;
    const [{ data: roleData }, { data: profile }] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('nombre_completo').eq('id', user.id).maybeSingle()
    ]);

    const role = roleData?.role || 'tecnico';
    const name = profile?.nombre_completo || user.email;

    // Ajustar visibilidad de la interfaz según rol (Gerencia vs Técnico)
    document.querySelectorAll('.manager-only').forEach(el => {
        el.style.display = role === 'gerencia' ? 'flex' : 'none';
    });
    
    const roleBadge = document.getElementById('roleBadge');
    if (roleBadge) {
        roleBadge.textContent = role === 'gerencia' ? 'Gerencia' : 'Técnico';
        roleBadge.className = `badge badge-${role}`;
    }

    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = name;
    
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) avatarEl.textContent = name.substring(0, 2).toUpperCase();

    // Configuración del desplegable interactivo de Perfil / Logout
    setupProfileDropdown();

    return { session, user, role, name };
}

/**
 * Encapsula el botón de logout en un menú flotante y gestiona el clic interactivo.
 */
function setupProfileDropdown() {
    const userWidget = document.querySelector('.user-widget');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!userWidget || !logoutBtn) return;

    let dropdown = userWidget.querySelector('.user-dropdown-menu');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'user-dropdown-menu';
        logoutBtn.parentNode.insertBefore(dropdown, logoutBtn);
        dropdown.appendChild(logoutBtn);
    }

    userWidget.onclick = (e) => {
        if (e.target.closest('.user-dropdown-menu') && e.target !== logoutBtn) return;
        if (e.target === logoutBtn) return;
        userWidget.classList.toggle('open');
    };

    document.addEventListener('click', (e) => {
        if (!userWidget.contains(e.target)) {
            userWidget.classList.remove('open');
        }
    });

    logoutBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmado = confirmAction("¿Estás seguro de que deseas cerrar sesión?");

        if (!confirmado) return;

        logoutBtn.disabled = true;
        logoutBtn.textContent = 'Saliendo...';

        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
            alert("Error al cerrar sesión: " + signOutError.message);
            logoutBtn.disabled = false;
            logoutBtn.textContent = 'Cerrar Sesión';
        } else {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sagua_borrador_')) localStorage.removeItem(key);
            });
            window.location.replace('index.html');
        }
    };
}

/**
 * Inicia sesión con correo y contraseña en Supabase Auth.
 */
export async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error("Credenciales inválidas. Verifica tu correo y contraseña.");
    return data;
}
