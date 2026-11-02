-- Drop the orders table and all related policies/indexes
-- WARNING: This permanently deletes all order data

-- Drop policies first (must be before table drop)
DROP POLICY IF EXISTS "orders_buyer_cancel" ON public.orders;
DROP POLICY IF EXISTS "orders_select" ON public.orders;
DROP POLICY IF EXISTS "orders_insert" ON public.orders;

-- Drop index
DROP INDEX IF EXISTS idx_orders_buyer;

-- Drop table
DROP TABLE IF EXISTS public.orders;
