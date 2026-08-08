/** Normalización de teléfonos Chile + match dual 569 / +569 */

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Chile → +569XXXXXXXX.
 * No fuerza +56 si el número ya viene internacional (+51, +54, etc.).
 */
export function normalizeChilePhone(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  let digits = digitsOnly(trimmed);
  if (digits.startsWith('0') && digits.length >= 9) digits = digits.slice(1);
  if (digits.startsWith('56') && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith('9') && digits.length === 9) return `+56${digits}`;
  if (trimmed.startsWith('+') && !digits.startsWith('56') && digits.length >= 8) {
    return `+${digits}`;
  }
  return null;
}

export function phoneDigits(phone) {
  const n = normalizeChilePhone(phone);
  return n ? digitsOnly(n) : digitsOnly(phone);
}

export function phonesMatch(a, b) {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db || da.length < 8 || db.length < 8) return false;
  return da === db || da.endsWith(db) || db.endsWith(da);
}
