CREATE OR REPLACE FUNCTION private.user_has_company_access(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, private
AS $function$
  SELECT private.has_role(_user_id, 'admin')
      OR EXISTS (SELECT 1 FROM public.user_companies
                 WHERE user_id = _user_id AND company_id = _company_id);
$function$;