
CREATE TABLE IF NOT EXISTS public.api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  key_prefix   text NOT NULL,
  key_hash     text NOT NULL UNIQUE,
  company_id   uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  database_id  uuid REFERENCES public.databases(id) ON DELETE CASCADE,
  scopes       text[] NOT NULL DEFAULT ARRAY['entregas:read'],
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  revoked_reason text
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys (key_hash) WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys admin only" ON public.api_keys
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.api_access_log (
  id            bigserial PRIMARY KEY,
  api_key_id    uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  endpoint      text NOT NULL,
  params        jsonb,
  rows_returned integer,
  status        integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_access_log_key_date
  ON public.api_access_log (api_key_id, created_at DESC);

GRANT SELECT ON public.api_access_log TO authenticated;
GRANT ALL ON public.api_access_log TO service_role;

ALTER TABLE public.api_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_log admin read" ON public.api_access_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
