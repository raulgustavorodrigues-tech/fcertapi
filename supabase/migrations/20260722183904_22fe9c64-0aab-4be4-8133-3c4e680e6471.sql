CREATE TABLE IF NOT EXISTS public.entregas_sync (
  database_id      uuid NOT NULL REFERENCES public.databases(id) ON DELETE CASCADE,
  cdfilentg        integer NOT NULL,
  nrentg           integer NOT NULL,
  dtentg           date,
  cdreg            integer,
  periodo          integer,
  cdclides         integer,
  nomecli          varchar(255),
  nrtel            varchar(60),
  nrcep            varchar(20),
  endrf            varchar(255),
  endnr            varchar(30),
  endcp            varchar(255),
  bairr            varchar(120),
  munic            varchar(120),
  unfed            varchar(4),
  cdfilentgdes     integer,
  qtform           integer,
  flagentg         varchar(4),
  obsentg          varchar(500),
  synced_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (database_id, cdfilentg, nrentg)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entregas_sync TO authenticated;
GRANT ALL ON public.entregas_sync TO service_role;

CREATE INDEX IF NOT EXISTS idx_entregas_sync_dtentg
  ON public.entregas_sync (database_id, dtentg);

ALTER TABLE public.entregas_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entregas_sync scoped" ON public.entregas_sync
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.databases d
      WHERE d.id = entregas_sync.database_id
        AND public.user_has_company_access(auth.uid(), d.company_id)
    )
  )
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.entregas_sync_status (
  database_id   uuid PRIMARY KEY REFERENCES public.databases(id) ON DELETE CASCADE,
  last_sync_at  timestamptz,
  rows_synced   integer DEFAULT 0,
  window_days   integer DEFAULT 30
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entregas_sync_status TO authenticated;
GRANT ALL ON public.entregas_sync_status TO service_role;

ALTER TABLE public.entregas_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entregas_status scoped" ON public.entregas_sync_status
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.databases d
      WHERE d.id = entregas_sync_status.database_id
        AND public.user_has_company_access(auth.uid(), d.company_id)
    )
  )
  WITH CHECK (true);