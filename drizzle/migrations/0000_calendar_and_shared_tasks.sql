-- Calendar events
CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  start_date date NOT NULL,
  end_date date,
  start_time time,
  color text NOT NULL DEFAULT '#8B5CF6',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar read by org member" ON public.calendar_events
  FOR SELECT USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "calendar insert by org member" ON public.calendar_events
  FOR INSERT WITH CHECK (public.is_org_member(auth.uid(), organization_id) AND created_by = auth.uid());
CREATE POLICY "calendar update by owner or admin" ON public.calendar_events
  FOR UPDATE USING (public.is_org_member(auth.uid(), organization_id) AND (created_by = auth.uid() OR public.is_org_admin(auth.uid(), organization_id)))
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "calendar delete by owner or admin" ON public.calendar_events
  FOR DELETE USING (public.is_org_member(auth.uid(), organization_id) AND (created_by = auth.uid() OR public.is_org_admin(auth.uid(), organization_id)));

CREATE TRIGGER trg_calendar_events_upd BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_calendar_events_org_date ON public.calendar_events(organization_id, start_date);

-- Event participants
CREATE TABLE public.calendar_event_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_members TO authenticated;
GRANT ALL ON public.calendar_event_members TO service_role;
ALTER TABLE public.calendar_event_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event members read" ON public.calendar_event_members
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.calendar_events e WHERE e.id = event_id AND public.is_org_member(auth.uid(), e.organization_id)));
CREATE POLICY "event members write" ON public.calendar_event_members
  FOR ALL USING (EXISTS (SELECT 1 FROM public.calendar_events e WHERE e.id = event_id AND public.is_org_member(auth.uid(), e.organization_id) AND (e.created_by = auth.uid() OR public.is_org_admin(auth.uid(), e.organization_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.calendar_events e WHERE e.id = event_id AND public.is_org_member(auth.uid(), e.organization_id)));

-- Shared tasks: multiple areas
CREATE TABLE public.task_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, area_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_areas TO authenticated;
GRANT ALL ON public.task_areas TO service_role;
ALTER TABLE public.task_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task areas read" ON public.task_areas
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_org_member(auth.uid(), t.organization_id)));
CREATE POLICY "task areas write" ON public.task_areas
  FOR ALL USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_org_member(auth.uid(), t.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_org_member(auth.uid(), t.organization_id)));

CREATE INDEX idx_task_areas_area ON public.task_areas(area_id);

-- Shared tasks: multiple assignees
CREATE TABLE public.task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_assignees TO authenticated;
GRANT ALL ON public.task_assignees TO service_role;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task assignees read" ON public.task_assignees
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_org_member(auth.uid(), t.organization_id)));
CREATE POLICY "task assignees write" ON public.task_assignees
  FOR ALL USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_org_member(auth.uid(), t.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.is_org_member(auth.uid(), t.organization_id)));

CREATE INDEX idx_task_assignees_user ON public.task_assignees(user_id);

-- Backfill from existing single-area / single-assignee columns
INSERT INTO public.task_areas (task_id, area_id)
SELECT t.id, t.area_id FROM public.tasks t WHERE t.area_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.task_assignees (task_id, user_id)
SELECT t.id, t.assignee_id FROM public.tasks t WHERE t.assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_areas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_assignees;
