
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'leader', 'member');
CREATE TYPE public.task_status AS ENUM ('backlog','todo','in_progress','review','approval','done');
CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.post_status AS ENUM ('todo','producing','review','scheduled','published','cancelled');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles select all authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member');
  RETURN NEW;
END;
$$;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles read own + admin all" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$$;

-- Now create the trigger (after user_roles exists)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ AREAS ============
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.areas(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.areas TO authenticated;
GRANT ALL ON public.areas TO service_role;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "areas read all authenticated" ON public.areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "areas admin write" ON public.areas FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ AREA MEMBERS ============
CREATE TABLE public.area_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_leader BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (area_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.area_members TO authenticated;
GRANT ALL ON public.area_members TO service_role;
ALTER TABLE public.area_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "area_members read all" ON public.area_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "area_members admin write" ON public.area_members FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.is_area_member(_user_id UUID, _area_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.area_members WHERE user_id = _user_id AND area_id = _area_id
  );
$$;

-- ============ PROJECTS ============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  priority task_priority DEFAULT 'medium',
  due_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects read by area members" ON public.projects FOR SELECT TO authenticated USING (public.is_area_member(auth.uid(), area_id));
CREATE POLICY "projects write by area members" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.is_area_member(auth.uid(), area_id));
CREATE POLICY "projects update by area members" ON public.projects FOR UPDATE TO authenticated USING (public.is_area_member(auth.uid(), area_id));
CREATE POLICY "projects delete by area members" ON public.projects FOR DELETE TO authenticated USING (public.is_area_member(auth.uid(), area_id));

-- ============ TASKS (Kanban) ============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'backlog',
  priority task_priority NOT NULL DEFAULT 'medium',
  assignee_id UUID REFERENCES auth.users(id),
  due_date DATE,
  labels TEXT[] DEFAULT '{}',
  progress INT DEFAULT 0,
  position INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_area_idx ON public.tasks(area_id);
CREATE INDEX tasks_project_idx ON public.tasks(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks read by area members" ON public.tasks FOR SELECT TO authenticated USING (public.is_area_member(auth.uid(), area_id));
CREATE POLICY "tasks insert by area members" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.is_area_member(auth.uid(), area_id));
CREATE POLICY "tasks update by area members" ON public.tasks FOR UPDATE TO authenticated USING (public.is_area_member(auth.uid(), area_id));
CREATE POLICY "tasks delete by area members" ON public.tasks FOR DELETE TO authenticated USING (public.is_area_member(auth.uid(), area_id));

-- ============ CONTENT POSTS (Social) ============
CREATE TABLE public.content_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  post_date DATE NOT NULL,
  title TEXT NOT NULL,
  post_type TEXT,
  community TEXT,
  responsible_id UUID REFERENCES auth.users(id),
  status post_status NOT NULL DEFAULT 'todo',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX content_posts_date_idx ON public.content_posts(post_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_posts TO authenticated;
GRANT ALL ON public.content_posts TO service_role;
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts read by area members" ON public.content_posts FOR SELECT TO authenticated USING (public.is_area_member(auth.uid(), area_id));
CREATE POLICY "posts insert by area members" ON public.content_posts FOR INSERT TO authenticated WITH CHECK (public.is_area_member(auth.uid(), area_id));
CREATE POLICY "posts update by area members" ON public.content_posts FOR UPDATE TO authenticated USING (public.is_area_member(auth.uid(), area_id));
CREATE POLICY "posts delete by area members" ON public.content_posts FOR DELETE TO authenticated USING (public.is_area_member(auth.uid(), area_id));

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_projects_upd BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tasks_upd BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_posts_upd BEFORE UPDATE ON public.content_posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ SEED AREAS ============
INSERT INTO public.areas (slug, name, color, icon, sort_order) VALUES
  ('social', 'Social', '#3a3636', 'users', 1),
  ('engenharia', 'Engenharia', '#042698', 'wrench', 2),
  ('programacao', 'Programação', '#042698', 'code', 3);

INSERT INTO public.areas (slug, name, parent_id, sort_order) VALUES
  ('social-projetos', 'Projetos', (SELECT id FROM public.areas WHERE slug='social'), 1),
  ('social-marketing', 'Marketing', (SELECT id FROM public.areas WHERE slug='social'), 2),
  ('social-premios', 'Prêmios', (SELECT id FROM public.areas WHERE slug='social'), 3),
  ('engenharia-cad', 'CAD', (SELECT id FROM public.areas WHERE slug='engenharia'), 1),
  ('engenharia-montagem', 'Montagem', (SELECT id FROM public.areas WHERE slug='engenharia'), 2);
