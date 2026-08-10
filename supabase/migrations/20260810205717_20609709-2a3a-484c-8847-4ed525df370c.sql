ALTER TABLE public.entregas_sync ALTER COLUMN cdpro TYPE text;
GRANT SELECT ON public.entregas_sync TO authenticated;
GRANT SELECT ON public.entregas_sync TO anon;
GRANT ALL ON public.entregas_sync TO service_role;