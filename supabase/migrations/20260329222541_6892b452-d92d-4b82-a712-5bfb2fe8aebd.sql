ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_product_id_fkey;
ALTER TABLE public.orders ALTER COLUMN product_id TYPE text USING product_id::text;