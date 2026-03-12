import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://oaudjakdzvfgymkiwfaa.supabase.co', 'sb_publishable_WS2wtYXmV6P_zenHdEtwTQ_LUVY6gU2');

async function main() {
  const now = new Date().toISOString();
  // Target tasks from 13:00 to 15:00 UTC-3
  const startTime = new Date('2026-03-12T13:00:00-03:00').toISOString();
  const endTime = new Date('2026-03-12T15:00:00-03:00').toISOString();

  // call_schedules uses scheduled_for
  const { data: schedules, error: err1 } = await supabase
    .from('call_schedules')
    .update({ scheduled_for: now, status: 'APROVADO' })
    .gte('scheduled_for', startTime)
    .lt('scheduled_for', endTime)
    .select('id');
  
  console.log('Schedules updated:', schedules?.length, err1?.message || '');

  // tasks might use deadline (lowercase usually works if quoted, let's try mapping common fields to snake_case just in case)
  // Let's first test if 'deadline' exists. If it exists, Supabase doesn't error out on it.
  const { data: cols } = await supabase.from('tasks').select('id, deadline, scheduled_for').limit(1).catch(e => ({ data: [] }));
  
  // Actually, let's try update on tasks with deadline
  const { data: tasks2, error: err3 } = await supabase
    .from('tasks')
    .update({ deadline: now })
    .gte('deadline', startTime)
    .lt('deadline', endTime)
    .select('id');
    
  console.log('Tasks (deadline) updated:', tasks2?.length, err3?.message || '');

  // And tasks with scheduled_for
  const { data: tasks1, error: err2 } = await supabase
    .from('tasks')
    .update({ scheduled_for: now })
    .gte('scheduled_for', startTime)
    .lt('scheduled_for', endTime)
    .select('id');
    
  console.log('Tasks (scheduled_for) updated:', tasks1?.length, err2?.message || '');
}

main().catch(console.error);
