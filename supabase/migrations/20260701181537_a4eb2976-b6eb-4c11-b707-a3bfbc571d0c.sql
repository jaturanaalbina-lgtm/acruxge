
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _email text := lower(COALESCE(NEW.email, ''));
  _inv RECORD;
  _area_id uuid;
  _area_txt text;
BEGIN
  INSERT INTO public.profiles (id, full_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'approved'::public.profile_status
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member') ON CONFLICT DO NOTHING;

  -- Área escolhida no cadastro (metadata "area_id")
  _area_txt := NEW.raw_user_meta_data->>'area_id';
  IF _area_txt IS NOT NULL AND _area_txt <> '' THEN
    BEGIN
      _area_id := _area_txt::uuid;
      IF EXISTS (SELECT 1 FROM public.areas WHERE id = _area_id) THEN
        INSERT INTO public.area_members (area_id, user_id, is_leader)
        VALUES (_area_id, NEW.id, false)
        ON CONFLICT (area_id, user_id) DO NOTHING;
      END IF;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

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

-- RPC para admin listar todos os membros com suas áreas
CREATE OR REPLACE FUNCTION public.admin_list_members()
 RETURNS TABLE(id uuid, full_name text, avatar_url text, created_at timestamptz, is_admin boolean, memberships jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    p.created_at,
    public.is_admin(p.id) AS is_admin,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('area_id', am.area_id, 'is_leader', am.is_leader))
      FROM public.area_members am WHERE am.user_id = p.id
    ), '[]'::jsonb) AS memberships
  FROM public.profiles p
  WHERE public.is_admin(auth.uid())
  ORDER BY p.created_at DESC
$$;

REVOKE ALL ON FUNCTION public.admin_list_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_members() TO authenticated;
