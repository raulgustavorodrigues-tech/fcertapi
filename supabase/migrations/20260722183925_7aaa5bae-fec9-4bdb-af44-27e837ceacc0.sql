DROP POLICY IF EXISTS "entregas_sync scoped" ON public.entregas_sync;
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
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.databases d
      WHERE d.id = entregas_sync.database_id
        AND public.user_has_company_access(auth.uid(), d.company_id)
    )
  );

DROP POLICY IF EXISTS "entregas_status scoped" ON public.entregas_sync_status;
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
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.databases d
      WHERE d.id = entregas_sync_status.database_id
        AND public.user_has_company_access(auth.uid(), d.company_id)
    )
  );