export const PHONE_RE = /^\+212[5-7][0-9]{8}$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const CITIES = ['Tanger', 'Tetouan'] as const;
export const PROPERTY_TYPES = ['apartment', 'villa', 'commercial', 'land'] as const;
export const LEAD_CATEGORIES = [
  { value: 'agency', label: 'Real Estate Agency' },
  { value: 'developer', label: 'Property Developer' },
  { value: 'photographer', label: 'Freelance Photographer' },
  { value: 'mre', label: 'Moroccan Residing Abroad (MRE)' },
] as const;

export const CONTACT = {
  phone: import.meta.env.VITE_CONTACT_PHONE ?? '',
  whatsapp: import.meta.env.VITE_CONTACT_WHATSAPP ?? '',
  email: import.meta.env.VITE_CONTACT_EMAIL ?? 'nextviewimmersive@gmail.com',
};

export function formatMAD(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  return `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })} MAD`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Accepts 06..., 6..., +212 6..., 00212 6... and returns +212XXXXXXXXX or null. */
export function normalizeMoroccanPhone(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, '');
  let candidate: string | null = null;
  if (digits.startsWith('+212')) candidate = digits;
  else if (digits.startsWith('00212')) candidate = '+' + digits.slice(2);
  else if (/^0[5-7]\d{8}$/.test(digits)) candidate = '+212' + digits.slice(1);
  else if (/^[5-7]\d{8}$/.test(digits)) candidate = '+212' + digits;
  return candidate && PHONE_RE.test(candidate) ? candidate : null;
}

export function formatErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return 'Something went wrong. Please try again.';
}
