CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  link text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_org_idx ON public.notifications (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications read own" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notifications insert by org member" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "notifications update own" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications delete own" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_task_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assignee_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.assignee_id IS NOT DISTINCT FROM NEW.assignee_id THEN RETURN NEW; END IF;
  IF NEW.assignee_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (organization_id, user_id, type, title, body, link, entity_id)
  VALUES (NEW.organization_id, NEW.assignee_id, 'task_assigned',
          'Nova tarefa atribuída a você', NEW.title, '/dashboard', NEW.id);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_task_assignee_ins
AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignee();

CREATE TRIGGER trg_notify_task_assignee_upd
AFTER UPDATE OF assignee_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignee();

CREATE OR REPLACE FUNCTION public.notify_task_coassignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _t public.tasks%ROWTYPE;
BEGIN
  SELECT * INTO _t FROM public.tasks WHERE id = NEW.task_id;
  IF _t.id IS NULL THEN RETURN NEW; END IF;
  IF NEW.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN RETURN NEW; END IF;
  IF _t.assignee_id IS NOT DISTINCT FROM NEW.user_id THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (organization_id, user_id, type, title, body, link, entity_id)
  VALUES (_t.organization_id, NEW.user_id, 'task_assigned',
          'Você foi incluído em uma tarefa', _t.title, '/dashboard', _t.id);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_task_coassignee
AFTER INSERT ON public.task_assignees
FOR EACH ROW EXECUTE FUNCTION public.notify_task_coassignee();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;