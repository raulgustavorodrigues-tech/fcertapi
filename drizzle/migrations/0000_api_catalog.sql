CREATE TABLE public.api_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  path text NOT NULL,
  scope text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  params_doc jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_catalog TO authenticated;
GRANT ALL ON public.api_catalog TO service_role;
ALTER TABLE public.api_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog read" ON public.api_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "catalog admin write" ON public.api_catalog FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE TABLE public.company_apis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  api_id uuid NOT NULL REFERENCES public.api_catalog(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  enabled_by uuid,
  UNIQUE (company_id, api_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_apis TO authenticated;
GRANT ALL ON public.company_apis TO service_role;
ALTER TABLE public.company_apis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_apis read" ON public.company_apis FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin') OR private.user_has_company_access(auth.uid(), company_id));
CREATE POLICY "company_apis admin write" ON public.company_apis FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'admin'));

INSERT INTO public.api_catalog (slug, name, description, path, scope, params_doc) VALUES
('entregas', 'Entregas (Logitech)', 'Entregas sincronizadas do Fórmula Certa para sistemas de logística.', '/api/v1/entregas', 'entregas:read',
 '[{"name":"data_inicio","desc":"obrigatório, AAAA-MM-DD"},{"name":"data_fim","desc":"opcional, AAAA-MM-DD"},{"name":"limit","desc":"opcional, até 5000"},{"name":"offset","desc":"opcional, paginação"}]'::jsonb);

INSERT INTO public.company_apis (company_id, api_id)
SELECT DISTINCT k.company_id, c.id FROM public.api_keys k, public.api_catalog c
WHERE c.slug = 'entregas' AND k.company_id IS NOT NULL AND k.revoked_at IS NULL AND 'entregas:read' = ANY(k.scopes);