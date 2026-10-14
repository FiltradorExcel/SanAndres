const sb = window.canalSupabase;
const $ = (s) => document.querySelector(s);
const safe = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = (value) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(new Date(value)) : '—';
const statusLabel = (v) => ({pendiente:'Pendiente',aprobada:'Aprobada',aprobado:'Aprobado',requiere_correccion:'Por corregir'}[v] || v || 'Sin estado');
function showNotice(text, type='info') { $('#notice').textContent=text; $('#notice').className=`notice ${type}`; }
async function countRows(table, query = (q) => q) { const { count, error } = await query(sb.from(table).select('*', {count:'exact', head:true})); if (error) throw error; return count ?? 0; }
async function loadDashboard() {
  $('#refreshButton').disabled = true; $('#refreshButton').textContent = '↻ Actualizando…';
  try {
    const { data: userData, error: userError } = await sb.auth.getUser(); if (userError || !userData.user) { location.replace('index.html'); return; }
    const user = userData.user;
    const [{ data: role, error: roleError }, { data: profile }] = await Promise.all([
      sb.rpc('current_app_role'), sb.from('profiles').select('nombre_completo').eq('id', user.id).maybeSingle()
    ]);
    if (roleError || !role) { await sb.auth.signOut(); location.replace('index.html'); return; }
    const name = profile?.nombre_completo || user.email || 'Usuario';
    $('#userAvatar').textContent = name.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
    $('#roleBadge').textContent = role === 'gerencia' ? 'Gerencia' : 'Personal técnico';
    document.querySelectorAll('.manager-only').forEach(el => el.classList.toggle('hidden', role !== 'gerencia'));
    $('#todayLabel').textContent = new Intl.DateTimeFormat('es-PE',{weekday:'long',day:'numeric',month:'long'}).format(new Date()).toUpperCase();
    const [sectors, inspections, measurements, pendingInspections, pendingMeasurements, pendingCalculations, recent] = await Promise.all([
      countRows('sectores', q=>q.eq('activo',true)), countRows('inspecciones'), countRows('mediciones'),
      countRows('inspecciones',q=>q.eq('estado_revision','pendiente')),
      countRows('mediciones',q=>q.eq('estado_revision','pendiente')),
      countRows('resultados_calculo',q=>q.eq('estado_revision','pendiente')),
      sb.from('inspecciones').select('id,fecha_hora,estado_infraestructura,estado_revision,sector_id,sectores(nombre,codigo)').order('fecha_hora',{ascending:false}).limit(6)
    ]);
    $('#sectorCount').textContent = sectors; $('#inspectionCount').textContent = inspections; $('#measurementCount').textContent = measurements;
    $('#pendingCount').textContent = role === 'gerencia' ? pendingInspections + pendingMeasurements + pendingCalculations : pendingInspections + pendingMeasurements;
    renderChart(inspections, await getInspectionStatuses()); renderRecent(recent.data || []);
    if (recent.error) throw recent.error;
    $('#notice').className='notice hidden';
  } catch (error) {
    showNotice(`No se pudieron cargar todos los datos: ${error.message}. Comprueba las políticas RLS y que las tablas estén creadas.`, 'warning');
    $('#inspectionChart').innerHTML='<div class="chart-empty">No se pudo consultar el estado de las inspecciones.</div>';
    $('#recentInspections').innerHTML='<tr><td colspan="4" class="table-empty">No se pudieron cargar los registros.</td></tr>';
  } finally { $('#refreshButton').disabled=false; $('#refreshButton').textContent='↻ Actualizar datos'; }
}
async function getInspectionStatuses() {
  const result = await sb.from('inspecciones').select('estado_revision');
  if (result.error) throw result.error;
  return (result.data || []).reduce((a, r) => { const k=r.estado_revision || 'pendiente'; a[k]=(a[k]||0)+1; return a; }, {});
}
function renderChart(total, states) {
  const rows=[['Aprobadas',states.aprobada||0,'approved'],['Pendientes',states.pendiente||0,'pending'],['Por corregir',states.requiere_correccion||0,'correction']];
  const max=Math.max(1,...rows.map(r=>r[1]));
  $('#inspectionChart').innerHTML = total === 0 ? '<div class="chart-empty">Aún no hay inspecciones. Registra la primera para ver el seguimiento.</div>' : rows.map(([label,n,cls])=>`<div class="bar-row"><div class="bar-label"><span>${label}</span><b>${n}</b></div><div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.max(n?4:0,n/max*100)}%"></div></div></div>`).join('');
}
function renderRecent(rows) {
  if (!rows.length) { $('#recentInspections').innerHTML='<tr><td colspan="4" class="table-empty">Todavía no hay inspecciones registradas.</td></tr>'; return; }
  $('#recentInspections').innerHTML=rows.map(r=>`<tr><td><b>${safe(r.sectores?.nombre || 'Sector sin nombre')}</b><small>${safe(r.sectores?.codigo || '—')}</small></td><td>${safe(fmtDate(r.fecha_hora))}</td><td><span class="status-chip ${safe(r.estado_infraestructura)}">${safe(({bueno:'Bueno',regular:'Regular',malo:'Malo',sin_evaluar:'Sin evaluar'}[r.estado_infraestructura]||r.estado_infraestructura))}</span></td><td><span class="review-chip ${safe(r.estado_revision)}">${safe(statusLabel(r.estado_revision))}</span></td></tr>`).join('');
}
$('#refreshButton').addEventListener('click', loadDashboard);
$('#logoutButton').addEventListener('click', async()=>{ await sb.auth.signOut(); location.replace('index.html'); });
$('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('sidebar-open'));
sb.auth.onAuthStateChange((event, session)=>{ if(event==='SIGNED_OUT'||!session) location.replace('index.html'); });
loadDashboard();
