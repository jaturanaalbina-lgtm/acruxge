
-- Auto-approve all users on signup; approve any pending/rejected existing users.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _email text := lower(COALESCE(NEW.email, ''));
  _inv RECORD;
BEGIN
  INSERT INTO public.profiles (id, full_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'approved'::public.profile_status
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
END $function$;

UPDATE public.profiles SET status = 'approved' WHERE status <> 'approved';
