import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Shell, Badge, Spinner } from '../components/ui';
import ContractModal from '../components/ContractModal';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { formatErrorMessage, formatMAD, formatDate } from '../lib/format';
import type { Mission, Property } from '../lib/types';

type Tab = 'available' | 'mine' | 'checklist';

interface MissionRow extends Mission {
  property: Pick<Property, 'id_property' | 'title' | 'property_type' | 'city' | 'units_count' | 'masked_address' | 'client_phone_masked' | 'status'>;
}

interface Contact {
  exact_address: string;
  client_phone: string;
}

export default function PhotographerPortal() {
  const { profile, loading } = useAuth();
  const [tab, setTab] = useState<Tab>('available');

  if (loading || !profile) return <Shell><Spinner /></Shell>;

  if (profile.photographerStatus !== 'active') {
    return (
      <Shell>
        <div className="mx-auto max-w-xl py-16 text-center">
          <h1 className="text-4xl">
            {profile.photographerStatus === 'suspended' ? 'Account suspended' : 'Account pending approval'}
          </h1>
          <p className="mt-4 text-white/70">
            {profile.photographerStatus === 'suspended'
              ? 'Your photographer access is suspended. Contact NVI for details.'
              : 'Thank you for registering. NVI reviews each photographer before missions become visible. You will be notified when your account is approved.'}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">Certified photographer · {profile.photographerCity}</p>
        <h1 className="mt-1 text-4xl">Welcome, {profile.fullName.split(' ')[0]}</h1>
      </header>

      <nav className="mb-8 flex gap-2 text-sm" role="tablist">
        {([
          ['available', 'Available missions'],
          ['mine', 'My missions'],
          ['checklist', '360° checklist'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key}
            className={`rounded-md px-4 py-2 ${tab === key ? 'bg-gold text-navy-900 font-semibold' : 'border border-white/15 text-white/70'}`}
            onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      {tab === 'available' && <AvailableMissions />}
      {tab === 'mine' && <MyMissions fullName={profile.fullName} />}
      {tab === 'checklist' && <Checklist />}
    </Shell>
  );
}

function AvailableMissions() {
  const [missions, setMissions] = useState<MissionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('mission')
      .select('*, property(id_property, title, property_type, city, units_count, masked_address, client_phone_masked, status)')
      .eq('mission_status', 'available')
      .order('created_at', { ascending: true });
    if (err) setError(formatErrorMessage(err));
    setMissions((data as MissionRow[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const claim = async (id: number) => {
    setError(null);
    const { error: err } = await supabase.rpc('claim_mission', { p_mission: id });
    if (err) setError(formatErrorMessage(err)); else void load();
  };

  if (!missions) return <Spinner />;
  return (
    <section className="space-y-4">
      {error && <p className="alert-error" role="alert">{error}</p>}
      {missions.length === 0 && <p className="text-white/60">No open missions in your city right now.</p>}
      <div className="grid gap-5 md:grid-cols-2">
        {missions.map((m) => (
          <article key={m.id_mission} className="card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-2xl">{m.property.title}</h2>
              <Badge>{m.property.city}</Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-white/50">Type</dt><dd className="capitalize">{m.property.property_type}</dd>
              <dt className="text-white/50">Units</dt><dd>{m.property.units_count}</dd>
              <dt className="text-white/50">Area (public)</dt><dd>{m.property.masked_address ?? '—'}</dd>
              <dt className="text-white/50">Target date</dt><dd>{formatDate(m.target_date)}</dd>
              <dt className="text-white/50">Mission reward</dt><dd>{formatMAD(m.mission_price)}</dd>
              <dt className="text-white/50">Your payout</dt><dd className="font-semibold text-gold">{formatMAD(m.photographer_fee)}</dd>
            </dl>
            <p className="text-xs text-white/40">Exact address and client contact unlock after you sign the service agreement.</p>
            <button className="btn-gold w-full" onClick={() => claim(m.id_mission)}>Claim mission</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function MyMissions({ fullName }: { fullName: string }) {
  const [missions, setMissions] = useState<MissionRow[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('mission')
      .select('*, property(id_property, title, property_type, city, units_count, masked_address, client_phone_masked, status)')
      .neq('mission_status', 'available')
      .neq('mission_status', 'cancelled')
      .order('created_at', { ascending: false });
    setMissions((data as MissionRow[]) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!missions) return <Spinner />;
  if (missions.length === 0) return <p className="text-white/60">You have no missions yet. Claim one from the available list.</p>;

  return (
    <div className="space-y-6">
      {missions.map((m) => (
        <MissionDetail key={m.id_mission} mission={m} fullName={fullName} onChanged={load} />
      ))}
    </div>
  );
}

function MissionDetail({ mission, fullName, onChanged }: { mission: MissionRow; fullName: string; onChanged: () => void }) {
  const [signOpen, setSignOpen] = useState(false);
  const [contact, setContact] = useState<Contact | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    setError(null);
    const { data, error: err } = await supabase.rpc('get_unlocked_contact', { p_mission: mission.id_mission });
    if (err) return setError(formatErrorMessage(err));
    setContact((data as Contact[])[0] ?? null);
  };

  const status = mission.mission_status;
  const isSigned = status === 'signed' || status === 'completed';

  return (
    <article className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl">{mission.property.title}</h2>
          <p className="text-sm text-white/60">{mission.property.city} · {mission.property.units_count} unit(s) · payout {formatMAD(mission.photographer_fee)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{status}</Badge>
          <Badge tone={mission.settlement_status === 'settled' ? 'green' : 'grey'}>
            {mission.settlement_status === 'settled' ? `Paid ${formatDate(mission.settled_at)}` : 'Payout pending'}
          </Badge>
        </div>
      </div>

      {error && <p className="alert-error" role="alert">{error}</p>}

      {status === 'assigned' && (
        <button className="btn-gold" onClick={() => setSignOpen(true)}>Sign service agreement</button>
      )}

      {isSigned && (
        <div className="space-y-3">
          {!contact ? (
            <button className="btn-ghost" onClick={reveal}>Reveal client contact</button>
          ) : (
            <div className="rounded-md border border-gold/40 bg-navy-900 p-4 text-sm">
              <div><span className="text-white/50">Exact address:</span> {contact.exact_address}</div>
              <div><span className="text-white/50">Client phone:</span> {contact.client_phone}</div>
            </div>
          )}
        </div>
      )}

      {status === 'signed' && <TourUpload missionId={mission.id_mission} onSubmitted={onChanged} />}

      {status === 'completed' && (
        <p className="text-sm text-white/60">Your tour is in NVI quality review. You will be notified if changes are needed.</p>
      )}

      <ContractModal
        open={signOpen}
        missionId={mission.id_mission}
        fullName={fullName}
        onClose={() => setSignOpen(false)}
        onSigned={() => { setSignOpen(false); onChanged(); }}
      />
    </article>
  );
}

function TourUpload({ missionId, onSubmitted }: { missionId: number; onSubmitted: () => void }) {
  const [tourUrl, setTourUrl] = useState('');
  const [embed, setEmbed] = useState('');
  const [scenesText, setScenesText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const lines = scenesText.split('\n').map((l) => l.trim()).filter(Boolean);
    const scenes = lines.map((line) => {
      const [title, image_url, yaw, pitch] = line.split('|').map((s) => s.trim());
      return { title, image_url, yaw: yaw ? Number(yaw) : 0, pitch: pitch ? Number(pitch) : 0 };
    });
    if (scenes.length === 0) return setError('Add at least one scene: Title | https://image-url | yaw | pitch');
    if (scenes.some((s) => !s.image_url || !s.image_url.startsWith('https://'))) return setError('Every scene needs an https:// image URL.');
    if (!tourUrl.startsWith('https://')) return setError('The tour URL must start with https://');

    setBusy(true);
    const { error: err } = await supabase.rpc('submit_tour', {
      p_mission: missionId,
      p_tour_url: tourUrl.trim(),
      p_embed_code: embed.trim() || null,
      p_scenes: scenes,
    });
    setBusy(false);
    if (err) return setError(formatErrorMessage(err));
    onSubmitted();
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-white/10 pt-4" noValidate>
      <h3 className="text-lg">Submit the finished tour</h3>
      <div>
        <label className="label" htmlFor={`tour-url-${missionId}`}>Hosted tour URL (https)</label>
        <input id={`tour-url-${missionId}`} className="input" value={tourUrl} onChange={(e) => setTourUrl(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor={`tour-scenes-${missionId}`}>Scenes, one per line: Title | https://image | yaw | pitch</label>
        <textarea id={`tour-scenes-${missionId}`} rows={5} className="input font-mono text-xs" value={scenesText} onChange={(e) => setScenesText(e.target.value)} placeholder={'Living room | https://cdn.example.com/lr.jpg | 0 | 0\nKitchen | https://cdn.example.com/k.jpg | 90 | 0'} />
      </div>
      <div>
        <label className="label" htmlFor={`tour-embed-${missionId}`}>Embed code (optional)</label>
        <input id={`tour-embed-${missionId}`} className="input font-mono text-xs" value={embed} onChange={(e) => setEmbed(e.target.value)} />
      </div>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <button className="btn-gold" disabled={busy}>{busy ? 'Submitting…' : 'Submit for QA'}</button>
    </form>
  );
}

function Checklist() {
  const items = [
    'Camera and lens combination meets the NVI minimum specification (see equipment list on your profile).',
    'Capture every room in the agreed sequence: entrance, living areas, kitchen, bedrooms, bathrooms, terraces.',
    'Shoot with the camera level; no visible tripod, feet or reflections in the frame.',
    'Use daylight or balanced lighting; turn on every light in the property before capture.',
    'Keep the file format and resolution required by the NVI technical brief.',
    'Confirm every scene loads at the expected yaw/pitch before submission.',
    'Remove or blur personal belongings and identifying documents visible in any frame.',
    'Delete all client data from your devices once the tour is accepted by NVI QA.',
  ];
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  return (
    <section className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-white/70">Run through this list before submitting any tour. Print it for your records.</p>
        <button className="btn-ghost" onClick={() => window.print()}>Print checklist</button>
      </div>
      <h2 className="text-2xl">360° Audit Checklist</h2>
      <ol className="space-y-3">
        {items.map((item, i) => (
          <li key={item} className="flex gap-3">
            <input type="checkbox" className="no-print mt-1 h-4 w-4 accent-gold" checked={checked[i]} onChange={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))} aria-label={`Done: ${item}`} />
            <span className="text-sm text-white/80">{item}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
