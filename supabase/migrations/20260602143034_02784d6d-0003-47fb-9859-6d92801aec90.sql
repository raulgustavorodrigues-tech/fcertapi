CREATE TABLE public.agent_token_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  database_id uuid NOT NULL,
  token text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  revoked_reason text
);

CREATE INDEX idx_agent_token_history_database_id ON public.agent_token_history(database_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_token_history TO authenticated;
GRANT ALL ON public.agent_token_history TO service_role;

ALTER TABLE public.agent_token_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all agent_token_history"
ON public.agent_token_history
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);