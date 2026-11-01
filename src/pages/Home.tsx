import { Shell } from '../components/ui';
import LeadForm from '../components/LeadForm';
import { ActionBar } from '../components/ui';
import { CONTACT } from '../lib/format';

const audiences = [
  {
    title: 'Agencies & Developers',
    body: 'Sell from a single listing with a 360° tour, a virtual sales office and a landing page for each property. Track who looks at what and which rooms hold attention.',
  },
  {
    title: 'Moroccans Residing Abroad',
    body: 'Walk through a property in Tangier or Tetouan from Brussels, Paris or Montreal, at your own pace, and book a guided visit when you are ready.',
  },
  {
    title: 'Certified Photographers',
    body: 'Take on assignments in your city through a managed marketplace. Clear briefs, a fixed fee per property and a standard quality checklist.',
  },
];

export default function Home() {
  return (
    <Shell>
      <section className="grid items-center gap-10 py-10 lg:grid-cols-2">
        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.3em] text-gold">Northern Morocco · PropTech</p>
          <h1 className="text-5xl leading-tight sm:text-6xl">
            Property you can <span className="text-gold italic">walk through</span> from anywhere in the world.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            NVI produces 360° virtual tours, virtual sales offices and property landing pages for real estate agencies and developers in Tangier and Tetouan, built for buyers who cannot visit first.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#lead" className="btn-gold">Request a demo</a>
            <a href={`mailto:${CONTACT.email}`} className="btn-ghost">{CONTACT.email}</a>
          </div>
        </div>
        <div className="card aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-navy-700 to-navy-900">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-gold text-gold">360°</div>
            <p className="font-display text-2xl">Immersive NextView</p>
            <p className="mt-2 text-sm text-white/50">Tours · Virtual offices · Property pages · Visitor analytics</p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 py-10 md:grid-cols-3">
        {audiences.map((a) => (
          <article key={a.title} className="card">
            <h2 className="text-2xl text-gold">{a.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">{a.body}</p>
          </article>
        ))}
      </section>

      <section id="lead" className="grid gap-10 py-10 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="text-4xl">Let’s talk about your project</h2>
          <p className="mt-4 text-white/70">
            Tell us who you are and what you need. Every request goes straight to the NVI team at {CONTACT.email}.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-white/60">
            <li>• Phone numbers in Moroccan +212 format</li>
            <li>• Your details are used only to answer your request</li>
          </ul>
        </div>
        <LeadForm title="Request a demo or a quote" />
      </section>

      <ActionBar />
    </Shell>
  );
}
