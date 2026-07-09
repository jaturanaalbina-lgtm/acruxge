
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  brand_name TEXT,
  member_limit INT NOT NULL DEFAULT 10 CHECK (member_limit > 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_orgs_updated BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TYPE public.org_role AS ENUM ('owner','admin','member');

CREATE TABLE public.organization_members (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);

CREATE OR REPLACE FUNCTION public.is_org_member(_user UUID, _org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.organization_members
    WHERE user_id=_user AND organization_id=_org);
$$;
CREATE OR REPLACE FUNCTION public.is_org_admin(_user UUID, _org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.organization_members
    WHERE user_id=_user AND organization_id=_org AND role IN ('owner','admin'));
$$;
CREATE OR REPLACE FUNCTION public.is_org_owner(_user UUID, _org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.organization_members
    WHERE user_id=_user AND organization_id=_org AND role='owner');
$$;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid,uuid) TO authenticated, service_role;

ALTER TABLE public.areas         ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.projects      ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tasks         ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.content_posts ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.time_entries  ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.invites       ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

DO $$
DECLARE
  _acrux UUID;
  _owner UUID;
BEGIN
  -- Pick the first existing auth user as the Acrux owner
  SELECT p.id INTO _owner
  FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  ORDER BY p.created_at LIMIT 1;

  INSERT INTO public.organizations(name, slug, brand_name, created_by, member_limit)
  VALUES ('Acrux ROBOCEP','acrux-robocep','Acrux ROBOCEP', _owner, 9999)
  RETURNING id INTO _acrux;

  -- Add all existing users (that still exist in auth.users) to Acrux
  INSERT INTO public.organization_members(organization_id, user_id, role)
  SELECT _acrux, p.id,
    CASE WHEN p.id = _owner THEN 'owner'::public.org_role
         ELSE 'member'::public.org_role END
  FROM public.profiles p
  WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  ON CONFLICT DO NOTHING;

  UPDATE public.areas         SET organization_id=_acrux WHERE organization_id IS NULL;
  UPDATE public.projects      SET organization_id=_acrux WHERE organization_id IS NULL;
  UPDATE public.tasks         SET organization_id=_acrux WHERE organization_id IS NULL;
  UPDATE public.content_posts SET organization_id=_acrux WHERE organization_id IS NULL;
  UPDATE public.time_entries  SET organization_id=_acrux WHERE organization_id IS NULL;
  UPDATE public.invites       SET organization_id=_acrux WHERE organization_id IS NULL;
END $$;

ALTER TABLE public.areas         ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.projects      ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.tasks         ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.content_posts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.time_entries  ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.invites       ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX idx_areas_org         ON public.areas(organization_id);
CREATE INDEX idx_projects_org      ON public.projects(organization_id);
CREATE INDEX idx_tasks_org         ON public.tasks(organization_id);
CREATE INDEX idx_content_posts_org ON public.content_posts(organization_id);
CREATE INDEX idx_time_entries_org  ON public.time_entries(organization_id);
CREATE INDEX idx_invites_org       ON public.invites(organization_id);

CREATE OR REPLACE FUNCTION public.is_area_member(_user_id uuid, _area_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.areas a
    WHERE a.id = _area_id AND (
      public.is_org_admin(_user_id, a.organization_id)
      OR EXISTS(SELECT 1 FROM public.area_members am
                WHERE am.user_id=_user_id AND am.area_id=_area_id)
    )
  );
$$;

CREATE POLICY "orgs read own" ON public.organizations FOR SELECT
  USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "orgs create authenticated" ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "orgs update by admin" ON public.organizations FOR UPDATE
  USING (public.is_org_admin(auth.uid(), id))
  WITH CHECK (public.is_org_admin(auth.uid(), id));
CREATE POLICY "orgs delete by owner" ON public.organizations FOR DELETE
  USING (public.is_org_owner(auth.uid(), id));

