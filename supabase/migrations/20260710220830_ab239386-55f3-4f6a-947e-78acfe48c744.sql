-- 1a. Remove agentes duplicados (mantém o de heartbeat mais recente)
DELETE FROM public.agents a
USING public.agents b
WHERE a.agent_uid = b.agent_uid
  AND a.id <> b.id
  AND (
    COALESCE(a.last_heartbeat_at, a.first_seen_at) < COALESCE(b.last_heartbeat_at, b.first_seen_at)
    OR (
      COALESCE(a.last_heartbeat_at, a.first_seen_at) = COALESCE(b.last_heartbeat_at, b.first_seen_at)
      AND a.id < b.id
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_agents_agent_uid ON public.agents (agent_uid);

-- 1b. databases.agent_uid único quando preenchido
CREATE UNIQUE INDEX IF NOT EXISTS uq_databases_agent_uid
  ON public.databases (agent_uid)
  WHERE agent_uid IS NOT NULL;

-- 2. Índice da fila de comandos
CREATE INDEX IF NOT EXISTS idx_command_results_db_status_enqueued
  ON public.command_results (database_id, status, enqueued_at);

-- 3. Encerra comandos órfãos pré-migração
UPDATE public.command_results
   SET status = 'timeout',
       error_message = COALESCE(error_message, 'Encerrado na migração correcoes-v1'),
       completed_at = COALESCE(completed_at, now())
 WHERE status IN ('pending', 'processing')
   AND enqueued_at < now() - interval '15 minutes';

-- 4. Remove testes de conectividade FAKE do antigo botão "Testar"
DELETE FROM public.agent_events
 WHERE event_type = 'connectivity_test'
   AND agent_id IS NULL
   AND (step IS NULL OR step IN ('ping', 'auth', 'db', 'query'));

-- 5. Zera o array aposentado
UPDATE public.agents
   SET pending_commands = '[]'::jsonb
 WHERE pending_commands <> '[]'::jsonb;