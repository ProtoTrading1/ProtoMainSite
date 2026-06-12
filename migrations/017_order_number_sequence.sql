-- Sequential order numbers: PT_00001, PT_00002, …
-- Client apps should omit order_number on insert; the trigger assigns the next value.

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;

-- Start after the highest existing PT_##### number (ignore legacy PT-YYYYMMDD-XXXX formats).
DO $$
DECLARE
  max_num integer;
BEGIN
  SELECT MAX(CAST(substring(order_number FROM 4) AS integer))
  INTO max_num
  FROM public.orders
  WHERE order_number ~ '^PT_[0-9]+$';

  IF max_num IS NOT NULL AND max_num > 0 THEN
    PERFORM setval('public.order_number_seq', max_num, true);
  END IF;
END $$;

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
