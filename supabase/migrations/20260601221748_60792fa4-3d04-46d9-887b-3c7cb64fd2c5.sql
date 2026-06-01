
-- COMPANIES
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  razao_social TEXT,
  email TEXT,
  phone TEXT,
  city TEXT,
  state TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all companies" ON public.companies FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- DATABASES
CREATE TABLE public.databases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  host TEXT,
  port INTEGER DEFAULT 3050,
  filepath TEXT,
  username TEXT DEFAULT 'SYSDBA',
  password_encrypted TEXT,
  charset TEXT DEFAULT 'WIN1252',
  firebird_version TEXT DEFAULT '2.5',
  agent_token TEXT,
  agent_endpoint TEXT,
  status TEXT DEFAULT 'not_tested',
  last_sync_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.databases TO authenticated;
GRANT ALL ON public.databases TO service_role;
ALTER TABLE public.databases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all databases" ON public.databases FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SYNC LOGS
CREATE TABLE public.sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  database_id UUID NOT NULL REFERENCES public.databases(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  records_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_logs TO authenticated;
GRANT ALL ON public.sync_logs TO service_role;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all sync_logs" ON public.sync_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SAVED QUERIES
CREATE TABLE public.saved_queries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  database_id UUID REFERENCES public.databases(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  sql_content TEXT NOT NULL,
  favorite BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_queries TO authenticated;
GRANT ALL ON public.saved_queries TO service_role;
ALTER TABLE public.saved_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all saved_queries" ON public.saved_queries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- AGENTS
CREATE TABLE public.agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  database_id UUID REFERENCES public.databases(id) ON DELETE CASCADE,
  agent_uid TEXT NOT NULL,
  alias TEXT,
  ip_address TEXT,
  agent_version TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ,
  total_syncs INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'offline'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all agents" ON public.agents FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CONNECTIVITY LOGS
CREATE TABLE public.connectivity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  database_id UUID REFERENCES public.databases(id) ON DELETE CASCADE,
  tested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  latency_ms INTEGER,
  result TEXT NOT NULL,
  step_failed TEXT,
  error_detail TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connectivity_logs TO authenticated;
GRANT ALL ON public.connectivity_logs TO service_role;
ALTER TABLE public.connectivity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all connectivity_logs" ON public.connectivity_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_databases_company ON public.databases(company_id);
CREATE INDEX idx_sync_logs_database ON public.sync_logs(database_id, started_at DESC);
CREATE INDEX idx_connectivity_db ON public.connectivity_logs(database_id, tested_at DESC);
