DROP POLICY IF EXISTS "scoped saved_queries" ON public.saved_queries;

CREATE POLICY "scoped saved_queries" ON public.saved_queries
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR saved_queries.database_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.databases d
      WHERE d.id = saved_queries.database_id
        AND public.user_has_company_access(auth.uid(), d.company_id)
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR saved_queries.database_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.databases d
      WHERE d.id = saved_queries.database_id
        AND public.user_has_company_access(auth.uid(), d.company_id)
    )
  );