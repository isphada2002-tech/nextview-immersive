# NextView Immersive (NVI)

PropTech platform connecting Northern Morocco agencies and developers with international buyers and MRE.
Stack: Vite · React · TypeScript · Tailwind · React Router · Supabase (Postgres, Auth, RLS, Edge Functions) · Vercel.

## Routes

| Path | Audience | Access |
|---|---|---|
| `/` | B2B public page, lead form, action bar | Public |
| `/property/:id` | Property landing page with 360° tour and lead form | Public (published listings only) |
| `/login` | Sign in / sign up (agency, photographer) | Public |
| `/agency` | Agencies & developers: properties, shoot requests, tour analytics, inquiries | `agency` |
| `/photographer` | Photographers: claim missions, sign agreement, reveal contact, submit tours | `photographer`, approved |
| `/admin` | NVI team: approvals, mission assignment, QA, payouts, inquiries | `admin` |

## 1. Create the Supabase project

1. Create a new, dedicated Supabase project.
2. Run the migrations in order in the SQL editor (or `supabase db push`):
   1. `supabase/migrations/0001_schema.sql`
   2. `supabase/migrations/0002_rls.sql`
   3. `supabase/migrations/0003_rpc.sql`
3. Authentication → URL configuration: set the Site URL to your Vercel domain. Keep email confirmation on.
4. Copy the project URL and the **anon** key into `.env.local` (see `.env.example`). Never put the service-role key in the frontend.

## 2. Create the first admin

Sign up once through `/login`, then promote the account in the SQL editor. Signup cannot grant the admin role, by design.

```sql
update public.users set role = 'admin' where email = 'you@example.com';
```

## 3. Lead routing

Built-in Supabase SMTP only sends authentication emails, so it cannot deliver lead notifications. Leads are routed with an Edge Function and an email provider (Resend in the default config).

```bash
supabase functions deploy route-lead --no-verify-jwt
supabase secrets set LEAD_WEBHOOK_SECRET="$(openssl rand -hex 32)" RESEND_API_KEY="re_..."
# optional: LEAD_ROUTING_EMAIL, LEAD_FROM_EMAIL (sender must be a verified domain)
```

Then create a **Database Webhook** in the Supabase dashboard:
- Table: `public.lead_capture`, event: `INSERT`
- Type: HTTP Request, method `POST`, URL `https://<project-ref>.supabase.co/functions/v1/route-lead`
- Header: `x-webhook-secret: <the same LEAD_WEBHOOK_SECRET>`

Every lead is also stored in `lead_capture` and visible in the admin console, so nothing is lost if email delivery fails.

## 4. Frontend environment

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
VITE_CONTACT_PHONE=+212...
VITE_CONTACT_WHATSAPP=212...
VITE_CONTACT_EMAIL=nextviewimmersive@gmail.com
```

## 5. Run and deploy

```bash
npm install
npm run dev        # local
npm run build      # type-check + production build
```

Vercel: import the repo, set the same `VITE_*` variables, and deploy. `vercel.json` provides the SPA rewrite and security headers.

## Security model

- **Masking:** `property` holds only masked address and phone. The exact address and client phone live in `property_secret`, which has no photographer policy.
- **Unlock:** `get_unlocked_contact()` returns exact data only if the calling photographer has a signed, unlocked contract for that mission.
- **Contract:** `sign_contract()` requires the photographer to be assigned, a typed name matching their registered name, and a SHA-256 fingerprint of the exact text shown. It records timestamp, IP (from the proxy's `x-forwarded-for`) and user agent.
- **State changes** (claiming, signing, tour submission, QA, settlement) are `SECURITY DEFINER` RPCs that re-check identity and state. Direct table writes are limited to what RLS explicitly allows.
- **Roles** come from `users.role`. Users cannot change their own role (policy `users_update_self`).

## Open items before production

- Fill the `[●]` placeholders in `src/content/contract.md` (legal entity, penalty amounts) and choose one jurisdiction city. The body currently says Tangier.
- Have the agreement reviewed by Moroccan counsel, and publish a separate privacy notice (Law 09-08).
- The 360° checklist items in the photographer portal are placeholders until NVI approves the real standard.
- Hotspots can be authored only directly in the database for now; there is no editor yet.
