# Proto Schools — school registration site

Standalone registration site for South African schools. It is **its own Vercel
project**: nothing in this folder is bundled into the main trade portal, and the
main portal's build never reads it.

Schools register here, land in the same Supabase `customers` table as trade
applicants flagged `is_school = true`, and get **instant access** — they can
sign in at https://proto.co.za and order straight away, with no approval queue.
They show a **SCHOOL** badge in the admin dashboard's Customer Management.

## Local development

```bash
cd schools
npm install
npm run dev
```

The form posts to `/api/register-school`, which only runs on Vercel. Use
`vercel dev` if you need the endpoint locally.

## Deploying

Create a **new Vercel project** pointed at this repository with:

| Setting | Value |
| --- | --- |
| Root Directory | `schools` |
| Framework preset | Other (`vercel.json` supplies the build) |
| Build command | `vite build` (from `vercel.json`) |
| Output directory | `dist` (from `vercel.json`) |

Then attach the domain (e.g. `schools.proto.co.za`).

### Environment variables

Set these on the new Vercel project — it does **not** inherit the main portal's:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Supabase project URL (`SUPABASE_URL` also accepted) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side account creation. Never expose to the browser |
| `BREVO_API_KEY` | no | Sends the "new school signup" alert. Registration still succeeds without it |
| `SIGNUP_NOTIFY_EMAILS` | no | Comma-separated alert recipients. Defaults to `online@proto.co.za,george@proto.co.za` |
| `BREVO_SENDER_NAME` / `BREVO_SENDER_EMAIL` | no | Sender identity, defaults to Proto Trading Online / online@proto.co.za |

### Database

Apply `migrations/067_school_signup.sql` (repo root) before or after deploying —
`api/register-school.js` retries the insert with progressively fewer columns, so
a registration never fails just because the migration has not run yet. Until it
is applied the school metadata (`is_school`, `school_role`, `supply_needs`) is
simply not stored, and the admin badge will not appear.

## What it collects

School name, whether it is a public or private school, the school's physical
address (street, suburb, city, postal code, province), contact name and role, work email, phone, password, and optional
supply-need chips, plus an explicit authorisation confirmation.

The one address is stored as both `company_address` and `delivery_address` — a
school is delivered to where it is.

## Rules this site follows

- Schools get **instant access** (`is_approved: true`). This is deliberate and
  differs from a trade application, which waits for an admin: a school buying
  classroom supplies is not a competing reseller, so the approval queue was
  judged not worth the friction. Note the trade-off — anyone who completes this
  form reaches the wholesale catalogue and trade pricing without vetting.
- Customer codes are still **never auto-generated** — always null until an admin
  allocates one.
- No WhatsApp messaging to customers.
