import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const normalizeName = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const validAreaCode = (value) => /^([1-9][1-9])$/.test(value) && Number(value) >= 11;

const isValidPhoneCandidate = (value) => {
  if (!value) return false;
  if (!(value.length === 10 || value.length === 11)) return false;
  return validAreaCode(value.slice(0, 2));
};

const scorePhoneCandidate = (value) => {
  if (!isValidPhoneCandidate(value)) return -100;

  let score = 10;
  if (value.length === 11 && value[2] === '9') score += 5;
  if (value.length === 10 && value[2] !== '0' && value[2] !== '1') score += 2;
  return score;
};

const SAFE_SPLIT_REASONS = new Set([
  'leading_zero',
  'full_10_10',
  'full_10_11',
  'full_11_10',
  'full_11_11',
  'full_11_11_same_number',
  'infer_area_10_8_same_number',
  'infer_area_10_9_same_number',
  'infer_area_11_9_same_number'
]);

const proposePhoneNormalization = (value) => {
  const digits = normalizePhone(value);
  if (!digits) return null;

  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;

  if (local.length === 12 && local.startsWith('0')) {
    const primary = local.slice(1);
    if (!isValidPhoneCandidate(primary)) return null;
    return { primary, secondary: '', reason: 'leading_zero' };
  }

  if (local.length <= 11) return null;

  const options = [];
  for (const firstLength of [10, 11]) {
    if (local.length <= firstLength) continue;

    const primary = local.slice(0, firstLength);
    const tail = local.slice(firstLength);

    if (tail.length === 10 || tail.length === 11) {
      options.push({
        primary,
        secondary: tail,
        reason: `full_${firstLength}_${tail.length}`
      });
    }

    if ((tail.length === 8 || tail.length === 9) && primary.length >= 2) {
      options.push({
        primary,
        secondary: `${primary.slice(0, 2)}${tail}`,
        reason: `infer_area_${firstLength}_${tail.length}`
      });
    }
  }

  const scoredOptions = options
    .map((option) => ({
      ...option,
      score:
        scorePhoneCandidate(option.primary) +
        scorePhoneCandidate(option.secondary) +
        (option.primary !== option.secondary ? 3 : -2)
    }))
    .filter((option) => option.score > 0)
    .sort((left, right) => right.score - left.score);

  if (scoredOptions.length === 0) return null;

  const best = scoredOptions[0];
  if (best.primary === best.secondary) {
    return {
      primary: best.primary,
      secondary: '',
      reason: `${best.reason}_same_number`
    };
  }

  return {
    primary: best.primary,
    secondary: best.secondary,
    reason: best.reason
  };
};

const mergePhones = (...phones) => {
  const unique = Array.from(new Set(phones.map(normalizePhone).filter(Boolean)));
  return {
    phone: unique[0] || '',
    phone_secondary: unique[1] || ''
  };
};

const scoreClient = (client) => ({
  calls: Number(client.call_count || 0),
  tasks: Number(client.task_count || 0),
  schedules: Number(client.schedule_count || 0),
  protocols: Number(client.protocol_count || 0),
  updatedAt: new Date(client.updated_at || client.created_at || 0).getTime()
});

const pickKeeper = (clients) =>
  [...clients].sort((left, right) => {
    const leftScore = scoreClient(left);
    const rightScore = scoreClient(right);

    if (leftScore.calls !== rightScore.calls) return rightScore.calls - leftScore.calls;
    if (leftScore.tasks !== rightScore.tasks) return rightScore.tasks - leftScore.tasks;
    if (leftScore.schedules !== rightScore.schedules) return rightScore.schedules - leftScore.schedules;
    if (leftScore.protocols !== rightScore.protocols) return rightScore.protocols - leftScore.protocols;
    return rightScore.updatedAt - leftScore.updatedAt;
  })[0];

async function fetchClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, phone, phone_secondary, status, street, city, created_at, updated_at, invalid')
    .neq('invalid', true);

  if (error) throw error;
  return data || [];
}

async function normalizeLongPhones(clients) {
  let normalizedCount = 0;
  let skippedCount = 0;

  for (const client of clients) {
    const proposal = proposePhoneNormalization(client.phone);
    if (!proposal || !SAFE_SPLIT_REASONS.has(proposal.reason)) {
      if (proposal) skippedCount++;
      continue;
    }

    const merged = mergePhones(
      proposal.primary,
      client.phone_secondary,
      proposal.secondary
    );

    const nextPhone = merged.phone || client.phone || '';
    const nextSecondary = merged.phone_secondary || null;
    const currentPhone = normalizePhone(client.phone);
    const currentSecondary = normalizePhone(client.phone_secondary);

    if (currentPhone === nextPhone && currentSecondary === (nextSecondary || '')) {
      continue;
    }

    const { error } = await supabase
      .from('clients')
      .update({
        phone: nextPhone,
        phone_secondary: nextSecondary
      })
      .eq('id', client.id);

    if (error) throw error;

    normalizedCount++;
    console.log(
      `Normalized phone for "${client.name}" (${client.id})` +
      ` | reason=${proposal.reason}` +
      ` | primary=${nextPhone}` +
      ` | secondary=${nextSecondary || ''}`
    );
  }

  return { normalizedCount, skippedCount };
}

