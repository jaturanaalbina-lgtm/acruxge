ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#8B5CF6',
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#A78BFA',
  ADD COLUMN IF NOT EXISTS join_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_org_public(_slug text)
RETURNS TABLE(id uuid, name text, brand_name text, logo_url text, primary_color text, accent_color text, join_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id, o.name, o.brand_name, o.logo_url, o.primary_color, o.accent_color, o.join_enabled
  FROM public.organizations o
  WHERE o.slug = lower(trim(_slug))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_public(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.join_org_by_slug(_slug text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _org public.organizations%ROWTYPE; _count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO _org FROM public.organizations WHERE slug = lower(trim(_slug));
  IF _org.id IS NULL THEN RAISE EXCEPTION 'Equipe não encontrada'; END IF;
  IF EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id=_org.id AND user_id=auth.uid()) THEN
    RETURN _org.id;
  END IF;
  IF NOT _org.join_enabled THEN RAISE EXCEPTION 'Esta equipe não aceita entradas por link.'; END IF;
  SELECT count(*) INTO _count FROM public.organization_members WHERE organization_id=_org.id;
  IF _count >= _org.member_limit THEN RAISE EXCEPTION 'Limite de membros atingido para esta equipe.'; END IF;
  INSERT INTO public.organization_members(organization_id, user_id, role)
  VALUES (_org.id, auth.uid(), 'member') ON CONFLICT DO NOTHING;
  RETURN _org.id;
END $$;

GRANT EXECUTE ON FUNCTION public.join_org_by_slug(text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.my_organizations();
CREATE OR REPLACE FUNCTION public.my_organizations()
RETURNS TABLE(id uuid, name text, slug text, logo_url text, brand_name text, role org_role, member_count integer, member_limit integer, primary_color text, accent_color text, join_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id, o.name, o.slug, o.logo_url, o.brand_name, om.role,
    (SELECT count(*)::int FROM public.organization_members WHERE organization_id = o.id),
    o.member_limit, o.primary_color, o.accent_color, o.join_enabled
  FROM public.organizations o
  JOIN public.organization_members om ON om.organization_id = o.id
  WHERE om.user_id = auth.uid()
  ORDER BY om.created_at;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _email text := lower(COALESCE(NEW.email, ''));
  _inv RECORD;
  _slug text := NEW.raw_user_meta_data->>'org_slug';
  _org public.organizations%ROWTYPE;
  _count int;
BEGIN
  INSERT INTO public.profiles (id, full_name, status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'approved'::public.profile_status)
  ON CONFLICT (id) DO NOTHING;

  IF _slug IS NOT NULL AND length(trim(_slug)) > 0 THEN
    SELECT * INTO _org FROM public.organizations WHERE slug = lower(trim(_slug));
    IF _org.id IS NOT NULL AND _org.join_enabled THEN
      SELECT count(*) INTO _count FROM public.organization_members WHERE organization_id = _org.id;
      IF _count < _org.member_limit THEN
        INSERT INTO public.organization_members(organization_id, user_id, role)
        VALUES (_org.id, NEW.id, 'member') ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  FOR _inv IN
    SELECT * FROM public.invites
    WHERE lower(email) = _email AND used_at IS NULL AND expires_at > now()
  LOOP
    IF _inv.organization_id IS NOT NULL THEN
      INSERT INTO public.organization_members(organization_id, user_id, role)
      VALUES (_inv.organization_id, NEW.id, 'member') ON CONFLICT DO NOTHING;
    END IF;
    IF _inv.area_id IS NOT NULL THEN
      INSERT INTO public.area_members(area_id, user_id, is_leader)
      VALUES (_inv.area_id, NEW.id, _inv.is_leader) ON CONFLICT DO NOTHING;
    END IF;
    UPDATE public.invites SET used_at = now(), used_by = NEW.id WHERE id = _inv.id;
  END LOOP;

  RETURN NEW;
END $function$;