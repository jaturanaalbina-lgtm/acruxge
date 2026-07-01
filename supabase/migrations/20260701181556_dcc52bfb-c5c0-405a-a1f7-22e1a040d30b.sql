
CREATE POLICY "areas read anon" ON public.areas FOR SELECT TO anon USING (true);
GRANT SELECT ON public.areas TO anon;
