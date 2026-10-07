-- Activity logs table (login/signup/auth alerts)
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert own activity logs" ON public.activity_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anon can insert failed login logs" ON public.activity_logs
  FOR INSERT TO anon WITH CHECK (user_id IS NULL);

CREATE POLICY "Admins can view all activity logs" ON public.activity_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_event_type ON public.activity_logs(event_type);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- Installment reminders table
CREATE TABLE public.installment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_email TEXT,
  reminder_type TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'sent',
  message TEXT,
  amount_due NUMERIC,
  days_overdue INTEGER,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.installment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage installment reminders" ON public.installment_reminders
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_installment_reminders_order_id ON public.installment_reminders(order_id);
CREATE INDEX idx_installment_reminders_created_at ON public.installment_reminders(created_at DESC);

-- Admin policy to view all profiles (needed for admin dashboard)
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
