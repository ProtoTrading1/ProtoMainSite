# Proto Trading Online — Launch Checklist (domain move to proto.co.za)

Work top to bottom. Every step has a **verify** line — do not move on until it passes.
Rollback for the whole launch is one DNS record (see the end).

---

## Part 0 — Before touching anything (today)

- [ ] **Export/screenshot the current DNS zone for proto.co.za.**
      Every record: A, CNAME, MX, TXT (SPF/DKIM/DMARC). This is your rollback map.
- [ ] **Identify where the OLD proto.co.za site is hosted** and leave that hosting
      untouched — rollback = pointing DNS back at it.
- [ ] **Brevo plan check:** every registration sends 2 emails, every approval 1 more,
      every order 2. Confirm the daily send limit covers launch volume.
- [ ] **Vercel env cleanup:**
  - Portal project: DELETE `ORDER_TO_EMAIL` (still adds the retired
    orders@prototrading.co.za). Delete any `WATI_*` vars.
  - Admin project: delete any `WATI_*` vars.
  - Confirm `ORDER_NOTIFY_SECRET` is set and IDENTICAL in both projects
    (order status flow depends on it).
  - Confirm present: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL=online@proto.co.za`,
    `VITE_SUPABASE_*`, `VITE_STOCK_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`,
    `CRON_SECRET`, `WEBHOOK_SECRET` (admin, Brevo webhook), `RESET_TOKEN_SECRET`.

## Part 1 — Make the ERP bridge permanent (BLADERUNNER-PC, any time — independent of the domain)

The bridge is a LAN service + a Cloudflare Tunnel on the subdomain
`sql-bridge.proto.co.za`. **Subdomain records are independent of the apex** —
none of this touches the old site, and tomorrow's apex flip cannot break the
bridge. Full detail: protoportal-admin/scripts/install-sql-bridge-service.md.

- [ ] On BLADERUNNER-PC, as Administrator:
      `powershell -ExecutionPolicy Bypass -File scripts\install-sql-bridge-task.ps1`
      (registers the **ProtoSqlBridge** scheduled task: starts at logon,
      auto-restarts 3× on failure).
- [ ] Install the tunnel as a service: `cloudflared service install <token>`
      (from Cloudflare Zero Trust → Tunnels — a Windows service survives reboots).
- [ ] **Reboot BLADERUNNER-PC** and verify both came back without touching anything:
      the admin header bridge dot is GREEN, and a Product Loader lookup fills
      price/stock from Positill.

## Part 2 — The domain move (launch moment)

- [ ] Vercel → portal project → **Domains** → add `proto.co.za` and `www.proto.co.za`.
      **DO NOT remove `site.proto.co.za`** — the admin's server-to-server order
      calls, the team PDF links and the email logo assets use it. It stays for good.
- [ ] DNS (zone proto.co.za): change ONLY the web records —
      apex `A` → `76.76.21.21` (or exactly what Vercel shows), `www` CNAME →
      `cname.vercel-dns.com`.
      **Touch nothing else. Never MX or TXT** — @proto.co.za mailboxes and email
      authentication (SPF/DKIM) live on those records. Leave `sql-bridge`,
      `admin`, `site`, `register` records exactly as they are.
      ⚠️ The old website goes offline the moment this propagates.
- [ ] Wait for Vercel to show the domain verified + certificate issued.
- [ ] Supabase (MAIN project) → Authentication → URL Configuration:
      **Site URL** → `https://proto.co.za`; **Redirect URLs** → add
      `https://proto.co.za/**` and `https://www.proto.co.za/**`
      (keep the site.proto.co.za entries during transition).
- [ ] Supabase (MAIN project) → Authentication → Sessions:
      **Time-box user sessions** → `720` hours (30 days).
      The portal keeps customers signed in across refreshes and enforces the
      same 30-day window in the browser (`src/lib/sessionPolicy.js`); this
      setting is the server-side half, so a stolen refresh token also dies at
      30 days. Leave **inactivity timeout** empty — customers who browse
      occasionally should not be logged out for being quiet.

## Part 3 — Verify (after DNS propagates; use your phone's mobile data for a cold view)

Plumbing:
- [ ] `https://proto.co.za` loads the portal with a valid certificate; `www` too.
- [ ] `https://site.proto.co.za` STILL loads (required).
- [ ] `https://admin.proto.co.za` loads.
- [ ] Send an email TO `online@proto.co.za` from outside — it arrives (proves MX untouched).

Dress rehearsal (a real throwaway inbox):
- [ ] **Register** a new account → applicant gets "Application received";
      all 3 admins get "New trade signup"; account appears in Trade Requests.
- [ ] **Log in before approval** → "Proto is still reviewing your application…".
- [ ] **Approve WITHOUT a code** in admin → applicant receives the approval email
      (subject "Welcome to Proto Trading — your trade account is approved"),
      its button points at proto.co.za, and login now works.
- [ ] **Catalogue** paints; log out/in again — second login paints instantly.
- [ ] **Order**: place a small order → all 3 team inboxes get "New order received
      from …" with PDF; customer gets the acknowledgement; order shows in admin
      Order Requests; fulfilment ticks stick.
- [ ] **Reorder** the order → every line returns to the cart.
- [ ] **Promo**: apply a used code → blocked with "already been used".
- [ ] **Password reset** → email arrives, link opens proto.co.za and works.
- [ ] **Mobile**: top bar clean (no cart, full logo), Search opens in place,
      cart opens from the bottom bar and the X closes it.

## Rollback (any point)

- [ ] Restore the old apex `A` record from the Part-0 export → old site returns.
      The portal keeps running on site.proto.co.za; admin, bridge and email are
      untouched because their records were never changed.
