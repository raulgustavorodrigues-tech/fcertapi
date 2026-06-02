-- 1. Alterações em agents
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS pending_commands JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS heartbeat_interval_seconds INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS tunnel_url TEXT,
  ADD COLUMN IF NOT EXISTS push_only BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS system_info JSONB;

-- 2. command_results
CREATE TABLE IF NOT EXISTS public.command_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID,
  database_id UUID,
  command_id TEXT NOT NULL UNIQUE,
  command_type TEXT NOT NULL,
  payload JSONB,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  enqueued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  picked_up_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_command_results_agent_id ON public.command_results(agent_id);
CREATE INDEX IF NOT EXISTS idx_command_results_command_id ON public.command_results(command_id);
CREATE INDEX IF NOT EXISTS idx_command_results_status ON public.command_results(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.command_results TO authenticated;
GRANT ALL ON public.command_results TO service_role;
ALTER TABLE public.command_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all command_results" ON public.command_results FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. agent_logs
CREATE TABLE IF NOT EXISTS public.agent_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_id ON public.agent_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created_at ON public.agent_logs(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_logs TO authenticated;
GRANT ALL ON public.agent_logs TO service_role;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all agent_logs" ON public.agent_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. schema_cache
CREATE TABLE IF NOT EXISTS public.schema_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  database_id UUID NOT NULL UNIQUE,
  tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  cached_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schema_cache_database_id ON public.schema_cache(database_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schema_cache TO authenticated;
GRANT ALL ON public.schema_cache TO service_role;
ALTER TABLE public.schema_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all schema_cache" ON public.schema_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);