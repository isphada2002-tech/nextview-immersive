import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Shell, StageTracker, Badge, Spinner } from '../components/ui';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import TourViewer from '../components/TourViewer';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { CITIES, PROPERTY_TYPES, formatDate, formatErrorMessage, formatMAD, normalizeMoroccanPhone } from '../lib/format';
import type { Hotspot, Lead, Mission, Property, Scene, Tour } from '../lib/types';

interface PropertyRow extends Property {
  mission: Mission[];
}

export default function AgencyPortal() {
  const { profile } = useAuth();
  const [properties, setProperties] = useState<PropertyRow[] | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: props, error: pErr }, { data: ls }] = await Promise.all([
      supabase.from('property').select('*, mission(*)').order('created_at', { ascending: false }),
      supabase.from('lead_capture').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    if (pErr) setError(formatErrorMessage(pErr));
    setProperties((props as PropertyRow[]) ?? []);
    setLeads((ls as Lead[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!properties) return <Shell><Spinner /></Shell>;

  return (
    <Shell>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Agency & developer portal</p>
          <h1 className="mt-1 text-4xl">{profile?.agencyName ?? 'Your agency'}</h1>
        </div>
        <button className="btn-gold" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Close' : 'New property'}
        </button>
      </header>

      {error && <p className="alert-error mb-6" role="alert">{error}</p>}
      {showForm && <NewPropertyForm onCreated={async () => { setShowForm(false); await load(); }} />}

      <section className="space-y-5">
        <h2 className="text-2xl">Your properties</h2>
        {properties.length === 0 && <p className="text-white/60">No properties yet. Add one to request a 360° shoot.</p>}
        {properties.map((p) => (
          <PropertyCard key={p.id_property} property={p} leadCount={leads.filter((l) => l.id_property === p.id_property).length} onChanged={load} />
        ))}
      </section>

      <section className="mt-12">
        <h2 className="text-2xl">Recent inquiries</h2>
        <div className="card mt-4 overflow-x-auto !p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
              <tr><th className="p-3">Date</th><th className="p-3">Name</th><th className="p-3">Category</th><th className="p-3">Property</th><th className="p-3">Contact</th></tr>
            </thead>
            <tbody>
              {leads.length === 0 && <tr><td colSpan={5} className="p-3 text-white/50">No inquiries yet.</td></tr>}
              {leads.map((l) => (
                <tr key={l.id_lead} className="border-b border-white/5">
                  <td className="p-3 text-white/60">{formatDate(l.created_at)}</td>
                  <td className="p-3">{l.full_name}</td>
                  <td className="p-3 capitalize">{l.user_category}</td>
                  <td className="p-3">{l.id_property ? `#${l.id_property}` : '—'}</td>
                  <td className="p-3 text-white/70">{l.email}<br />{l.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}

function NewPropertyForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [type, setType] = useState<string>('apartment');
  const [city, setCity] = useState<string>('Tanger');
  const [units, setUnits] = useState('1');
  const [maskedAddress, setMaskedAddress] = useState('');
  const [exactAddress, setExactAddress] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [requestNow, setRequestNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const phone = normalizeMoroccanPhone(clientPhone);
    if (title.trim().length < 3) return setError('Give the property a title (3+ characters).');
    if (!maskedAddress.trim()) return setError('Enter a public, approximate location (e.g. neighbourhood).');
    if (exactAddress.trim().length < 5) return setError('Enter the exact address. It stays hidden until a photographer signs the agreement.');
    if (!phone) return setError('Client phone must be a Moroccan number (+212).');
    setBusy(true);
    const { error: err } = await supabase.rpc('create_property', {
      p_data: {
        title: title.trim(),
        description: description.trim() || null,
        price: price || null,
        property_type: type,
        city,
        units_count: units,
        masked_address: maskedAddress.trim(),
        exact_address: exactAddress.trim(),
        client_phone: phone,
        target_date: targetDate ? new Date(targetDate).toISOString() : null,
      },
      p_request: requestNow,
    });
    setBusy(false);
    if (err) return setError(formatErrorMessage(err));
    onCreated();
  };

  return (
    <form onSubmit={submit} className="card mb-10 space-y-5" noValidate>
      <h2 className="text-2xl">New property</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="np-title">Title</label>
          <input id="np-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="np-type">Type</label>
          <select id="np-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="np-city">City</label>
          <select id="np-city" className="input" value={city} onChange={(e) => setCity(e.target.value)}>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="np-price">Price (MAD)</label>
          <input id="np-price" type="number" min="0" className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="np-units">Units</label>
          <input id="np-units" type="number" min="1" className="input" value={units} onChange={(e) => setUnits(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="np-masked">Public location (approximate)</label>
          <input id="np-masked" className="input" placeholder="e.g. Malabata, Tanger" value={maskedAddress} onChange={(e) => setMaskedAddress(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="np-exact">Exact address (private)</label>
          <input id="np-exact" className="input" value={exactAddress} onChange={(e) => setExactAddress(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="np-client-phone">Client phone (private, +212)</label>
          <input id="np-client-phone" type="tel" className="input" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+212 6 12 34 56 78" />
        </div>
        <div>
          <label className="label" htmlFor="np-date">Preferred shoot date</label>
          <input id="np-date" type="datetime-local" className="input" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="np-desc">Description</label>
          <textarea id="np-desc" rows={3} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-gold" checked={requestNow} onChange={(e) => setRequestNow(e.target.checked)} />
        Request photography now (mission {formatMAD(1800)}, photographer fee {formatMAD(450)} shown to photographers)
      </label>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <button className="btn-gold" disabled={busy}>{busy ? 'Saving…' : 'Save property'}</button>
    </form>
  );
}

function PropertyCard({ property, leadCount, onChanged }: { property: PropertyRow; leadCount: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mission = property.mission?.find((m) => m.mission_status !== 'cancelled') ?? null;

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: t } = await supabase.from('virtual_tour').select('*').eq('id_property', property.id_property).maybeSingle();
      setTour((t as Tour) ?? null);
      if (t) {
        const { data: s } = await supabase.from('scene_360').select('*').eq('id_tour', t.id_tour).order('position');
        const ids = (s ?? []).map((x) => x.id_scene);
        setScenes((s as Scene[]) ?? []);
        const { data: h } = ids.length ? await supabase.from('hotspot').select('*').in('id_scene', ids) : { data: [] };
        setHotspots((h as Hotspot[]) ?? []);
      }
    })();
  }, [open, property.id_property]);

  const requestShoot = async () => {
    setError(null);
    const { error: err } = await supabase.rpc('request_photography', { p_property: property.id_property, p_target_date: null });
    if (err) setError(formatErrorMessage(err)); else onChanged();
  };

  const landingUrl = `${window.location.origin}/property/${property.id_property}`;

  return (
    <article className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl">{property.title}</h3>
          <p className="text-sm text-white/60">{property.masked_address} · {property.city} · {property.units_count} unit(s)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{property.status.replace('_', ' ')}</Badge>
          {mission && <Badge tone={mission.mission_status === 'completed' ? 'green' : 'grey'}>Mission: {mission.mission_status}</Badge>}
        </div>
      </div>

      <StageTracker status={property.status} />

      {error && <p className="alert-error" role="alert">{error}</p>}

      <div className="flex flex-wrap gap-2 text-sm">
        {property.status === 'draft' && <button className="btn-gold !py-1.5" onClick={requestShoot}>Request photography</button>}
        {property.status === 'published' && (
          <>
            <a className="btn-ghost !py-1.5" href={landingUrl} target="_blank" rel="noreferrer">Open landing page</a>
            <button className="btn-ghost !py-1.5" onClick={() => navigator.clipboard?.writeText(landingUrl)}>Copy link</button>
          </>
        )}
        <button className="btn-ghost !py-1.5" onClick={() => setOpen((v) => !v)}>{open ? 'Hide details' : 'Tour & analytics'}</button>
        <span className="self-center text-white/50">{leadCount} inquiries · {formatDate(property.created_at)}</span>
      </div>

      {open && (
        <div className="space-y-6 border-t border-white/10 pt-5">
          {tour && tour.is_active && scenes.length > 0 && (
            <TourViewer tourId={tour.id_tour} scenes={scenes} hotspots={hotspots} />
          )}
          {tour && !tour.is_active && <p className="text-sm text-white/60">The tour is in NVI quality review.</p>}
          {!tour && <p className="text-sm text-white/60">No tour yet.</p>}
          {tour && <AnalyticsDashboard tourIds={[tour.id_tour]} scenes={scenes} leadCount={leadCount} />}
          <p className="text-xs text-white/40">
            Need to change the listing? <Link className="text-gold" to="/">Contact NVI</Link>.
          </p>
        </div>
      )}
    </article>
  );
}
