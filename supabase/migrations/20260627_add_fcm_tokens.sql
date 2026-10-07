-- Create user FCM tokens table
CREATE TABLE IF NOT EXISTS public.user_fcm_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  device_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS policies
ALTER TABLE public.user_fcm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own FCM tokens"
  ON public.user_fcm_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own FCM tokens"
  ON public.user_fcm_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own FCM tokens"
  ON public.user_fcm_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own FCM tokens"
  ON public.user_fcm_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Optional trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_fcm_tokens_updated_at
  BEFORE UPDATE ON public.user_fcm_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
