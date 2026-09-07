CREATE OR REPLACE FUNCTION public.superadmin_list_organizations()
RETURNS TABLE(
  id uuid, name text, slug text, logo_url text, brand_name text,
  created_at timestamptz, owner_name text,
  member_count int, pending_count int, task_count int, event_count int, time_entry_count int
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.id, o.name, o.slug, o.logo_url, o.brand_name, o.created_at,
    (SELECT p.full_name FROM public.organization_members om2
       JOIN public.profiles p ON p.id = om2.user_id
      WHERE om2.organization_id = o.id AND om2.role = 'owner' LIMIT 1),
    (SELECT count(*)::int FROM public.organization_members m WHERE m.organization_id=o.id AND m.status='active'),
    (SELECT count(*)::int FROM public.organization_members m WHERE m.organization_id=o.id AND m.status='pending'),
    (SELECT count(*)::int FROM public.tasks t WHERE t.organization_id=o.id),
    (SELECT count(*)::int FROM public.calendar_events e WHERE e.organization_id=o.id),
    (SELECT count(*)::int FROM public.time_entries te WHERE te.organization_id=o.id)
  FROM public.organizations o
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY o.created_at;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_rename_organization(_org uuid, _name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_org_owner(auth.uid(), _org)) THEN
    RAISE EXCEPTION 'Sem permissão para renomear esta equipe.';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'Nome inválido.';
  END IF;
  UPDATE public.organizations SET name = trim(_name) WHERE id = _org;
END $$;

CREATE OR REPLACE FUNCTION public.superadmin_delete_organization(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_org_owner(auth.uid(), _org)) THEN
    RAISE EXCEPTION 'Sem permissão para excluir esta equipe.';
  END IF;

  DELETE FROM public.task_assignees ta USING public.tasks t
    WHERE ta.task_id = t.id AND t.organization_id = _org;
  DELETE FROM public.task_areas ta USING public.tasks t
    WHERE ta.task_id = t.id AND t.organization_id = _org;
  DELETE FROM public.tasks WHERE organization_id = _org;
  DELETE FROM public.projects WHERE organization_id = _org;
  DELETE FROM public.content_posts WHERE organization_id = _org;
  DELETE FROM public.calendar_event_members cem USING public.calendar_events e
    WHERE cem.event_id = e.id AND e.organization_id = _org;
  DELETE FROM public.calendar_events WHERE organization_id = _org;
  DELETE FROM public.time_entries WHERE organization_id = _org;
  DELETE FROM public.notifications WHERE organization_id = _org;
  DELETE FROM public.invites WHERE organization_id = _org;
  DELETE FROM public.area_members am USING public.areas a
    WHERE am.area_id = a.id AND a.organization_id = _org;
  UPDATE public.areas SET parent_id = NULL WHERE organization_id = _org;
  DELETE FROM public.areas WHERE organization_id = _org;
  DELETE FROM public.organization_members WHERE organization_id = _org;
  DELETE FROM public.organizations WHERE id = _org;
END $$;

GRANT EXECUTE ON FUNCTION public.superadmin_list_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_rename_organization(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_organization(uuid) TO authenticated;
