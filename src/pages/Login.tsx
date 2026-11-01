import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Shell } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { CITIES, EMAIL_RE, PHONE_RE, formatErrorMessage, normalizeMoroccanPhone } from '../lib/format';

type Mode = 'signin' | 'signup';
type SignupRole = 'agency' | 'photographer';

export default function Login() {
  const { profile, session, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [role, setRole] = useState<SignupRole>('agency');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [city, setCity] = useState<string>('Tanger');
  const [equipment, setEquipment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    if (profile.role === 'admin') navigate('/admin', { replace: true });
    else if (profile.role === 'agency') navigate('/agency', { replace: true });
    else if (profile.role === 'photographer') navigate('/photographer', { replace: true });
  }, [profile, navigate]);

  if (!loading && session && profile?.role === 'lead') return <Navigate to="/" replace />;

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(formatErrorMessage(err));
  };

  const signUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (fullName.trim().length < 2) return setError('Please enter your full name.');
    if (!EMAIL_RE.test(email.trim())) return setError('Please enter a valid email address.');
    if (password.length < 10) return setError('Use at least 10 characters for your password.');
    const normalizedPhone = normalizeMoroccanPhone(phone);
    if (!normalizedPhone || !PHONE_RE.test(normalizedPhone)) return setError('Enter a Moroccan phone number, e.g. +212 6 12 34 56 78.');
    if (role === 'agency' && agencyName.trim().length < 2) return setError('Please enter your agency or developer name.');

    setBusy(true);
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          role,
          full_name: fullName.trim(),
          phone: normalizedPhone,
          city,
          agency_name: role === 'agency' ? agencyName.trim() : undefined,
          equipment_specs: role === 'photographer' ? equipment.trim() || undefined : undefined,
        },
      },
    });
    setBusy(false);
    if (err) return setError(formatErrorMessage(err));
    setNotice(
      role === 'photographer'
        ? 'Account created. Check your email to confirm it. Photographer accounts stay pending until NVI approves them.'
        : 'Account created. Check your email to confirm it, then sign in.',
    );
    setMode('signin');
  };

  return (
    <Shell>
      <div className="mx-auto max-w-md">
        <h1 className="text-4xl">{mode === 'signin' ? 'Sign in' : 'Create an account'}</h1>
        <p className="mt-2 text-sm text-white/60">
          {mode === 'signin'
            ? 'Agencies, developers and approved photographers sign in here.'
            : 'Register as an agency/developer or as a certified photographer.'}
        </p>

        <div className="mt-6 flex gap-2 rounded-md bg-navy-800 p-1 text-sm" role="tablist">
          {(['signin', 'signup'] as Mode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m}
              className={`flex-1 rounded px-3 py-2 ${mode === m ? 'bg-gold text-navy-900 font-semibold' : 'text-white/70'}`}
              onClick={() => { setMode(m); setError(null); setNotice(null); }}>
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        {notice && <p className="alert-ok mt-4" role="status">{notice}</p>}
        {error && <p className="alert-error mt-4" role="alert">{error}</p>}

        {mode === 'signin' ? (
          <form onSubmit={signIn} className="card mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="si-email">Email</label>
              <input id="si-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </div>
            <div>
              <label className="label" htmlFor="si-pass">Password</label>
              <input id="si-pass" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            <button className="btn-gold w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
        ) : (
          <form onSubmit={signUp} className="card mt-5 space-y-4" noValidate>
            <fieldset className="grid grid-cols-2 gap-2 text-sm">
              <legend className="label">I am a</legend>
              {(['agency', 'photographer'] as SignupRole[]).map((r) => (
                <label key={r} className={`cursor-pointer rounded-md border px-3 py-2 text-center capitalize ${role === r ? 'border-gold text-gold' : 'border-white/15 text-white/70'}`}>
                  <input type="radio" name="role" value={r} className="sr-only" checked={role === r} onChange={() => setRole(r)} />
                  {r === 'agency' ? 'Agency / developer' : 'Photographer'}
                </label>
              ))}
            </fieldset>
            <div>
              <label className="label" htmlFor="su-name">Full name</label>
              <input id="su-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
            </div>
            {role === 'agency' && (
              <div>
                <label className="label" htmlFor="su-agency">Agency or developer name</label>
                <input id="su-agency" className="input" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} required />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="su-email">Email</label>
                <input id="su-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </div>
              <div>
                <label className="label" htmlFor="su-phone">Phone (+212)</label>
                <input id="su-phone" type="tel" className="input" placeholder="+212 6 12 34 56 78" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="su-city">City</label>
                <select id="su-city" className="input" value={city} onChange={(e) => setCity(e.target.value)}>
                  {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="su-pass">Password</label>
                <input id="su-pass" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={10} required />
              </div>
            </div>
            {role === 'photographer' && (
              <div>
                <label className="label" htmlFor="su-equip">Equipment (camera, lens, tripod)</label>
                <textarea id="su-equip" rows={3} className="input" value={equipment} onChange={(e) => setEquipment(e.target.value)} />
              </div>
            )}
            <button className="btn-gold w-full" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
          </form>
        )}
      </div>
    </Shell>
  );
}
