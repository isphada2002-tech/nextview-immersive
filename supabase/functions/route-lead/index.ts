// Routes new lead_capture rows to the NVI inbox.
// Triggered by a Supabase Database Webhook (INSERT on public.lead_capture).
//
// Required secrets (supabase secrets set ...):
//   LEAD_WEBHOOK_SECRET   shared secret checked against the x-webhook-secret header
//   RESEND_API_KEY        email provider key (see README: built-in Auth SMTP cannot send lead notifications)
// Optional:
//   LEAD_ROUTING_EMAIL    defaults to nextviewimmersive@gmail.com
//   LEAD_FROM_EMAIL       defaults to a Resend sandbox sender

import { createClient } from 'npm:@supabase/supabase-js@2';

const WEBHOOK_SECRET = Deno.env.get('LEAD_WEBHOOK_SECRET');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ROUTE_TO = Deno.env.get('LEAD_ROUTING_EMAIL') ?? 'nextviewimmersive@gmail.com';
const FROM = Deno.env.get('LEAD_FROM_EMAIL') ?? 'NVI Leads <onboarding@resend.dev>';

const CATEGORY_LABEL: Record<string, string> = {
  agency: 'Real Estate Agency',
  developer: 'Property Developer',
  photographer: 'Freelance Photographer',
  mre: 'Moroccan Residing Abroad (MRE)',
};

interface LeadRecord {
  id_lead: number;
  id_property: number | null;
  full_name: string;
  email: string;
  phone: string;
  user_category: string;
  message: string | null;
  source_url: string | null;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!RESEND_API_KEY) return new Response('Email provider not configured', { status: 500 });

  const payload = await req.json().catch(() => null);
  const lead = payload?.record as LeadRecord | undefined;
  if (!lead?.id_lead) return new Response('Bad request', { status: 400 });

  const subject = `New NVI inquiry — ${CATEGORY_LABEL[lead.user_category] ?? lead.user_category} — ${lead.full_name}`;
  const text = [
    `Name: ${lead.full_name}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone}`,
    `Category: ${CATEGORY_LABEL[lead.user_category] ?? lead.user_category}`,
    `Property ID: ${lead.id_property ?? 'n/a'}`,
    `Source: ${lead.source_url ?? 'n/a'}`,
    `Received: ${lead.created_at}`,
    '',
    'Project message:',
    lead.message ?? '(none)',
    '',
    `Lead reference: #${lead.id_lead}`,
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [ROUTE_TO], reply_to: lead.email, subject, text }),
  });
  if (!res.ok) {
    console.error('email provider error', res.status, await res.text());
    return new Response('Provider error', { status: 502 });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await admin.from('lead_capture').update({ forwarded_at: new Date().toISOString() }).eq('id_lead', lead.id_lead);

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
