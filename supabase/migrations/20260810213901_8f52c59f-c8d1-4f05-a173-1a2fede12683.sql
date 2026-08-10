ALTER TABLE public.entregas_sync ADD COLUMN IF NOT EXISTS cdpro text;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entregas_sync TO authenticated;
GRANT ALL ON public.entregas_sync TO service_role;