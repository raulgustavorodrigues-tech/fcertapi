
-- =========================================================================
-- P4.8 — RLS multi-tenant escopada por empresa (com bootstrap seguro)
-- =========================================================================

-- 1) Papéis
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2) Vínculo usuário ↔ empresa
CREATE TABLE IF NOT EXISTS public.user_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_user_companies_user ON public.user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company ON public.user_companies(company_id);

GRANT SELECT ON public.user_companies TO authenticated;
GRANT ALL ON public.user_companies TO service_role;
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;

-- 3) Funções auxiliares (SECURITY DEFINER — evitam recursão de RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.user_has_company_access(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (SELECT 1 FROM public.user_companies
                 WHERE user_id = _user_id AND company_id = _company_id);
$$;

-- 4) Políticas das novas tabelas
DROP POLICY IF EXISTS "read own roles"          ON public.user_roles;
DROP POLICY IF EXISTS "admins manage roles"     ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "read own companies"      ON public.user_companies;
DROP POLICY IF EXISTS "admins manage user_companies" ON public.user_companies;
CREATE POLICY "read own companies" ON public.user_companies
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage user_companies" ON public.user_companies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Bootstrap: todos os usuários atuais viram admin (ninguém perde acesso)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
ON CONFLICT (user_id, role) DO NOTHING;

-- 6) Substitui políticas abertas por políticas escopadas por empresa
--    (mantém acesso total para admin via has_role)

-- companies
DROP POLICY IF EXISTS "auth all companies" ON public.companies;
CREATE POLICY "scoped read companies" ON public.companies
  FOR SELECT TO authenticated
  USING (public.user_has_company_access(auth.uid(), id));
CREATE POLICY "admin write companies" ON public.companies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- databases
DROP POLICY IF EXISTS "auth all databases" ON public.databases;
CREATE POLICY "scoped read databases" ON public.databases
  FOR SELECT TO authenticated
  USING (public.user_has_company_access(auth.uid(), company_id));
CREATE POLICY "scoped write databases" ON public.databases
  FOR ALL TO authenticated
  USING (public.user_has_company_access(auth.uid(), company_id))
  WITH CHECK (public.user_has_company_access(auth.uid(), company_id));

-- agents (via database)
DROP POLICY IF EXISTS "auth all agents" ON public.agents;
CREATE POLICY "scoped agents" ON public.agents
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.databases d
    WHERE d.id = agents.database_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.databases d
    WHERE d.id = agents.database_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ));

-- agent_events (via database)
DROP POLICY IF EXISTS "auth all agent_events" ON public.agent_events;
CREATE POLICY "scoped agent_events" ON public.agent_events
  FOR ALL TO authenticated
  USING (
    database_id IS NULL AND public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.databases d
      WHERE d.id = agent_events.database_id
        AND public.user_has_company_access(auth.uid(), d.company_id)
    )
  )
  WITH CHECK (
    database_id IS NULL AND public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.databases d
      WHERE d.id = agent_events.database_id
        AND public.user_has_company_access(auth.uid(), d.company_id)
    )
  );

-- command_results (via agent → database)
DROP POLICY IF EXISTS "auth all command_results" ON public.command_results;
CREATE POLICY "scoped command_results" ON public.command_results
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agents a JOIN public.databases d ON d.id = a.database_id
    WHERE a.id = command_results.agent_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.agents a JOIN public.databases d ON d.id = a.database_id
    WHERE a.id = command_results.agent_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ));

-- sync_logs (via database)
DROP POLICY IF EXISTS "auth all sync_logs" ON public.sync_logs;
CREATE POLICY "scoped sync_logs" ON public.sync_logs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.databases d
    WHERE d.id = sync_logs.database_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.databases d
    WHERE d.id = sync_logs.database_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ));

-- saved_queries (via database)
DROP POLICY IF EXISTS "auth all saved_queries" ON public.saved_queries;
CREATE POLICY "scoped saved_queries" ON public.saved_queries
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.databases d
    WHERE d.id = saved_queries.database_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.databases d
    WHERE d.id = saved_queries.database_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ));

-- schema_cache (via database)
DROP POLICY IF EXISTS "auth all schema_cache" ON public.schema_cache;
CREATE POLICY "scoped schema_cache" ON public.schema_cache
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.databases d
    WHERE d.id = schema_cache.database_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.databases d
    WHERE d.id = schema_cache.database_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ));

-- agent_token_history (via database)
DROP POLICY IF EXISTS "auth all agent_token_history" ON public.agent_token_history;
CREATE POLICY "scoped agent_token_history" ON public.agent_token_history
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.databases d
    WHERE d.id = agent_token_history.database_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.databases d
    WHERE d.id = agent_token_history.database_id
      AND public.user_has_company_access(auth.uid(), d.company_id)
  ));
