-- Run on the STOCK Supabase project (same as website_stock).
-- Admin-editable main category labels for the Reorder Grid and Product Manager dropdowns.

create table if not exists public.main_categories (
  id         text primary key,
  label      text not null,
  icon       text not null default 'Package',
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists main_categories_sort_idx on public.main_categories (sort_order);

alter table public.main_categories enable row level security;

drop policy if exists main_categories_public_read on public.main_categories;
create policy main_categories_public_read
  on public.main_categories
  for select
  to anon, authenticated
  using (true);

-- Writes use the service-role stock key from the admin client (bypasses RLS).

insert into public.main_categories (id, label, icon, sort_order) values
  ('arts-crafts-stationery',       'Arts, Crafts & Stationery',       'PenTool',  1),
  ('beads-jewellery-accessories',  'Beads, Jewellery & Accessories',  'Scissors', 2),
  ('beauty-personal-care',         'Beauty & Personal Care',          'Smile',    3),
  ('events-parties',               'Events & Parties',                'Gift',     4),
  ('fashion-accessories',          'Fashion & Accessories',           'Shirt',    5),
  ('food-drinks',                  'Food & Drinks',                   'Cookie',   6),
  ('hardware',                     'Hardware',                        'Wrench',   7),
  ('homeware-kitchen',             'Homeware & Kitchen',              'Home',     8),
  ('motarro',                      'Motarro',                         'Gem',      9),
  ('packaging',                    'Packaging',                       'Package',  10),
  ('textiles',                     'Textiles',                        'Wind',     11),
  ('toys-games-kids',              'Toys, Games & Kids',              'ToyBrick', 12)
on conflict (id) do nothing;
