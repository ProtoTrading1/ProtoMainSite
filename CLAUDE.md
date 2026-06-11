# Proto Panel (Main Portal)

Customer-facing wholesale trade portal. Vite + React SPA with Supabase.

**Admin portal is a separate app:** https://github.com/danieljoffeinfo-web/protoportal-admin — never implement admin features here. The embedded `AdminPage.jsx` in this repo is deprecated; do not restore or deploy it.

## Stack
- Vite + React (JSX, not TSX)
- Supabase (`@supabase/supabase-js`)
- Resend (email), pdfkit (PDF generation)
- Package manager: npm

## Dev
```bash
npm run dev
npm run build
npm run preview
```

## Structure
- `src/pages/` — page components
- `src/components/` — shared components
- `src/lib/` — Supabase client + utilities
- `migrations/` — SQL migrations

## Env vars
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `RESEND_API_KEY`
