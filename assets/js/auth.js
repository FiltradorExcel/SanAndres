document.addEventListener('DOMContentLoaded', () => {
  const client = window.canalSupabase;
  const form = document.querySelector('#loginForm');
  const message = document.querySelector('#loginMessage');
  const button = document.querySelector('#loginButton');
  const password = document.querySelector('#password');
  const setMessage = (text, kind = '') => { message.textContent = text; message.className = `form-message ${kind}`.trim(); };
  document.querySelector('#togglePassword').addEventListener('click', (event) => {
    const visible = password.type === 'text'; password.type = visible ? 'password' : 'text'; event.currentTarget.textContent = visible ? 'Mostrar' : 'Ocultar';
  });
  client.auth.getSession().then(({ data }) => { if (data.session) location.replace('dashboard.html'); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); button.disabled = true; button.querySelector('span').textContent = 'Verificando acceso…'; setMessage('');
    try {
      const { error } = await client.auth.signInWithPassword({ email: document.querySelector('#email').value.trim(), password: password.value });
      if (error) throw error;
      const { data: roleData, error: roleError } = await client.rpc('current_app_role');
      if (roleError || !roleData) {
        await client.auth.signOut();
        throw new Error('Tu cuenta aún no tiene un rol autorizado. Solicita a gerencia que te asigne el rol correspondiente.');
      }
      location.replace('dashboard.html');
    } catch (error) { setMessage(error.message || 'No se pudo iniciar sesión. Inténtalo nuevamente.', 'error'); button.disabled = false; button.querySelector('span').textContent = 'Ingresar al gestor'; }
  });
});
