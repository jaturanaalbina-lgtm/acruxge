
DROP POLICY IF EXISTS "tasks read by area members" ON public.tasks;
DROP POLICY IF EXISTS "tasks insert by area members" ON public.tasks;
DROP POLICY IF EXISTS "tasks update by area members" ON public.tasks;
DROP POLICY IF EXISTS "tasks delete by area members" ON public.tasks;

CREATE POLICY "tasks read all authenticated" ON public.tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks insert all authenticated" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "tasks update all authenticated" ON public.tasks
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tasks delete admins or creator" ON public.tasks
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()) OR created_by = auth.uid());
