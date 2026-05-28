import { getSupabase, isSupabaseConfigured } from './supabaseClient';

export async function getSetting(key, branchId = null) {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  let q = sb.from('settings').select('value').eq('key', key);
  if (branchId) q = q.eq('branch_id', branchId);
  else q = q.is('branch_id', null);
  const { data } = await q.maybeSingle();
  return data?.value ?? null;
}

export async function setSetting(key, value, branchId = null) {
  if (!isSupabaseConfigured()) throw new Error('Supabase no configurado');
  const sb = getSupabase();
  const { error } = await sb.from('settings').upsert(
    { key, value, branch_id: branchId },
    { onConflict: 'key,branch_id' }
  );
  if (error) throw error;
}

export async function getBranchSettings(branchId) {
  if (!isSupabaseConfigured()) return {};
  const sb = getSupabase();
  const { data } = await sb.from('settings').select('key, value').eq('branch_id', branchId);
  const out = {};
  (data || []).forEach((r) => { out[r.key] = r.value; });
  return out;
}
