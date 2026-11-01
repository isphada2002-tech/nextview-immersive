import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Scene } from '../lib/types';

interface Row {
  id_scene: number | null;
  views_count: number;
  time_spent_seconds: number;
  device_type: string;
}

interface Props {
  tourIds: number[];
  scenes: Scene[];
  leadCount: number;
}

export default function AnalyticsDashboard({ tourIds, scenes, leadCount }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tourIds.length) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from('analytics_log')
      .select('id_scene, views_count, time_spent_seconds, device_type')
      .in('id_tour', tourIds)
      .then(({ data }) => {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
  }, [tourIds]);

  const stats = useMemo(() => {
    const views = rows.reduce((n, r) => n + r.views_count, 0);
    const seconds = rows.reduce((n, r) => n + r.time_spent_seconds, 0);
    const devices: Record<string, number> = {};
    const perScene: Record<number, number> = {};
    for (const r of rows) {
      devices[r.device_type] = (devices[r.device_type] ?? 0) + r.views_count;
      if (r.id_scene != null) perScene[r.id_scene] = (perScene[r.id_scene] ?? 0) + r.time_spent_seconds;
    }
    const maxScene = Math.max(1, ...Object.values(perScene));
    const conversion = views > 0 ? ((leadCount / views) * 100).toFixed(1) : '0.0';
    return { views, seconds, devices, perScene, maxScene, conversion };
  }, [rows, leadCount]);

  if (loading) return <p className="text-sm text-white/50">Loading analytics…</p>;
  if (!rows.length) return <p className="text-sm text-white/50">No visitor data yet. Analytics appear once the tour is live and visited.</p>;

  const avgSeconds = stats.views > 0 ? Math.round(stats.seconds / stats.views) : 0;
  const deviceTotal = Object.values(stats.devices).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tour views" value={stats.views.toLocaleString()} />
        <Stat label="Engagement time" value={`${Math.round(stats.seconds / 60)} min`} />
        <Stat label="Avg. per view" value={`${avgSeconds} s`} />
        <Stat label="Lead conversion" value={`${stats.conversion}%`} />
      </div>

      <div>
        <h4 className="label">Room heatmap (time spent per room)</h4>
        {scenes.length === 0 ? (
          <p className="text-sm text-white/50">No rooms recorded.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {scenes.map((s) => {
              const t = stats.perScene[s.id_scene] ?? 0;
              const intensity = t / stats.maxScene;
              return (
                <div
                  key={s.id_scene}
                  className="rounded-md border border-white/10 p-3 text-sm"
                  style={{ background: `rgba(201,165,75,${(0.08 + intensity * 0.6).toFixed(2)})` }}
                >
                  <div className="font-medium">{s.scene_title}</div>
                  <div className="text-xs text-white/70">{Math.round(t / 60)} min</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h4 className="label">Devices</h4>
        <ul className="space-y-2 text-sm">
          {Object.entries(stats.devices).map(([device, count]) => (
            <li key={device}>
              <div className="mb-1 flex justify-between text-white/70"><span className="capitalize">{device}</span><span>{Math.round((count / deviceTotal) * 100)}%</span></div>
              <div className="h-1.5 rounded-full bg-white/10"><div className="h-1.5 rounded-full bg-gold" style={{ width: `${(count / deviceTotal) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-navy-900 p-3">
      <div className="text-xs uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-1 font-display text-2xl text-gold">{value}</div>
    </div>
  );
}
