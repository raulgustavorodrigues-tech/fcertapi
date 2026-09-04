ALTER TABLE public.databases ADD COLUMN IF NOT EXISTS password_cipher text;

CREATE TABLE IF NOT EXISTS public.download_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  database_id uuid NOT NULL REFERENCES public.databases(id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_by uuid,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.download_tickets TO service_role;

ALTER TABLE public.download_tickets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS download_tickets_expires_idx ON public.download_tickets(expires_at);