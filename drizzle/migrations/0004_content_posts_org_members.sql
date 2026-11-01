DROP POLICY IF EXISTS "posts read" ON public.content_posts;
DROP POLICY IF EXISTS "posts insert" ON public.content_posts;
DROP POLICY IF EXISTS "posts update" ON public.content_posts;
DROP POLICY IF EXISTS "posts delete" ON public.content_posts;
CREATE POLICY "posts read" ON public.content_posts FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "posts insert" ON public.content_posts FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "posts update" ON public.content_posts FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), organization_id)) WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "posts delete" ON public.content_posts FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), organization_id));