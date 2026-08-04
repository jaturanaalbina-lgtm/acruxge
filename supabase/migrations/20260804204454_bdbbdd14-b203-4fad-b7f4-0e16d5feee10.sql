
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

UPDATE public.organization_members SET status = 'active' WHERE status <> 'active';

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_status_chk CHECK (status IN ('pending','active'));

CREATE INDEX IF NOT EXISTS idx_org_members_org_status
  ON public.organization_members(organization_id, status);

-- membership helpers consider only active members
CREATE OR REPLACE FUNCTION public.is_org_member(_user uuid, _org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS(SELECT 1 FROM public.organization_members
    WHERE user_id=_user AND organization_id=_org AND status='active');
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user uuid, _org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS(SELECT 1 FROM public.organization_members
    WHERE user_id=_user AND organization_id=_org AND role IN ('owner','admin') AND status='active');
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(_user uuid, _org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS(SELECT 1 FROM public.organization_members
    WHERE user_id=_user AND organization_id=_org AND role='owner' AND status='active');
$$;

CREATE OR REPLACE FUNCTION public.my_organizations()
RETURNS TABLE(id uuid, name text, slug text, logo_url text, brand_name text, role org_role, member_count integer, member_limit integer, primary_color text, accent_color text, join_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT o.id, o.name, o.slug, o.logo_url, o.brand_name, om.role,
    (SELECT count(*)::int FROM public.organization_members WHERE organization_id = o.id AND status='active'),
    o.member_limit, o.primary_color, o.accent_color, o.join_enabled
  FROM public.organizations o
  JOIN public.organization_members om ON om.organization_id = o.id
  WHERE om.user_id = auth.uid() AND om.status = 'active'
  ORDER BY om.created_at;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_members(_org uuid)
RETURNS TABLE(id uuid, full_name text, avatar_url text, joined_at timestamp with time zone, role org_role, memberships jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.full_name, p.avatar_url, om.created_at, om.role,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('area_id', am.area_id, 'is_leader', am.is_leader))
      FROM public.area_members am
      JOIN public.areas a ON a.id=am.area_id
      WHERE am.user_id = p.id AND a.organization_id = _org
    ), '[]'::jsonb)
  FROM public.organization_members om
  JOIN public.profiles p ON p.id = om.user_id
  WHERE om.organization_id = _org AND om.status='active' AND public.is_org_member(auth.uid(), _org)
  ORDER BY om.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_directory(_org uuid)
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  JOIN public.organization_members om ON om.user_id = p.id
  WHERE om.organization_id = _org AND om.status='active' AND p.status='approved'
    AND public.is_org_member(auth.uid(), _org);
$$;

-- creator is always active owner
CREATE OR REPLACE FUNCTION public.add_org_creator_as_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.organization_members(organization_id, user_id, role, status)
    VALUES (NEW.id, NEW.created_by, 'owner', 'active')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

-- member limit counts only active members
CREATE OR REPLACE FUNCTION public.enforce_member_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE _limit int; _count int;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  SELECT member_limit INTO _limit FROM public.organizations WHERE id = NEW.organization_id;
  SELECT count(*) INTO _count FROM public.organization_members
    WHERE organization_id = NEW.organization_id AND status='active';
  IF _count >= _limit THEN
    RAISE EXCEPTION 'Limite de membros atingido para esta equipe (%).', _limit
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

-- public join now creates a pending request
CREATE OR REPLACE FUNCTION public.join_org_by_slug(_slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _org public.organizations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO _org FROM public.organizations WHERE slug = lower(trim(_slug));
  IF _org.id IS NULL THEN RAISE EXCEPTION 'Equipe não encontrada'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=_org.id AND user_id=auth.uid()) THEN
    RETURN _org.id;
  END IF;
  IF NOT _org.join_enabled THEN RAISE EXCEPTION 'Esta equipe não aceita entradas por link.'; END IF;
  INSERT INTO public.organization_members(organization_id, user_id, role, status)
  VALUES (_org.id, auth.uid(), 'member', 'pending') ON CONFLICT DO NOTHING;
  RETURN _org.id;
END $$;

-- signup: org link => pending; invites => active
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _email text := lower(COALESCE(NEW.email, ''));
  _inv RECORD;
  _slug text := NEW.raw_user_meta_data->>'org_slug';
  _org public.organizations%ROWTYPE;
BEGIN
  INSERT INTO public.profiles (id, full_name, status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'approved'::public.profile_status)
  ON CONFLICT (id) DO NOTHING;

  IF _slug IS NOT NULL AND length(trim(_slug)) > 0 THEN
    SELECT * INTO _org FROM public.organizations WHERE slug = lower(trim(_slug));
    IF _org.id IS NOT NULL AND _org.join_enabled THEN
      INSERT INTO public.organization_members(organization_id, user_id, role, status)
      VALUES (_org.id, NEW.id, 'member', 'pending') ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  FOR _inv IN
    SELECT * FROM public.invites
    WHERE lower(email) = _email AND used_at IS NULL AND expires_at > now()
  LOOP
    IF _inv.organization_id IS NOT NULL THEN
      INSERT INTO public.organization_members(organization_id, user_id, role, status)
      VALUES (_inv.organization_id, NEW.id, 'member', 'active')
      ON CONFLICT (organization_id, user_id) DO UPDATE SET status='active';
    END IF;
    IF _inv.area_id IS NOT NULL THEN
      INSERT INTO public.area_members(area_id, user_id, is_leader)
      VALUES (_inv.area_id, NEW.id, _inv.is_leader) ON CONFLICT DO NOTHING;
    END IF;
    UPDATE public.invites SET used_at = now(), used_by = NEW.id WHERE id = _inv.id;
  END LOOP;

  RETURN NEW;
END $$;

-- pending requests listing for org admins
CREATE OR REPLACE FUNCTION public.list_pending_members(_org uuid)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, phone text, requested_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.phone, om.created_at
  FROM public.organization_members om
  JOIN public.profiles p ON p.id = om.user_id
  WHERE om.organization_id = _org AND om.status = 'pending'
    AND public.is_org_admin(auth.uid(), _org)
  ORDER BY om.created_at DESC;
$$;

-- my pending memberships (for the waiting screen)
CREATE OR REPLACE FUNCTION public.my_pending_organizations()
RETURNS TABLE(id uuid, name text, brand_name text, logo_url text, requested_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT o.id, o.name, o.brand_name, o.logo_url, om.created_at
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = auth.uid() AND om.status = 'pending'
  ORDER BY om.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.approve_member(_org uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _limit int; _count int;
BEGIN
  IF NOT public.is_org_admin(auth.uid(), _org) THEN
    RAISE EXCEPTION 'Apenas admins da equipe podem aprovar membros.';
  END IF;
  SELECT member_limit INTO _limit FROM public.organizations WHERE id = _org;
  SELECT count(*) INTO _count FROM public.organization_members WHERE organization_id=_org AND status='active';
  IF _count >= _limit THEN
    RAISE EXCEPTION 'Limite de membros atingido para esta equipe (%).', _limit;
  END IF;
  UPDATE public.organization_members SET status='active'
   WHERE organization_id=_org AND user_id=_user AND status='pending';
END $$;

CREATE OR REPLACE FUNCTION public.reject_member(_org uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_org_admin(auth.uid(), _org) THEN
    RAISE EXCEPTION 'Apenas admins da equipe podem recusar membros.';
  END IF;
  DELETE FROM public.organization_members
   WHERE organization_id=_org AND user_id=_user AND status='pending';
END $$;

GRANT EXECUTE ON FUNCTION public.list_pending_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_pending_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_member(uuid, uuid) TO authenticated;
