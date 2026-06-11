# Proto Panel

Sales/admin panel. Vite + React SPA with Supabase.

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
- `src/pages/AdminPage.jsx` — entire admin dashboard (all sections)
- `src/components/` — shared components
- `src/lib/` — Supabase clients + utilities (`products.js`, `taxonomyAdmin.js`)
- `migrations/` — SQL migrations (auth + stock Supabase)
- `.cursor/skills/protoportal-admin/` — agent skill for admin architecture

## Env vars
- Auth: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Stock catalogue: `VITE_STOCK_SUPABASE_URL`, `VITE_STOCK_SUPABASE_KEY`
- Admin host: `VITE_ADMIN_MODE=true` (or deploy to protoportal-admin.vercel.app)
- Email: `RESEND_API_KEY`
