
DO $$ BEGIN
  CREATE TYPE public.profile_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.profile_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

-- Existing users become approved
UPDATE public.profiles SET status = 'approved' WHERE status = 'pending';

-- Admins can update profiles (approve/reject)
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR id = auth.uid());

-- Update handle_new_user: approve if invite exists, otherwise pending
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email text := lower(COALESCE(NEW.email, ''));
  _inv RECORD;
  _has_invite boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.invites
    WHERE lower(email) = _email AND used_at IS NULL AND expires_at > now()
  ) INTO _has_invite;

  INSERT INTO public.profiles (id, full_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    CASE WHEN _has_invite THEN 'approved'::public.profile_status ELSE 'pending'::public.profile_status END
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;

  FOR _inv IN
    SELECT * FROM public.invites
    WHERE lower(email) = _email AND used_at IS NULL AND expires_at > now()
  LOOP
    IF _inv.area_id IS NOT NULL THEN
      INSERT INTO public.area_members (area_id, user_id, is_leader)
      VALUES (_inv.area_id, NEW.id, _inv.is_leader)
      ON CONFLICT (area_id, user_id) DO UPDATE SET is_leader = EXCLUDED.is_leader OR public.area_members.is_leader;
    END IF;
    UPDATE public.invites SET used_at = now(), used_by = NEW.id WHERE id = _inv.id;
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper to check approved (used by app)
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'approved')
      OR public.is_admin(_user_id);
$$;
