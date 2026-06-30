
-- 1) Profiles: restrict SELECT to self + admins (hide phone & status from peers)
DROP POLICY IF EXISTS "profiles select all authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "profiles select self or admin" ON public.profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- Public directory view (safe columns only) so the app can render names/avatars of teammates
CREATE OR REPLACE VIEW public.profiles_directory
WITH (security_invoker = on) AS
  SELECT id, full_name, avatar_url FROM public.profiles;

-- The view runs with the invoker's RLS; add a permissive SELECT for directory access via a security-definer function
CREATE OR REPLACE FUNCTION public.list_directory()
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, full_name, avatar_url FROM public.profiles
  WHERE status = 'approved';
$$;
REVOKE ALL ON FUNCTION public.list_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_directory() TO authenticated;

-- 2) user_roles: scope SELECT to self + admins
DROP POLICY IF EXISTS "roles read own + admin all" ON public.user_roles;
CREATE POLICY "user_roles select self or admin" ON public.user_roles FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 3) Lock down SECURITY DEFINER helpers that should NOT be RPC-callable
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_area_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon, authenticated;
-- has_role IS called as RPC by the sidebar, keep it for authenticated only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
-- get_invite_by_token must remain callable from /auth (anon + authenticated)
REVOKE EXECUTE ON FUNCTION public.get_invite_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(uuid) TO anon, authenticated;

-- 4) Set immutable search_path on remaining trigger functions
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.invites_normalize_email()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.email = lower(trim(NEW.email)); RETURN NEW; END $$;

-- 5) Enable Realtime on tasks (and projects) for live collaboration
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.projects REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.projects; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Grants for the directory view
GRANT SELECT ON public.profiles_directory TO authenticated;
