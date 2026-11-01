import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import contractRaw from '../content/contract.md?raw';
import { supabase } from '../lib/supabase';
import { formatErrorMessage } from '../lib/format';
import { Modal } from './ui';

/** The agreement text shown to photographers: sections 1–14 plus the signature block, without internal notes. */
function buildContractText(signDate: string): string {
  return contractRaw
    .split('## Implementation Items Before Publication')[0]
    .replace(/^> \*\*Alternative wording.*$/m, '')
    .replace(/```text[\s\S]*?```/, '')
    .replace('**Effective Date:** [●]', `**Effective Date:** ${signDate}`)
    .trim();
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Props {
  open: boolean;
  missionId: number;
  fullName: string;
  onClose: () => void;
  onSigned: () => void;
}

export default function ContractModal({ open, missionId, fullName, onClose, onSigned }: Props) {
  const today = useMemo(() => new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), []);
  const text = useMemo(() => buildContractText(today), [today]);
  const [accepted, setAccepted] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMatches = typedName.trim().toLowerCase() === fullName.trim().toLowerCase();
  const canSign = accepted && nameMatches && !busy;

  const sign = async () => {
    setBusy(true);
    setError(null);
    try {
      const hash = await sha256Hex(text);
      const { error: err } = await supabase.rpc('sign_contract', {
        p_mission: missionId,
        p_typed_name: typedName.trim(),
        p_text_sha256: hash,
      });
      if (err) throw err;
      onSigned();
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Service Level Agreement & Non-Circumvention" onClose={onClose}>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded-md border border-white/10 bg-navy-900 p-4 text-sm leading-relaxed text-white/80 [&_h1]:text-2xl [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:text-gold [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-white">
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>

      <div className="mt-5 space-y-4">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-gold" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>I have read and accept the Service Level Agreement and Non-Circumvention Engagement, including the 24-month restriction.</span>
        </label>
        <div>
          <label className="label" htmlFor="typed-name">Type your full name exactly as registered</label>
          <input id="typed-name" className="input" value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder={fullName} autoComplete="off" />
          {typedName && !nameMatches && <p className="mt-1 text-xs text-red-300">Must match: {fullName}</p>}
        </div>
        <p className="text-xs text-white/50">
          Signing records the date, time, your account, your IP address and a fingerprint of this exact text. Client contact details unlock only after signature.
        </p>
        {error && <p className="alert-error" role="alert">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-gold" onClick={sign} disabled={!canSign}>
            {busy ? 'Signing…' : 'I Accept and Sign Electronically'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
