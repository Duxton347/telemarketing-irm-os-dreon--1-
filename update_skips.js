const url = 'https://oaudjakdzvfgymkiwfaa.supabase.co/rest/v1';
const key = 'sb_publishable_WS2wtYXmV6P_zenHdEtwTQ_LUVY6gU2';
const headers = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };

async function run() {
  console.log('Fetching tasks...');
  const tRes = await fetch(url + '/tasks?select=id,skip_reason&status=eq.skipped', { headers });
  const tasks = await tRes.json();
  console.log('Found ' + tasks.length + ' skipped voice tasks.');

  for (const t of tasks) {
    const rawReason = (t.skip_reason || '').replace('[ANTES DA CHAMADA] ', '').replace('[APÓS INICIAR] ', '');
    
    // Check if operator started the call
    const evRes = await fetch(url + '/operator_events?select=event_type&task_id=eq.' + t.id, { headers });
    const events = await evRes.json();
    
    const hasStarted = Array.isArray(events) && events.some(e => e.event_type === 'INICIAR_PROXIMO_ATENDIMENTO');
    const prefix = hasStarted ? '[APÓS INICIAR] ' : '[ANTES DA CHAMADA] ';
    
    const sr = rawReason || 'Sem Motivo';
    const newReason = prefix + sr;
    
    if (newReason !== t.skip_reason) {
      await fetch(url + '/tasks?id=eq.' + t.id, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ skip_reason: newReason })
      });
      console.log('Updated voice task ' + t.id + ' to: ' + newReason);
    }
  }

  // Same for whatsapp
  const wRes = await fetch(url + '/whatsapp_tasks?select=id,skip_reason&status=eq.skipped', { headers });
  const wTasks = await wRes.json();
  console.log('Found ' + wTasks.length + ' skipped whatsapp tasks.');

  for (const wt of wTasks) {
    const rawReason = (wt.skip_reason || '').replace('[ANTES DA CHAMADA] ', '').replace('[APÓS INICIAR] ', '');
    
    const evRes = await fetch(url + '/operator_events?select=event_type&task_id=eq.' + wt.id, { headers });
    const events = await evRes.json();
    
    const hasStarted = Array.isArray(events) && events.some(e => e.event_type === 'INICIAR_PROXIMO_ATENDIMENTO');
    const prefix = hasStarted ? '[APÓS INICIAR] ' : '[ANTES DA CHAMADA] ';
    
    const sr = rawReason || 'Sem Motivo';
    const newReason = prefix + sr;
    
    if (newReason !== wt.skip_reason) {
      await fetch(url + '/whatsapp_tasks?id=eq.' + wt.id, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ skip_reason: newReason })
      });
      console.log('Updated whatsapp task ' + wt.id + ' to: ' + newReason);
    }
  }
}
run().catch(console.error);
