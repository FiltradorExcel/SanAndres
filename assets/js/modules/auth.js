// assets/js/modules/auth.js
import { supabase } from './config.js';

/**
 * Verifica la sesión activa del usuario y configura el panel según su rol.
 */
export async function initAuth(requireSession = true) {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (requireSession && (!session || error)) {
        window.location.replace('index.html');
        return null;
    }
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

    // Evento de cierre de sesión
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.replace('index.html');
        });
    }

    return { session, user, role, name };
}

/**
 * Inicia sesión con correo y contraseña en Supabase Auth.
 */
export async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error("Credenciales inválidas. Verifica tu correo y contraseña.");
    return data;
}

// Lógica para mostrar/ocultar contraseña en el formulario de login
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('togglePassword');
    const passInput = document.getElementById('password');
    if (toggleBtn && passInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passInput.setAttribute('type', type);
            toggleBtn.textContent = type === 'password' ? 'Mostrar' : 'Ocultar';
        });
    }
});