CREATE POLICY "org_members read" ON public.organization_members FOR SELECT
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "org_members insert" ON public.organization_members FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.is_org_admin(auth.uid(), organization_id));
CREATE POLICY "org_members update by admin" ON public.organization_members FOR UPDATE
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));
CREATE POLICY "org_members delete" ON public.organization_members FOR DELETE
  USING (public.is_org_admin(auth.uid(), organization_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "areas read all authenticated" ON public.areas;
DROP POLICY IF EXISTS "areas read anon" ON public.areas;
DROP POLICY IF EXISTS "areas admin write" ON public.areas;
CREATE POLICY "areas read by org member" ON public.areas FOR SELECT
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "areas write by org admin" ON public.areas FOR ALL
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "area_members read all" ON public.area_members;
DROP POLICY IF EXISTS "area_members admin write" ON public.area_members;
CREATE POLICY "area_members read" ON public.area_members FOR SELECT
  USING (EXISTS(SELECT 1 FROM public.areas a
    WHERE a.id=area_members.area_id AND public.is_org_member(auth.uid(), a.organization_id)));
CREATE POLICY "area_members write by org admin" ON public.area_members FOR ALL
  USING (EXISTS(SELECT 1 FROM public.areas a
    WHERE a.id=area_members.area_id AND public.is_org_admin(auth.uid(), a.organization_id)))
  WITH CHECK (EXISTS(SELECT 1 FROM public.areas a
    WHERE a.id=area_members.area_id AND public.is_org_admin(auth.uid(), a.organization_id)));

DROP POLICY IF EXISTS "projects read by area members" ON public.projects;
DROP POLICY IF EXISTS "projects write by area members" ON public.projects;
DROP POLICY IF EXISTS "projects update by area members" ON public.projects;
DROP POLICY IF EXISTS "projects delete by area members" ON public.projects;
CREATE POLICY "projects read" ON public.projects FOR SELECT
  USING (public.is_org_member(auth.uid(), organization_id) AND public.is_area_member(auth.uid(), area_id));
CREATE POLICY "projects insert" ON public.projects FOR INSERT
  WITH CHECK (public.is_org_member(auth.uid(), organization_id) AND public.is_area_member(auth.uid(), area_id));
CREATE POLICY "projects update" ON public.projects FOR UPDATE
  USING (public.is_org_member(auth.uid(), organization_id) AND public.is_area_member(auth.uid(), area_id))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id) AND public.is_area_member(auth.uid(), area_id));
CREATE POLICY "projects delete" ON public.projects FOR DELETE
  USING (public.is_org_member(auth.uid(), organization_id) AND public.is_area_member(auth.uid(), area_id));

DROP POLICY IF EXISTS "tasks read all authenticated" ON public.tasks;
DROP POLICY IF EXISTS "tasks insert all authenticated" ON public.tasks;
DROP POLICY IF EXISTS "tasks update all authenticated" ON public.tasks;
DROP POLICY IF EXISTS "tasks delete admins or creator" ON public.tasks;
CREATE POLICY "tasks read" ON public.tasks FOR SELECT
  USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "tasks insert" ON public.tasks FOR INSERT
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "tasks update" ON public.tasks FOR UPDATE
  USING (public.is_org_member(auth.uid(), organization_id))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "tasks delete" ON public.tasks FOR DELETE
  USING (public.is_org_admin(auth.uid(), organization_id) OR created_by = auth.uid());

DROP POLICY IF EXISTS "posts read by area members" ON public.content_posts;
DROP POLICY IF EXISTS "posts insert by area members" ON public.content_posts;
DROP POLICY IF EXISTS "posts update by area members" ON public.content_posts;
DROP POLICY IF EXISTS "posts delete by area members" ON public.content_posts;
CREATE POLICY "posts read" ON public.content_posts FOR SELECT
  USING (public.is_org_member(auth.uid(), organization_id) AND public.is_area_member(auth.uid(), area_id));
CREATE POLICY "posts insert" ON public.content_posts FOR INSERT
  WITH CHECK (public.is_org_member(auth.uid(), organization_id) AND public.is_area_member(auth.uid(), area_id));
CREATE POLICY "posts update" ON public.content_posts FOR UPDATE
  USING (public.is_org_member(auth.uid(), organization_id) AND public.is_area_member(auth.uid(), area_id))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id) AND public.is_area_member(auth.uid(), area_id));
CREATE POLICY "posts delete" ON public.content_posts FOR DELETE
  USING (public.is_org_member(auth.uid(), organization_id) AND public.is_area_member(auth.uid(), area_id));

