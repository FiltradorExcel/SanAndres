/* La clave sb_publishable es pública. Nunca coloques aquí service_role ni claves secretas. */
window.CANAL_CONFIG = {
  SUPABASE_URL: 'https://fchcuzbqhmptbazyfzfc.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_D7nmdaIOySv4XL0h6Ho9Eg_TnPF1zjq',
  STORAGE_BUCKET: 'canal-evidencias'
};
window.canalSupabase = window.supabase.createClient(
  window.CANAL_CONFIG.SUPABASE_URL,
  window.CANAL_CONFIG.SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
