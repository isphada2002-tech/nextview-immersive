import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Shell, ActionBar, Spinner } from '../components/ui';
import LeadForm from '../components/LeadForm';
import TourViewer from '../components/TourViewer';
import { supabase } from '../lib/supabase';
import { formatMAD } from '../lib/format';
import type { Hotspot, Property, Scene, Tour } from '../lib/types';

interface TourBundle {
  tour: Tour;
  scenes: Scene[];
  hotspots: Hotspot[];
}

export default function PropertyLanding() {
  const { id } = useParams();
  const propertyId = Number(id);
  const [property, setProperty] = useState<Property | null>(null);
  const [bundle, setBundle] = useState<TourBundle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isInteger(propertyId)) { setLoading(false); return; }
    let active = true;
    (async () => {
      // Public RLS only returns published or sold properties; contact data is never selected here.
      const { data: p } = await supabase
        .from('property')
        .select('id_property, title, description, price, property_type, status, city, units_count, masked_address, client_phone_masked, created_at, id_agency')
        .eq('id_property', propertyId)
        .maybeSingle();
      let tourBundle: TourBundle | null = null;
      if (p) {
        const { data: t } = await supabase.from('virtual_tour').select('*').eq('id_property', propertyId).eq('is_active', true).maybeSingle();
        if (t) {
          const { data: scenes } = await supabase.from('scene_360').select('*').eq('id_tour', t.id_tour).order('position');
          const sceneIds = (scenes ?? []).map((s) => s.id_scene);
          const { data: hotspots } = sceneIds.length
            ? await supabase.from('hotspot').select('*').in('id_scene', sceneIds)
            : { data: [] as Hotspot[] };
          tourBundle = { tour: t as Tour, scenes: (scenes ?? []) as Scene[], hotspots: (hotspots ?? []) as Hotspot[] };
        }
      }
      if (!active) return;
      setProperty((p as Property) ?? null);
      setBundle(tourBundle);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [propertyId]);

  if (loading) return <Shell><Spinner /></Shell>;
  if (!property) {
    return (
      <Shell>
        <div className="py-20 text-center">
          <h1 className="text-3xl">Property not available</h1>
          <p className="mt-3 text-white/60">This listing is not published or no longer exists.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <article className="space-y-8">
        <header className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gold">{property.property_type} · {property.city}</p>
            <h1 className="mt-2 text-4xl sm:text-5xl">{property.title}</h1>
            <p className="mt-2 text-white/60">{property.masked_address ?? property.city}</p>
          </div>
          <div className="text-left lg:text-right">
            <div className="text-xs uppercase tracking-wider text-white/50">Price</div>
            <div className="font-display text-3xl text-gold">{property.price ? formatMAD(property.price) : 'On request'}</div>
          </div>
        </header>

        {bundle ? (
          <TourViewer tourId={bundle.tour.id_tour} scenes={bundle.scenes} hotspots={bundle.hotspots} track />
        ) : (
          <div className="card text-sm text-white/60">The 360° tour for this property is being prepared.</div>
        )}

        {property.description && (
          <section className="card">
            <h2 className="text-2xl">About this property</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/75">{property.description}</p>
          </section>
        )}

        <section id="lead" className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-3xl">Arrange a visit</h2>
            <p className="mt-3 text-white/70">Ask a question or book a guided viewing. Your request is sent to the listing agency through NVI.</p>
          </div>
          <LeadForm propertyId={property.id_property} title="Request information" />
        </section>
      </article>
      <ActionBar />
    </Shell>
  );
}
