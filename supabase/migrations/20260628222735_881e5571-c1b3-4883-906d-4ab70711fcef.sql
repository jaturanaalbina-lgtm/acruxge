
-- Invites table
CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  area_id uuid REFERENCES public.areas(id) ON DELETE CASCADE,
  is_leader boolean NOT NULL DEFAULT false,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX invites_email_idx ON public.invites (lower(email));
CREATE INDEX invites_token_idx ON public.invites (token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites TO authenticated;
GRANT ALL ON public.invites TO service_role;

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invites"
ON public.invites FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Normalize email lowercase before storing
CREATE OR REPLACE FUNCTION public.invites_normalize_email()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.email = lower(trim(NEW.email));
  RETURN NEW;
END $$;

CREATE TRIGGER invites_normalize_email_trg
BEFORE INSERT OR UPDATE ON public.invites
FOR EACH ROW EXECUTE FUNCTION public.invites_normalize_email();

-- Public, safe lookup by token (for the signup screen)
CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token uuid)
RETURNS TABLE (
  email text,
  area_id uuid,
  area_name text,
  is_leader boolean,
  expires_at timestamptz,
  used_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.email, i.area_id, a.name, i.is_leader, i.expires_at, i.used_at
  FROM public.invites i
  LEFT JOIN public.areas a ON a.id = i.area_id
  WHERE i.token = _token
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_invite_by_token(uuid) TO anon, authenticated;

-- Updated handle_new_user: apply all matching pending invites
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email text := lower(COALESCE(NEW.email, ''));
  _inv RECORD;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member')
  ON CONFLICT DO NOTHING;

  FOR _inv IN
    SELECT * FROM public.invites
    WHERE lower(email) = _email
      AND used_at IS NULL
      AND expires_at > now()
  LOOP
    IF _inv.area_id IS NOT NULL THEN
      INSERT INTO public.area_members (area_id, user_id, is_leader)
      VALUES (_inv.area_id, NEW.id, _inv.is_leader)
      ON CONFLICT (area_id, user_id)
      DO UPDATE SET is_leader = EXCLUDED.is_leader OR public.area_members.is_leader;
    END IF;

    UPDATE public.invites
    SET used_at = now(), used_by = NEW.id
    WHERE id = _inv.id;
  END LOOP;

  RETURN NEW;
END $$;
