/** Normalización de teléfonos Chile + JID WhatsApp */

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Chile: 569XXXXXXXX. Null si no es usable. */
export function normalizeWhatsappPhone(phone) {
  const digits = digitsOnly(phone);
  if (digits.length < 8) return null;
  if (digits.startsWith('56') && digits.length >= 11) return digits;
  if (digits.startsWith('9') && digits.length === 9) return `56${digits}`;
  if (digits.length >= 10) return digits.startsWith('56') ? digits : `56${digits}`;
  return null;
}

/** Quita @s.whatsapp.net / @c.us / sufijos de grupo. */
export function phoneFromJid(jid) {
  const raw = String(jid || '').trim();
  if (!raw) return null;
  const user = raw.split('@')[0] || '';
  const base = user.split(':')[0];
  return normalizeWhatsappPhone(base);
}

export function phonesMatch(a, b) {
  const na = normalizeWhatsappPhone(a);
  const nb = normalizeWhatsappPhone(b);
  if (!na || !nb) return false;
  return na === nb || na.endsWith(nb) || nb.endsWith(na);
}

export function evolutionInstanceName(branchId) {
  const id = String(branchId || '').replace(/-/g, '');
  return `ep_${id}`.slice(0, 64);
}