async function countByForeignKey(table, foreignKey, ids) {
  const counts = new Map();
  const chunkSize = 100;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { data, error } = await supabase.from(table).select(`id, ${foreignKey}`).in(foreignKey, chunk);
    if (error) throw error;

    for (const row of data || []) {
      const key = row[foreignKey];
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return counts;
}

const isCompatibleAddress = (clients) => {
  const streets = Array.from(
    new Set(clients.map((client) => normalizeName(client.street)).filter(Boolean))
  );
  const cities = Array.from(
    new Set(clients.map((client) => normalizeName(client.city)).filter(Boolean))
  );

  const streetSafe = streets.length <= 1 || streets.length === 0;
  const citySafe = cities.length <= 1 || cities.length === 0;
  return streetSafe && citySafe;
};

const isSafeDuplicateGroup = (clients) => {
  if (clients.length < 2) return false;

  const distinctPhones = Array.from(
    new Set(
      clients.flatMap((client) => [client.normalized_phone, client.normalized_phone_secondary].filter(Boolean))
    )
  );

  if (distinctPhones.length === 0 || distinctPhones.length > 2) {
    return false;
  }

  return isCompatibleAddress(clients);
};

async function updateForeignKeys(table, foreignKey, duplicateId, keeperId) {
  const { data, error } = await supabase.from(table).select('id').eq(foreignKey, duplicateId);
  if (error) throw error;
  if (!data || data.length === 0) return 0;

  const { error: updateError } = await supabase
    .from(table)
    .update({ [foreignKey]: keeperId })
    .eq(foreignKey, duplicateId);

  if (updateError) throw updateError;
  return data.length;
}

async function mergeDuplicateIntoKeeper(keeper, duplicate) {
  const mergedPhones = mergePhones(
    keeper.phone,
    keeper.phone_secondary,
    duplicate.phone,
    duplicate.phone_secondary
  );

  const keeperPayload = {
    phone: mergedPhones.phone,
    phone_secondary: mergedPhones.phone_secondary || null,
    street: keeper.street || duplicate.street || null,
    city: keeper.city || duplicate.city || null
  };

  const { error: updateKeeperError } = await supabase
    .from('clients')
    .update(keeperPayload)
    .eq('id', keeper.id);

  if (updateKeeperError) throw updateKeeperError;

  const migratedCalls = await updateForeignKeys('call_logs', 'client_id', duplicate.id, keeper.id);
  const migratedTasks = await updateForeignKeys('tasks', 'client_id', duplicate.id, keeper.id);
  const migratedSchedules = await updateForeignKeys('call_schedules', 'customer_id', duplicate.id, keeper.id);
  const migratedProtocols = await updateForeignKeys('protocols', 'client_id', duplicate.id, keeper.id);
  const migratedWhatsApp = await updateForeignKeys('whatsapp_tasks', 'client_id', duplicate.id, keeper.id);

  const { count: deletedCount, error: deleteError } = await supabase
    .from('clients')
    .delete({ count: 'exact' })
    .eq('id', duplicate.id);

  if (deleteError) throw deleteError;

  if ((deletedCount || 0) === 0) {
    const { error: invalidateError } = await supabase
      .from('clients')
      .update({
        invalid: true,
        campanha_atual_id: null
      })
      .eq('id', duplicate.id);

    if (invalidateError) throw invalidateError;
  }

  return {
    migratedCalls,
    migratedTasks,
    migratedSchedules,
    migratedProtocols,
    migratedWhatsApp
  };
}

async function main() {
  const initialClients = await fetchClients();
  const { normalizedCount, skippedCount } = await normalizeLongPhones(initialClients);

  const clients = await fetchClients();
  const ids = clients.map((client) => client.id);

  const [callCounts, taskCounts, scheduleCounts, protocolCounts] = await Promise.all([
    countByForeignKey('call_logs', 'client_id', ids),
    countByForeignKey('tasks', 'client_id', ids),
    countByForeignKey('call_schedules', 'customer_id', ids),
    countByForeignKey('protocols', 'client_id', ids)
  ]);

  const enrichedClients = clients.map((client) => ({
    ...client,
    normalized_name: normalizeName(client.name),
    normalized_phone: normalizePhone(client.phone),
    normalized_phone_secondary: normalizePhone(client.phone_secondary),
    call_count: callCounts.get(client.id) || 0,
    task_count: taskCounts.get(client.id) || 0,
    schedule_count: scheduleCounts.get(client.id) || 0,
    protocol_count: protocolCounts.get(client.id) || 0
  }));

  const groups = new Map();
  for (const client of enrichedClients) {
    if (!client.normalized_name) continue;
    const current = groups.get(client.normalized_name) || [];
    current.push(client);
    groups.set(client.normalized_name, current);
  }

  let mergedGroups = 0;
  let deletedDuplicates = 0;
  let skippedGroups = 0;

  for (const clientsWithSameName of groups.values()) {
    if (!isSafeDuplicateGroup(clientsWithSameName)) {
      if (clientsWithSameName.length > 1) skippedGroups++;
      continue;
    }

    const keeper = pickKeeper(clientsWithSameName);
    const duplicates = clientsWithSameName.filter((client) => client.id !== keeper.id);

    if (duplicates.length === 0) continue;

    for (const duplicate of duplicates) {
      const result = await mergeDuplicateIntoKeeper(keeper, duplicate);
      deletedDuplicates++;
      console.log(
        `Merged "${duplicate.name}" (${duplicate.id}) into "${keeper.name}" (${keeper.id})` +
        ` | calls=${result.migratedCalls}` +
        ` tasks=${result.migratedTasks}` +
        ` schedules=${result.migratedSchedules}` +
        ` protocols=${result.migratedProtocols}` +
        ` whatsapp=${result.migratedWhatsApp}`
      );
    }

    mergedGroups++;
  }

  console.log(
    `Automatic fix finished. normalized_phones=${normalizedCount}` +
    ` skipped_phone_patterns=${skippedCount}` +
    ` merged_groups=${mergedGroups}` +
    ` duplicates_removed=${deletedDuplicates}` +
    ` skipped_groups=${skippedGroups}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
