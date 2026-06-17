-- Full order numbering setup + reset so the NEXT order is PT_00001.
-- Run once in Supabase SQL Editor (main project). Safe to re-run.

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;

CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL OR btrim(NEW.order_number) = '' THEN
    NEW.order_number := 'PT_' || lpad(nextval('public.order_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_assign_order_number ON public.orders;
CREATE TRIGGER orders_assign_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_order_number();

-- Next insert gets PT_00001 (is_called=false → next nextval() returns 1)
SELECT setval('public.order_number_seq', 1, false);
