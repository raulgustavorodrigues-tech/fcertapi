ALTER TABLE public.databases ADD COLUMN IF NOT EXISTS sync_entregas_window_days integer DEFAULT 60;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.databases TO authenticated;
GRANT ALL ON public.databases TO service_role;
