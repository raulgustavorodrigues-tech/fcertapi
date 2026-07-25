ALTER TABLE public.entregas_sync
  ADD COLUMN IF NOT EXISTS vrrcb numeric(14,2),
  ADD COLUMN IF NOT EXISTS vrtot numeric(14,2),
  ADD COLUMN IF NOT EXISTS vrtxa numeric(14,2);