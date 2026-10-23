CREATE TABLE public.pm_produtos (database_id uuid NOT NULL REFERENCES public.databases(id) ON DELETE CASCADE, cdpro text NOT NULL, descr text, unida text, situa text, indbloqueio text, grupo text, indsngpc text, prcom numeric, synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (database_id, cdpro));
CREATE TABLE public.pm_estoque (database_id uuid NOT NULL REFERENCES public.databases(id) ON DELETE CASCADE, cdfil text NOT NULL, cdpro text NOT NULL, estmi numeric, estma numeric, estat numeric, synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (database_id, cdfil, cdpro));
CREATE TABLE public.pm_precos (database_id uuid NOT NULL REFERENCES public.databases(id) ON DELETE CASCADE, cdpro text NOT NULL, dtreaj date NOT NULL, prcom numeric, synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (database_id, cdpro, dtreaj));
CREATE TABLE public.pm_lotes (database_id uuid NOT NULL REFERENCES public.databases(id) ON DELETE CASCADE, cdfil text NOT NULL, cdpro text NOT NULL, ctlot text NOT NULL, stlot text, nrlot text, nrnot text, dtent date, dtval date, estat numeric, synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (database_id, cdfil, cdpro, ctlot));
CREATE TABLE public.pm_consumo_mensal (database_id uuid NOT NULL REFERENCES public.databases(id) ON DELETE CASCADE, cdpro text NOT NULL, mes text NOT NULL, qtreal numeric, synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (database_id, cdpro, mes));
CREATE TABLE public.pm_notas (database_id uuid NOT NULL REFERENCES public.databases(id) ON DELETE CASCADE, cdpro text NOT NULL, nrnot text NOT NULL, fornecid text NOT NULL, dtent date NOT NULL, quant numeric, pruni numeric, synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (database_id, cdpro, nrnot, fornecid, dtent));
CREATE TABLE public.pm_fornecedores (database_id uuid NOT NULL REFERENCES public.databases(id) ON DELETE CASCADE, fornecid text NOT NULL, nrcnpj text, fanta text, synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (database_id, fornecid));
CREATE TABLE public.pm_sync_status (database_id uuid PRIMARY KEY REFERENCES public.databases(id) ON DELETE CASCADE, last_sync_at timestamptz, rows_by_table jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE INDEX pm_notas_forn_idx ON public.pm_notas (database_id, fornecid);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['pm_produtos','pm_estoque','pm_precos','pm_lotes','pm_consumo_mensal','pm_notas','pm_fornecedores','pm_sync_status'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "read by company access" ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.databases d WHERE d.id = database_id AND private.user_has_company_access(auth.uid(), d.company_id)))', t);
  END LOOP;
END $$;