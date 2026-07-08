
-- 1) Nova tabela unificada
CREATE TABLE public.agent_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  database_id uuid REFERENCES public.databases(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('log','connectivity_test')),
  level text,
  message text,
  latency_ms integer,
  step text,
  error_detail text,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_events TO authenticated;
GRANT ALL ON public.agent_events TO service_role;
ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all agent_events" ON public.agent_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_agent_events_db_created   ON public.agent_events (database_id, created_at DESC);
CREATE INDEX idx_agent_events_agent_created ON public.agent_events (agent_id, created_at DESC);
CREATE INDEX idx_agent_events_type_created  ON public.agent_events (event_type, created_at DESC);

-- 2) Backfill dos logs de agente
INSERT INTO public.agent_events
  (id, database_id, agent_id, event_type, level, message, context, created_at)
SELECT
  al.id,
  a.database_id,
  al.agent_id,
  'log'::text,
  al.level,
  al.message,
  al.context,
  al.created_at
FROM public.agent_logs al
LEFT JOIN public.agents a ON a.id = al.agent_id;

-- 3) Backfill dos testes de conectividade
INSERT INTO public.agent_events
  (id, database_id, event_type, level, message, latency_ms, step, error_detail, created_at)
SELECT
  cl.id,
  cl.database_id,
  'connectivity_test'::text,
  cl.result,        -- 'success' | 'fail' etc.
  NULL,
  cl.latency_ms,
  cl.step_failed,
  cl.error_detail,
  cl.tested_at
FROM public.connectivity_logs cl;

-- 4) Remove tabelas antigas
DROP TABLE public.agent_logs;
DROP TABLE public.connectivity_logs;
