-- Proto Trading Portal — initial schema
-- Run in Supabase SQL editor

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL,
  name            text NOT NULL,
  price_ex_vat    numeric(10,2) NOT NULL DEFAULT 0,
  image_url       text DEFAULT '',
  stock_on_hand   integer DEFAULT 0,
  category_path   text[] DEFAULT '{}',
  tags            jsonb DEFAULT '[]',
  badges          text[] DEFAULT '{}',
  is_archived     boolean NOT NULL DEFAULT false,
  is_new          boolean NOT NULL DEFAULT false,
  is_special      boolean NOT NULL DEFAULT false,
  special_visibility text NOT NULL DEFAULT 'all', -- 'all' | 'premium' | 'regular'
  sort_order      integer NOT NULL DEFAULT 0,
  min_qty         integer NOT NULL DEFAULT 1,
  case_pack       text DEFAULT '',
  margin_cue      text DEFAULT '',
  lead_time       text DEFAULT '',
  trade_note      text DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text UNIQUE NOT NULL,
  name             text DEFAULT '',
  phone            text DEFAULT '',
  delivery_address text DEFAULT '',
  tier             text NOT NULL DEFAULT 'regular', -- 'regular' | 'premium'
  role             text NOT NULL DEFAULT 'customer', -- 'customer' | 'admin'
  is_approved      boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  items        jsonb NOT NULL DEFAULT '[]',
  total_ex_vat numeric(10,2) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'pending',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS products_category_path_idx ON public.products USING gin(category_path);
CREATE INDEX IF NOT EXISTS products_sort_order_idx    ON public.products(sort_order);
CREATE INDEX IF NOT EXISTS products_is_archived_idx   ON public.products(is_archived);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx     ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_created_at_idx      ON public.orders(created_at DESC);

-- ── Admin helper (SECURITY DEFINER bypasses RLS) ────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── Trigger: auto-create customer profile on signup ──────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.customers (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders    ENABLE ROW LEVEL SECURITY;

-- Products: approved customers read active products; admins see/do everything
DROP POLICY IF EXISTS "products_select"       ON public.products;
DROP POLICY IF EXISTS "products_admin_write"  ON public.products;

CREATE POLICY "products_select" ON public.products
  FOR SELECT TO authenticated
  USING (
    (NOT is_archived AND EXISTS (
      SELECT 1 FROM public.customers WHERE id = auth.uid() AND is_approved = true
    ))
    OR is_admin()
  );

CREATE POLICY "products_admin_write" ON public.products
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Customers: own profile; admins see all
DROP POLICY IF EXISTS "customers_select" ON public.customers;
DROP POLICY IF EXISTS "customers_insert" ON public.customers;
DROP POLICY IF EXISTS "customers_update" ON public.customers;
DROP POLICY IF EXISTS "customers_delete" ON public.customers;

CREATE POLICY "customers_select" ON public.customers
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "customers_insert" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "customers_update" ON public.customers
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "customers_delete" ON public.customers
  FOR DELETE TO authenticated
  USING (is_admin());

-- Orders: own orders; admins see all
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_admin"  ON public.orders;

CREATE POLICY "orders_select" ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR is_admin());

CREATE POLICY "orders_insert" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "orders_admin" ON public.orders
  FOR ALL TO authenticated
  USING (is_admin());

-- ── Seed: make first admin (run manually after creating your Supabase account) ─
-- UPDATE public.customers SET role = 'admin', is_approved = true WHERE email = 'your@email.com';
