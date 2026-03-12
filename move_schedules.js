const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://oaudjakdzvfgymkiwfaa.supabase.co', 'sb_publishable_WS2wtYXmV6P_zenHdEtwTQ_LUVY6gU2');

async function main() {
  const now = new Date().toISOString();
  // 13:00 to 15:00 UTC-3 (Brazil)
  const startTime = new Date('2026-03-12T13:00:00-03:00').toISOString();
  const endTime = new Date('2026-03-12T15:00:00-03:00').toISOString();

  // Update call_schedules
  const { data: schedules, error: err1 } = await supabase
    .from('call_schedules')
    .update({ scheduledFor: now, status: 'APROVADO' })
    .gte('scheduledFor', startTime)
    .lt('scheduledFor', endTime)
    .select();
  
  console.log('Schedules updated:', schedules?.length, err1?.message || '');

  // Update tasks where scheduledFor was between 13h and 15h
  const { data: tasks1, error: err2 } = await supabase
    .from('tasks')
    .update({ scheduledFor: now, deadline: now })
    .gte('scheduledFor', startTime)
    .lt('scheduledFor', endTime)
    .select();
    
  console.log('Tasks (scheduledFor) updated:', tasks1?.length, err2?.message || '');
  
  // Update tasks where deadline was between 13h and 15h
  const { data: tasks2, error: err3 } = await supabase
    .from('tasks')
    .update({ deadline: now })
    .gte('deadline', startTime)
    .lt('deadline', endTime)
    .select();
    
  console.log('Tasks (deadline) updated:', tasks2?.length, err3?.message || '');
}

main().catch(console.error);
