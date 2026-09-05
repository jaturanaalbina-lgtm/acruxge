DROP POLICY IF EXISTS "org_members insert" ON public.organization_members;

CREATE POLICY "org_members self join pending"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'member'::org_role
  AND status = 'pending'
);

CREATE POLICY "org_members insert by admin"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(auth.uid(), organization_id));