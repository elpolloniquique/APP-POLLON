import { getSupabase, isSupabaseConfigured } from './supabaseClient';
import { getSetting, upsertGlobalSetting } from './settingsService';

export const SITE_ALERT_KEY = 'site_alert';
export const SITE_ALERT_DISMISS_KEY = 'elpollon_site_alert_dismissed';

export function emptySiteAlert() {
  return {
    enabled: false,
    title: 'Aviso importante',
    message: '',
    updatedAt: null,
  };
}

export function normalizeSiteAlert(raw) {
  if (!raw || typeof raw !== 'object') return emptySiteAlert();
  const title = String(raw.title || raw.aviso_titulo || 'Aviso importante').trim();
  return {
    enabled: raw.enabled === true || raw.aviso_activo === true,
    title: title || 'Aviso importante',
    message: String(raw.message || raw.aviso_mensaje || '').trim(),
    updatedAt: raw.updatedAt || raw.updated_at || null,
  };
}

export function siteAlertFingerprint(alert) {
  const a = normalizeSiteAlert(alert);
  return `${a.enabled ? 1 : 0}|${a.title}|${a.message}|${a.updatedAt || ''}`;
}

export function wasSiteAlertDismissed(alert) {
  try {
    return localStorage.getItem(SITE_ALERT_DISMISS_KEY) === siteAlertFingerprint(alert);
  } catch {
    return false;
  }
}

export function dismissSiteAlert(alert) {
  try {
    localStorage.setItem(SITE_ALERT_DISMISS_KEY, siteAlertFingerprint(alert));
  } catch {
    /* ignore quota / private mode */
  }
}

export async function fetchSiteAlert() {
  if (!isSupabaseConfigured()) return emptySiteAlert();
  const sb = getSupabase();

  try {
    const value = await getSetting(SITE_ALERT_KEY, null);
    const fromSettings = normalizeSiteAlert(value);
    if (value && (fromSettings.enabled || fromSettings.message)) return fromSettings;
  } catch {
    /* settings puede no existir */
  }

  try {
    const { data, error } = await sb
      .from('configuracion_tienda')
      .select('aviso_activo, aviso_titulo, aviso_mensaje')
      .eq('id', 1)
      .maybeSingle();
    if (!error && data) return normalizeSiteAlert(data);
  } catch {
    /* columnas aún no migradas */
  }

  return emptySiteAlert();
}

export async function saveSiteAlert(alert) {
  if (!isSupabaseConfigured()) throw new Error('Supabase no configurado');
  const payload = {
    enabled: !!alert.enabled,
    title: String(alert.title || 'Aviso importante').trim() || 'Aviso importante',
    message: String(alert.message || '').trim(),
    updatedAt: new Date().toISOString(),
  };
  if (payload.enabled && !payload.message) {
    throw new Error('Escribe el texto del aviso antes de activarlo.');
  }

  const sb = getSupabase();
  const errors = [];

  const { error: colError } = await sb
    .from('configuracion_tienda')
    .update({
      aviso_activo: payload.enabled,
      aviso_titulo: payload.title,
      aviso_mensaje: payload.message,
    })
    .eq('id', 1);
  if (colError) errors.push(colError.message);

  try {
    await upsertGlobalSetting(SITE_ALERT_KEY, payload);
    return payload;
  } catch (e) {
    errors.push(e.message || String(e));
  }

  if (!colError) return payload;

  const hint = errors.some((m) => /aviso_|column|schema cache|does not exist/i.test(m || ''))
    ? ' Ejecuta en Supabase el archivo supabase/add-site-alert.sql y vuelve a guardar.'
    : '';
  throw new Error(`No se pudo guardar el aviso.${hint}`);
}
