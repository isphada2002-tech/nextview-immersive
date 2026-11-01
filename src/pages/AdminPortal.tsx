import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Shell, Badge, Spinner } from '../components/ui';
import TourViewer from '../components/TourViewer';
import { supabase } from '../lib/supabase';
import { formatDate, formatDateTime, formatErrorMessage, formatMAD } from '../lib/format';
import type { Hotspot, Lead, Mission, Photographer, Property, Scene, Tour } from '../lib/types';

interface PhotographerRow extends Photographer {
  users: { full_name: string; email: string; phone: string | null } | null;
}
interface MissionRow extends Mission {
  property: Pick<Property, 'id_property' | 'title' | 'city' | 'property_type' | 'status'> | null;
}

export default function AdminPortal() {
  const [photographers, setPhotographers] = useState<PhotographerRow[]>([]);
  const [missions, setMissions] = useState<MissionRow[]>([]);
  const [qaQueue, setQaQueue] = useState<Property[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [ph, mi, qa, ld] = await Promise.all([
      supabase.from('photographer').select('*, users(full_name, email, phone)').order('created_at', { ascending: false }),
      supabase.from('mission').select('*, property(id_property, title, city, property_type, status)').order('created_at', { ascending: false }),
      supabase.from('property').select('*').eq('status', 'qa_review').order('created_at', { ascending: true }),
      supabase.from('lead_capture').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    const firstError = ph.error || mi.error || qa.error || ld.error;
    if (firstError) setError(formatErrorMessage(firstError));
    setPhotographers((ph.data as PhotographerRow[]) ?? []);
    setMissions((mi.data as MissionRow[]) ?? []);
    setQaQueue((qa.data as Property[]) ?? []);
    setLeads((ld.data as Lead[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => PromiseLike<{ error: unknown }>, ok: string) => {
    setError(null);
    setNotice(null);
    const { error: err } = await fn();
    if (err) setError(formatErrorMessage(err));
    else { setNotice(ok); await load(); }
  };

  const payouts = useMemo(() => {
    const completed = missions.filter((m) => m.mission_status === 'completed');
    const settled = completed.filter((m) => m.settlement_status === 'settled');
    return {
      revenue: completed.reduce((n, m) => n + Number(m.mission_price), 0),
      payoutsDue: completed.filter((m) => m.settlement_status === 'unpaid').reduce((n, m) => n + Number(m.photographer_fee), 0),
      payoutsSettled: settled.reduce((n, m) => n + Number(m.photographer_fee), 0),
    };
  }, [missions]);

  if (loading && !photographers.length) return <Shell><Spinner /></Shell>;
  const activePhotographers = photographers.filter((p) => p.status === 'active');

  return (
    <Shell>
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.25em] text-gold">NVI operations</p>
        <h1 className="mt-1 text-4xl">Admin console</h1>
      </header>

      {error && <p className="alert-error mb-4" role="alert">{error}</p>}
      {notice && <p className="alert-ok mb-4" role="status">{notice}</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Completed mission revenue" value={formatMAD(payouts.revenue)} />
        <Stat label="Payouts due" value={formatMAD(payouts.payoutsDue)} />
        <Stat label="Payouts settled" value={formatMAD(payouts.payoutsSettled)} />
        <Stat label="Active photographers" value={String(activePhotographers.length)} />
      </section>

      <Section title={`QA review queue (${qaQueue.length})`}>
        {qaQueue.length === 0 && <p className="text-white/60">Nothing waiting for review.</p>}
        <div className="space-y-6">
          {qaQueue.map((p) => (
            <QaItem key={p.id_property} property={p} onDecide={(approve) => run(() => supabase.rpc('qa_decision', { p_property: p.id_property, p_approve: approve }), approve ? 'Tour published.' : 'Sent back to the photographer.')} />
          ))}
        </div>
      </Section>

      <Section title={`Photographers (${photographers.length})`}>
        <div className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
              <tr><th className="p-3">Name</th><th className="p-3">City</th><th className="p-3">Contact</th><th className="p-3">Status</th><th className="p-3">Action</th></tr>
            </thead>
            <tbody>
              {photographers.length === 0 && <tr><td colSpan={5} className="p-3 text-white/50">No photographers registered.</td></tr>}
              {photographers.map((p) => (
                <tr key={p.id_photographer} className="border-b border-white/5">
                  <td className="p-3">{p.users?.full_name ?? '—'}</td>
                  <td className="p-3">{p.city}</td>
                  <td className="p-3 text-white/70">{p.users?.email}<br />{p.users?.phone}</td>
                  <td className="p-3"><Badge tone={p.status === 'active' ? 'green' : p.status === 'suspended' ? 'red' : 'gold'}>{p.status}</Badge></td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      {p.status !== 'active' && <button className="btn-gold !px-3 !py-1" onClick={() => run(() => supabase.from('photographer').update({ status: 'active' }).eq('id_photographer', p.id_photographer), 'Photographer approved.')}>Approve</button>}
                      {p.status === 'active' && <button className="btn-danger !px-3 !py-1" onClick={() => run(() => supabase.from('photographer').update({ status: 'suspended' }).eq('id_photographer', p.id_photographer), 'Photographer suspended.')}>Suspend</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`Missions (${missions.length})`}>
        <div className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
              <tr><th className="p-3">Property</th><th className="p-3">Status</th><th className="p-3">Photographer</th><th className="p-3">Fee</th><th className="p-3">Payout</th><th className="p-3">Actions</th></tr>
            </thead>
            <tbody>
              {missions.length === 0 && <tr><td colSpan={6} className="p-3 text-white/50">No missions yet.</td></tr>}
              {missions.map((m) => (
                <MissionRowView key={m.id_mission} mission={m} photographers={activePhotographers} photographerName={(id) => photographers.find((p) => p.id_photographer === id)?.users?.full_name ?? `#${id}`} onAssign={(pid) => run(() => supabase.rpc('admin_assign_mission', { p_mission: m.id_mission, p_photographer: pid }), 'Mission assigned.')} onSettle={(settled) => run(() => supabase.rpc('settle_mission', { p_mission: m.id_mission, p_settled: settled }), settled ? 'Payout marked settled.' : 'Payout reopened.')} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`Inquiries (${leads.length})`}>
        <div className="card overflow-x-auto !p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
              <tr><th className="p-3">Received</th><th className="p-3">Name</th><th className="p-3">Category</th><th className="p-3">Contact</th><th className="p-3">Routed</th></tr>
            </thead>
            <tbody>
              {leads.length === 0 && <tr><td colSpan={5} className="p-3 text-white/50">No inquiries yet.</td></tr>}
              {leads.map((l) => (
                <tr key={l.id_lead} className="border-b border-white/5 align-top">
                  <td className="p-3 text-white/60">{formatDateTime(l.created_at)}</td>
                  <td className="p-3">{l.full_name}</td>
                  <td className="p-3 capitalize">{l.user_category}</td>
                  <td className="p-3 text-white/70">{l.email}<br />{l.phone}</td>
                  <td className="p-3">{l.forwarded_at ? <Badge tone="green">{formatDate(l.forwarded_at)}</Badge> : <Badge tone="gold">Pending</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card !p-4">
      <div className="text-xs uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-1 font-display text-2xl text-gold">{value}</div>
    </div>
  );
}

function MissionRowView({ mission, photographers, photographerName, onAssign, onSettle }: {
  mission: MissionRow;
  photographers: PhotographerRow[];
  photographerName: (id: number) => string;
  onAssign: (photographerId: number) => void;
  onSettle: (settled: boolean) => void;
}) {
  const [pick, setPick] = useState<number | ''>('');
  const canAssign = mission.mission_status === 'available' || mission.mission_status === 'assigned';
  return (
    <tr className="border-b border-white/5 align-top">
      <td className="p-3">{mission.property?.title ?? `#${mission.id_property}`}<div className="text-xs text-white/50">{mission.property?.city}</div></td>
      <td className="p-3"><Badge>{mission.mission_status}</Badge></td>
      <td className="p-3">{mission.id_photographer ? photographerName(mission.id_photographer) : '—'}</td>
      <td className="p-3">{formatMAD(mission.photographer_fee)}</td>
      <td className="p-3"><Badge tone={mission.settlement_status === 'settled' ? 'green' : 'grey'}>{mission.settlement_status}</Badge></td>
      <td className="p-3">
        <div className="flex flex-col gap-2">
          {canAssign && (
            <div className="flex gap-2">
              <select className="input !py-1 text-xs" value={pick} onChange={(e) => setPick(e.target.value ? Number(e.target.value) : '')} aria-label="Choose photographer">
                <option value="">Choose…</option>
                {photographers.map((p) => <option key={p.id_photographer} value={p.id_photographer}>{p.users?.full_name} ({p.city})</option>)}
              </select>
              <button className="btn-gold !px-3 !py-1 text-xs" disabled={pick === ''} onClick={() => pick !== '' && onAssign(pick)}>Assign</button>
            </div>
          )}
          {mission.mission_status === 'completed' && (
            <button className="btn-ghost !px-3 !py-1 text-xs" onClick={() => onSettle(mission.settlement_status !== 'settled')}>
              {mission.settlement_status === 'settled' ? 'Reopen payout' : 'Mark paid'}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function QaItem({ property, onDecide }: { property: Property; onDecide: (approve: boolean) => void }) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from('virtual_tour').select('*').eq('id_property', property.id_property).maybeSingle();
      if (!t) return;
      setTour(t as Tour);
      const { data: s } = await supabase.from('scene_360').select('*').eq('id_tour', t.id_tour).order('position');
      setScenes((s as Scene[]) ?? []);
      const ids = (s ?? []).map((x) => x.id_scene);
      const { data: h } = ids.length ? await supabase.from('hotspot').select('*').in('id_scene', ids) : { data: [] };
      setHotspots((h as Hotspot[]) ?? []);
    })();
  }, [property.id_property]);

  return (
    <article className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl">{property.title}</h3>
          <p className="text-sm text-white/60">{property.city} · {property.masked_address} · {scenes.length} scene(s)</p>
          {tour?.tour_url && <a className="text-xs text-gold" href={tour.tour_url} target="_blank" rel="noreferrer">Open hosted tour ↗</a>}
        </div>
        <div className="flex gap-2">
          <button className="btn-danger" onClick={() => onDecide(false)}>Send back</button>
          <button className="btn-gold" onClick={() => onDecide(true)} disabled={!tour}>Approve & publish</button>
        </div>
      </div>
      {tour && scenes.length > 0 && <TourViewer tourId={tour.id_tour} scenes={scenes} hotspots={hotspots} />}
      {!tour && <p className="text-sm text-red-300">No tour found for this property. Send it back.</p>}
    </article>
  );
}
