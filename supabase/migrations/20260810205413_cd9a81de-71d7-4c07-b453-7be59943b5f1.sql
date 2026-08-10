ALTER TABLE public.entregas_sync
  ADD COLUMN IF NOT EXISTS cdpro numeric(14,0);

GRANT SELECT ON public.entregas_sync TO authenticated;
GRANT SELECT ON public.entregas_sync TO anon;
GRANT ALL ON public.entregas_sync TO service_role;
