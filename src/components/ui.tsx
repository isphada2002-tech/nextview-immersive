import { Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { CONTACT } from '../lib/format';

export function Spinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const home = profile?.role === 'agency' ? '/agency' : profile?.role === 'photographer' ? '/photographer' : profile?.role === 'admin' ? '/admin' : '/';

  return (
    <div className="min-h-screen bg-navy-900">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-display text-xl tracking-wide">
            NVI <span className="text-gold">Immersive</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {session && profile ? (
              <>
                <button className="text-white/70 hover:text-gold" onClick={() => navigate(home)}>
                  {profile.role === 'admin' ? 'Admin' : profile.role === 'agency' ? 'Agency portal' : profile.role === 'photographer' ? 'Photographer portal' : 'Home'}
                </button>
                <button className="btn-ghost !px-3 !py-1.5" onClick={async () => { await signOut(); navigate('/'); }}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <a href={`mailto:${CONTACT.email}`} className="hidden text-white/70 hover:text-gold sm:inline">Contact</a>
                <Link to="/login" className="btn-gold !px-3 !py-1.5">Sign in</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 pb-24">{children}</main>
      <footer className="border-t border-white/10 py-6 text-center text-xs text-white/40">
        © {new Date().getFullYear()} NextView Immersive (NVI). Northern Morocco · Tangier & Tetouan
      </footer>
    </div>
  );
}

export function Badge({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'green' | 'red' | 'grey' }) {
  const tones = {
    gold: 'border-gold/50 text-gold',
    green: 'border-emerald-400/50 text-emerald-300',
    red: 'border-red-400/50 text-red-300',
    grey: 'border-white/20 text-white/60',
  } as const;
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center">
      <div className="card my-8 w-full max-w-3xl !p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="text-xl">{title}</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white" aria-label="Close">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function StageTracker({ status }: { status: string }) {
  const stages = [
    ['new_request', 'New Request'],
    ['photography', 'Photography'],
    ['qa_review', 'QA Review'],
    ['published', 'Published'],
  ] as const;
  const idx = status === 'sold' ? 3 : stages.findIndex(([k]) => k === status);
  return (
    <ol className="grid grid-cols-4 gap-2 text-[11px] sm:text-xs" aria-label="Production status">
      {stages.map(([key, label], i) => (
        <li key={key} className="flex flex-col items-start gap-1">
          <span className={`h-1.5 w-full rounded-full ${i <= idx ? 'bg-gold' : 'bg-white/15'}`} />
          <span className={i <= idx ? 'text-white' : 'text-white/40'}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function ActionBar() {
  const items = [
    CONTACT.phone && { label: 'Call', href: `tel:${CONTACT.phone}` },
    { label: 'Email', href: `mailto:${CONTACT.email}` },
    { label: 'Request', href: '#lead' },
    CONTACT.whatsapp && { label: 'WhatsApp', href: `https://wa.me/${CONTACT.whatsapp.replace(/\D/g, '')}` },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/30 bg-navy-900/95 backdrop-blur" aria-label="Quick actions">
      <ul className="mx-auto grid max-w-md grid-cols-4 text-center text-sm">
        {items.map((item) => (
          <li key={item.label}>
            <a href={item.href} className="block py-3 text-white/80 hover:text-gold" target={item.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
