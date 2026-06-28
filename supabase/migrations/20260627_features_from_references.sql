-- ═══════════════════════════════════════════════════════════════
-- Migration: Port features from reference projects
-- Adds: otp_codes, notifications, order tracking, inventory mgmt
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. OTP Codes Table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'registration',
  otp_hash TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5
);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) can access otp_codes
CREATE POLICY "Service role only - otp_codes" ON public.otp_codes
  USING (false);

-- ─── 2. Notifications Table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  metadata JSONB DEFAULT '{}',
  is_deleted BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

-- Index for fast user notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications (user_id, status) WHERE is_deleted = false;

-- ─── 3. Add tracking columns to orders ───────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS delivery_due_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_token TEXT,
  ADD COLUMN IF NOT EXISTS proof_of_delivery_url TEXT,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_by TEXT;

-- ─── 4. Add inventory columns to products ────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unlimited_stock BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inventory_status TEXT NOT NULL DEFAULT 'in_stock';

-- ─── 5. Atomic stock decrement RPC ───────────────────────────────
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id UUID, p_quantity INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.products
  SET
    stock_count = stock_count - p_quantity,
    inventory_status = CASE
      WHEN stock_count - p_quantity <= 0 THEN 'out_of_stock'
      ELSE 'in_stock'
    END,
    updated_at = now()
  WHERE id = p_product_id
    AND (unlimited_stock = true OR stock_count >= p_quantity);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock for product %', p_product_id;
  END IF;
END;
$$;

-- ─── 6. Increment stock RPC ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_stock(p_product_id UUID, p_quantity INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.products
  SET
    stock_count = stock_count + p_quantity,
    inventory_status = 'in_stock',
    updated_at = now()
  WHERE id = p_product_id;
END;
$$;

-- ─── 7. Append to order status history ───────────────────────────
CREATE OR REPLACE FUNCTION public.append_order_status_history(
  p_order_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_history JSONB;
  v_entry JSONB;
BEGIN
  SELECT COALESCE(status_history, '[]') INTO v_history
  FROM public.orders WHERE id = p_order_id;

  v_entry := jsonb_build_object(
    'status', p_status,
    'notes', p_notes,
    'timestamp', now()
  );

  UPDATE public.orders
  SET
    tracking_status = p_status,
    status_history = v_history || v_entry,
    updated_at = now()
  WHERE id = p_order_id;
END;
$$;

-- ─── 8. Delivery rider role (extend app_role enum if exists) ─────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    BEGIN
      ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'delivery_rider';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END$$;
