import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Hotspot, Scene } from '../lib/types';

declare global {
  interface Window {
    pannellum?: { viewer: (el: HTMLElement, config: unknown) => PannellumViewer };
  }
}
interface PannellumViewer {
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  destroy: () => void;
}

const PANNELLUM_VERSION = '2.5.6';
const CSS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pannellum/${PANNELLUM_VERSION}/pannellum.css`;
const JS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pannellum/${PANNELLUM_VERSION}/pannellum.js`;

function loadPannellum(): Promise<void> {
  if (window.pannellum) return Promise.resolve();
  if (!document.querySelector(`link[href="${CSS_URL}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    document.head.appendChild(link);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${JS_URL}"]`);
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = JS_URL;
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Could not load the 360° viewer')));
  });
}

function deviceType(): 'desktop' | 'mobile' | 'tablet' {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi/i.test(ua)) return 'mobile';
  return 'desktop';
}

interface Props {
  tourId: number;
  scenes: Scene[];
  hotspots: Hotspot[];
  /** Only public visitors on live tours are tracked. Internal previews pass false. */
  track?: boolean;
}

export default function TourViewer({ tourId, scenes, hotspots, track = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scenes.length || !containerRef.current) return;
    let cancelled = false;
    let viewer: PannellumViewer | null = null;
    let interval: number | undefined;

    const sessionId = crypto.randomUUID();
    const device = deviceType();
    let currentScene = scenes[0].id_scene;
    let views = 1;
    let seconds = 0;

    const flush = async () => {
      if (!track || (views === 0 && seconds === 0)) return;
      const payload = {
        id_tour: tourId,
        id_scene: currentScene,
        session_id: sessionId,
        views_count: views,
        time_spent_seconds: seconds,
        device_type: device,
      };
      views = 0;
      seconds = 0;
      await supabase.from('analytics_log').insert(payload);
    };

    loadPannellum()
      .then(() => {
        if (cancelled || !containerRef.current || !window.pannellum) return;
        const config = {
          default: { firstScene: String(scenes[0].id_scene), sceneFadeDuration: 600, autoLoad: true },
          scenes: Object.fromEntries(
            scenes.map((s) => [
              String(s.id_scene),
              {
                title: s.scene_title,
                type: 'equirectangular',
                panorama: s.image_url,
                yaw: s.initial_view_parameters?.yaw ?? 0,
                pitch: s.initial_view_parameters?.pitch ?? 0,
                hfov: s.initial_view_parameters?.hfov ?? 100,
                hotSpots: hotspots
                  .filter((h) => h.id_scene === s.id_scene)
                  .map((h) =>
                    h.target_scene_id
                      ? { pitch: Number(h.pitch), yaw: Number(h.yaw), type: 'scene', text: h.title, sceneId: String(h.target_scene_id) }
                      : { pitch: Number(h.pitch), yaw: Number(h.yaw), type: 'info', text: h.title },
                  ),
              },
            ]),
          ),
        };
        viewer = window.pannellum.viewer(containerRef.current, config);
        viewer.on('scenechange', (id: unknown) => {
          void flush();
          currentScene = Number(id);
          views += 1;
        });
        interval = window.setInterval(() => {
          if (!document.hidden) seconds += 1;
          if (seconds > 0 && seconds % 30 === 0) void flush();
        }, 1000);
      })
      .catch(() => { /* viewer stays blank; the landing page still shows the lead form */ });

    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
      viewer?.destroy();
    };
  }, [tourId, scenes, hotspots, track]);

  if (!scenes.length) {
    return <div className="card text-sm text-white/60">No 360° scenes have been published for this property yet.</div>;
  }
  return <div ref={containerRef} className="h-[60vh] min-h-[320px] w-full overflow-hidden rounded-xl border border-white/10 bg-black" aria-label="360° virtual tour" />;
}
