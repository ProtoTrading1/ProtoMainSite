# Launch-Day Checklist — 24 July 2026

Companion to the pre-launch plan. Code fixes for P0-1/P0-2/P0-5/P1-4 are done
on branch `claude/codebase-review-planning-yy47cg` in **both** repos. This file
lists what must happen **outside the code** before customers arrive.

## 1. Deploy prerequisites (do these BEFORE merging/deploying the branch)

Supabase — Portal project (the one `VITE_SUPABASE_URL` points at):

- [ ] Apply `Proto-Website-/migrations/029_auth_security_hardening.sql`
      (identical to admin's `051` — apply ONCE; it is idempotent).
      Provides the rate-limit table/RPC + `revoke_user_sessions`.
- [ ] Apply `Proto-Website-/migrations/030_orders_client_ref.sql`
      (order idempotency key; everything degrades gracefully until applied).
- [ ] Confirm migration `028_orders_promo.sql` is applied (promo columns on orders).
- [ ] Confirm migration `019_search_analytics.sql` + `020` grants are applied —
      the storefront write-path is live and silently no-ops if the table is missing.
- [ ] Confirm admin migration `037_orders_confirmation_sent_at.sql` is applied
      (includes the `items_search` generated column — order search/sent/paid
      tabs truncate at scale without it).

Vercel env vars:

- [ ] Storefront project: set `RESET_TOKEN_SECRET` (any long random string).
      **Password reset now fails closed without it** — this is deliberate
      (previously it silently fell back to the service-role key).
- [ ] Admin project: set `ADMIN_RESET_TOKEN_SECRET` (same rule).

## 2. P0-3 — Prove an approved customer can log in (live site)

The gate is host/env-based: `register.proto.co.za` (or
`VITE_PREREGISTER_MODE=true`) shows approved users a "we'll notify you"
hold screen; the main host lets approved users straight in. Launch = point
customers at the main host / ensure the flag is off on it.

- [ ] Approve a test customer in admin.
- [ ] Receive the welcome email; log in on the LIVE main host.
- [ ] Browse the catalogue, add to cart.
- [ ] Also confirm: forgot-password on the live site → email arrives → link
      works once → link fails on second use → old session is logged out.

## 3. P0-4 — Prove the promo code applies (live site)

Both halves verified in code (same bucket, same shape, server re-validates).
Decision made: this is a quote-request system — the discount shows on the
drawer + PDF as an estimate; it does NOT reduce the stored order total. The
promo IS stored on the order row (`promo_code`/`discount_pct`/`discount_amount`).

- [ ] Save the promo in admin (Site Content → Specials).
- [ ] Apply it at checkout on the live site; confirm the drawer + emailed PDF
      show the discount and the order row carries the promo columns.
- [ ] Confirm an inactive/wrong code is rejected.

## 4. Evening dry-run (end-to-end)

- [ ] register → approve → welcome email → login → search → add to cart →
      apply promo → submit order → order lands in admin Orders → confirmation
      PDF renders correctly (include a two-lines-same-barcode order if
      possible — the reconciliation fix covers it).
- [ ] Run the backup cron once by hand (`/api/site-config-backup` with the
      cron secret or an admin session) and confirm a `backups/<today>/`
      folder exists in the site-config bucket.

## 5. Explicitly deferred (next week, in this order)

1. Brevo CRM tab (assembly of existing pieces, 1–2 days)
2. Product loader: author new product + 4 image slots in one pass (1–2 days)
3. Variant grouping — extend the storefront's existing barcode grouping
   (see admin `docs/CATALOGUE_MULTI_PLACEMENT_AND_GROUPS.md`; groups
   migration must be numbered 051+ in admin / after 030 here)
4. Search-analytics dashboard hookup check (ingestion already live)
5. Dead-code prune (approval tab wiring) + storefront security review +
   remaining M-items from the 22 July review