DROP POLICY IF EXISTS "Users view own entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users insert own entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users update own entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users delete own entries" ON public.time_entries;
CREATE POLICY "time read" ON public.time_entries FOR SELECT
  USING ((auth.uid() = user_id OR public.is_org_admin(auth.uid(), organization_id))
         AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "time insert" ON public.time_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "time update" ON public.time_entries FOR UPDATE
  USING ((auth.uid() = user_id OR public.is_org_admin(auth.uid(), organization_id))
         AND public.is_org_member(auth.uid(), organization_id))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "time delete" ON public.time_entries FOR DELETE
  USING ((auth.uid() = user_id OR public.is_org_admin(auth.uid(), organization_id))
         AND public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins manage invites" ON public.invites;
CREATE POLICY "invites manage by org admin" ON public.invites FOR ALL
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "profiles select self or admin" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "profiles select self or co-member" ON public.profiles FOR SELECT
  USING (auth.uid() = id OR EXISTS(
    SELECT 1 FROM public.organization_members m1
    JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id
    WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id
  ));
CREATE POLICY "org admin update co-member profiles" ON public.profiles FOR UPDATE
  USING (EXISTS(
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = profiles.id AND public.is_org_admin(auth.uid(), m.organization_id)
  ));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _email text := lower(COALESCE(NEW.email, ''));
  _inv RECORD;
BEGIN
  INSERT INTO public.profiles (id, full_name, status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'approved'::public.profile_status)
  ON CONFLICT (id) DO NOTHING;

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
END $$;

DROP FUNCTION IF EXISTS public.admin_list_members();
CREATE OR REPLACE FUNCTION public.admin_list_members(_org UUID)
RETURNS TABLE(id uuid, full_name text, avatar_url text, joined_at timestamptz,
              role public.org_role, memberships jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.full_name, p.avatar_url, om.created_at, om.role,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('area_id', am.area_id, 'is_leader', am.is_leader))
      FROM public.area_members am
      JOIN public.areas a ON a.id=am.area_id
      WHERE am.user_id = p.id AND a.organization_id = _org
    ), '[]'::jsonb)
  FROM public.organization_members om
  JOIN public.profiles p ON p.id = om.user_id
  WHERE om.organization_id = _org AND public.is_org_member(auth.uid(), _org)
  ORDER BY om.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_members(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_organizations()
RETURNS TABLE(id uuid, name text, slug text, logo_url text, brand_name text,
              role public.org_role, member_count int, member_limit int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT o.id, o.name, o.slug, o.logo_url, o.brand_name, om.role,
    (SELECT count(*)::int FROM public.organization_members WHERE organization_id = o.id),
    o.member_limit
  FROM public.organizations o
  JOIN public.organization_members om ON om.organization_id = o.id
  WHERE om.user_id = auth.uid()
  ORDER BY om.created_at;
$$;
GRANT EXECUTE ON FUNCTION public.my_organizations() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_invite_by_token(uuid);
CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token uuid)
RETURNS TABLE(email text, organization_id uuid, org_name text, area_id uuid,
              area_name text, is_leader boolean, expires_at timestamptz, used_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT i.email, i.organization_id, o.name, i.area_id, a.name,
         i.is_leader, i.expires_at, i.used_at
  FROM public.invites i
  LEFT JOIN public.organizations o ON o.id = i.organization_id
  LEFT JOIN public.areas a ON a.id = i.area_id
  WHERE i.token = _token LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(uuid) TO authenticated, anon, service_role;

DROP FUNCTION IF EXISTS public.list_directory();
CREATE OR REPLACE FUNCTION public.list_directory(_org UUID)
RETURNS TABLE(id uuid, full_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  JOIN public.organization_members om ON om.user_id = p.id
  WHERE om.organization_id = _org AND p.status='approved'
    AND public.is_org_member(auth.uid(), _org);
$$;
GRANT EXECUTE ON FUNCTION public.list_directory(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_member_limit()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE _limit int; _count int;
BEGIN
  SELECT member_limit INTO _limit FROM public.organizations WHERE id = NEW.organization_id;
  SELECT count(*) INTO _count FROM public.organization_members WHERE organization_id = NEW.organization_id;
  IF _count >= _limit THEN
    RAISE EXCEPTION 'Limite de membros atingido para esta equipe (%).', _limit
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_enforce_member_limit
BEFORE INSERT ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_member_limit();

CREATE OR REPLACE FUNCTION public.add_org_creator_as_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.organization_members(organization_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_add_org_owner
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.add_org_creator_as_owner();
