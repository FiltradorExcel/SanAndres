// assets/js/modules/auth.js - Gestión de sesión, roles y salida segura
import { supabase } from './config.js';
import { confirmAction } from './ui.js';

export async function initAuth(requireAuth = true) {
    const { data: { session } } = await supabase.auth.getSession();

    // Redirecciones según estado de autenticación
    if (requireAuth && !session) {
        window.location.replace('index.html');
        return null;
    }

    if (!requireAuth && session) {
        window.location.replace('dashboard.html');
        return null;
    }

    if (session) {
        // Cargar datos de perfil y rol
        const { data: profile } = await supabase
            .from('perfiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        const role = profile?.rol || 'tecnico';
        
        // Configurar widget de usuario en la interfaz
        setupUserUI(session.user, role);
        
        return { user: session.user, role, profile };
    }

    return null;
}

function setupUserUI(user, role) {
    // 1. Mostrar Nombre de usuario
    const userNameEl = document.getElementById('userName');
    if (userNameEl) {
        userNameEl.textContent = user.user_metadata?.nombre_completo || user.email.split('@')[0];
    }

    // 2. Generar Iniciales para el Avatar
    const userAvatarEl = document.getElementById('userAvatar');
    if (userAvatarEl) {
        const name = user.user_metadata?.nombre_completo || user.email;
        userAvatarEl.textContent = name.substring(0, 2).toUpperCase();
    }

    // 3. Renderizar Badge de Rol (Gerencia / Técnico)
    const roleBadgeEl = document.getElementById('roleBadge');
    if (roleBadgeEl) {
        roleBadgeEl.textContent = role.toUpperCase();
        roleBadgeEl.className = `badge badge-${role}`;
    }

    // 4. Mostrar opciones exclusivas de Gerencia
    if (role === 'gerencia') {
        document.querySelectorAll('.manager-only').forEach(el => {
            el.style.display = 'flex';
        });
    }

    // 5. Configurar Botón 'Cerrar Sesión' con Diálogo de Confirmación
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = async (e) => {
            e.preventDefault();

            // Mensaje de confirmación
            const confirmado = confirmAction(
                "¿Estás seguro de que deseas cerrar sesión?\nSi tienes datos ingresados en algún formulario, se perderán."
            );

            if (!confirmado) return; // Si el usuario cancela, la sesión se mantiene activa

            logoutBtn.disabled = true;
            logoutBtn.textContent = "Saliendo...";

            const { error } = await supabase.auth.signOut();
            if (error) {
                alert("Error al cerrar sesión: " + error.message);
                logoutBtn.disabled = false;
                logoutBtn.textContent = "Cerrar Sesión";
            } else {
                // Borrar borradores del localStorage al salir voluntariamente
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('sagua_borrador_')) localStorage.removeItem(key);
                });
                window.location.replace('index.html');
            }
        };
    }
}

export async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) throw error;
    return data;
}
