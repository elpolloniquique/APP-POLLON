import { getSupabase, isSupabaseConfigured } from './supabaseClient';

const DEMO_RULES = [
  {
    id: 'demo-rule-1',
    name: 'Tarifa base El Pollón',
    rule_type: 'per_km',
    base_fee: 1500,
    per_km_fee: 400,
    min_fee: 2000,
    max_fee: 8000,
    is_active: true,
    priority: 10,
    branch_id: null,
  },
];

export async function listPricingRules(branchId = null) {
  if (!isSupabaseConfigured()) return DEMO_RULES;
  const sb = getSupabase();
  let q = sb.from('ep_pricing_rules').select('*').order('priority', { ascending: false });
  if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function savePricingRule(rule) {
  if (!isSupabaseConfigured()) return rule;
  const sb = getSupabase();
  const payload = {
    name: rule.name,
    rule_type: rule.rule_type,
    base_fee: Number(rule.base_fee) || 0,
    per_km_fee: Number(rule.per_km_fee) || 0,
    min_fee: Number(rule.min_fee) || 0,
    max_fee: rule.max_fee != null && rule.max_fee !== '' ? Number(rule.max_fee) : null,
    is_active: rule.is_active !== false,
    priority: Number(rule.priority) || 0,
    branch_id: rule.branch_id || null,
    tiers: rule.tiers || [],
    updated_at: new Date().toISOString(),
  };
  if (rule.id && !String(rule.id).startsWith('demo-')) {
    const { data, error } = await sb.from('ep_pricing_rules').update(payload).eq('id', rule.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await sb.from('ep_pricing_rules').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deletePricingRule(id) {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  const { error } = await sb.from('ep_pricing_rules').delete().eq('id', id);
  if (error) throw error;
}

export async function quoteDelivery(branchId, distanceKm) {
  if (!isSupabaseConfigured()) {
    const fee = Math.max(2000, 1500 + Math.round(distanceKm * 400));
    return { fee: Math.min(fee, 8000), distance_km: distanceKm, rule_name: 'Demo' };
  }
  const sb = getSupabase();
  const { data, error } = await sb.rpc('ep_quote_delivery', {
    p_branch_id: branchId,
    p_distance_km: distanceKm,
  });
  if (error) throw error;
  return data;
}

export function simulateLocalQuote(rule, distanceKm) {
  const km = Math.max(0, Number(distanceKm) || 0);
  let fee = Number(rule.base_fee) || 0;
  if (rule.rule_type === 'per_km' || rule.rule_type === 'tiers') {
    fee += Math.round(km * (Number(rule.per_km_fee) || 0));
  }
  fee = Math.max(fee, Number(rule.min_fee) || 0);
  if (rule.max_fee != null && rule.max_fee !== '') fee = Math.min(fee, Number(rule.max_fee));
  return fee;
}
