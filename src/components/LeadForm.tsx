import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { EMAIL_RE, LEAD_CATEGORIES, formatErrorMessage, normalizeMoroccanPhone } from '../lib/format';

interface Props {
  propertyId?: number;
  title?: string;
}

export default function LeadForm({ propertyId, title = 'Start a project' }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<string>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setError('Please enter your full name.');
    if (!EMAIL_RE.test(email.trim())) return setError('Please enter a valid email address.');
    const normalizedPhone = normalizeMoroccanPhone(phone);
    if (!normalizedPhone) return setError('Phone must be a Moroccan number, e.g. +212 6 12 34 56 78.');
    if (!category) return setError('Please select who you are.');
    if (message.length > 2000) return setError('Your message is too long (2000 characters max).');

    setBusy(true);
    const { error: err } = await supabase.from('lead_capture').insert({
      full_name: fullName.trim(),
      email: email.trim(),
      phone: normalizedPhone,
      user_category: category,
      message: message.trim() || null,
      id_property: propertyId ?? null,
      source_url: window.location.href.slice(0, 2048),
    });
    setBusy(false);
    if (err) return setError(formatErrorMessage(err));
    setDone(true);
  };

  if (done) {
    return (
      <div className="alert-ok" role="status">
        Thank you. Your request has been received and the NVI team will reply shortly.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4" noValidate>
      <h3 className="text-2xl">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="lead-name">Full name</label>
          <input id="lead-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
        </div>
        <div>
          <label className="label" htmlFor="lead-email">Email</label>
          <input id="lead-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="lead-phone">Phone (+212)</label>
          <input id="lead-phone" type="tel" className="input" placeholder="+212 6 12 34 56 78" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required />
        </div>
        <div>
          <label className="label" htmlFor="lead-category">I am a…</label>
          <select id="lead-category" className="input" value={category} onChange={(e) => setCategory(e.target.value)} required>
            <option value="">Select…</option>
            {LEAD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="lead-message">Project message</label>
        <textarea id="lead-message" rows={4} className="input" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="Tell us about your project, portfolio size or what you are looking for." />
      </div>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <button type="submit" className="btn-gold w-full sm:w-auto" disabled={busy}>
        {busy ? 'Sending…' : 'Send request'}
      </button>
    </form>
  );
}
