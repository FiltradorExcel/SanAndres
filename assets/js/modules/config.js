
// assets/js/modules/config.js
export const CANAL_CONFIG = {
  SUPABASE_URL: 'https://fchcuzbqhmptbazyfzfc.supabase.co',
  SUPABASE_KEY: 'sb_publishable_D7nmdaIOySv4XL0h6Ho9Eg_TnPF1zjq',
  STORAGE_BUCKET: 'canal-evidencias'
};

export const supabase = window.supabase.createClient(
  CANAL_CONFIG.SUPABASE_URL,
  CANAL_CONFIG.SUPABASE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
);
