-- per-org unique slugs instead of global
ALTER TABLE public.areas DROP CONSTRAINT IF EXISTS areas_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS areas_org_slug_key ON public.areas(organization_id, slug);

CREATE OR REPLACE FUNCTION public.seed_default_areas(_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _social uuid; _eng uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.areas WHERE organization_id = _org) THEN
    RETURN;
  END IF;

  INSERT INTO public.areas(organization_id, slug, name, sort_order)
  VALUES (_org, 'social', 'Social', 1) RETURNING id INTO _social;

  INSERT INTO public.areas(organization_id, parent_id, slug, name, sort_order) VALUES
    (_org, _social, 'social-projetos', 'Projetos', 2),
    (_org, _social, 'social-marketing', 'Marketing', 3),
    (_org, _social, 'social-premios', 'Prêmios', 4);

  INSERT INTO public.areas(organization_id, slug, name, sort_order)
  VALUES (_org, 'engenharia', 'Engenharia', 5) RETURNING id INTO _eng;

  INSERT INTO public.areas(organization_id, parent_id, slug, name, sort_order) VALUES
    (_org, _eng, 'engenharia-cad', 'CAD', 6),
    (_org, _eng, 'engenharia-montagem', 'Montagem', 7);

  INSERT INTO public.areas(organization_id, slug, name, sort_order)
  VALUES (_org, 'programacao', 'Programação', 8);
END $$;

CREATE OR REPLACE FUNCTION public.seed_areas_on_org_create()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_areas(NEW.id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_areas_on_org_create ON public.organizations;
CREATE TRIGGER trg_seed_areas_on_org_create
AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.seed_areas_on_org_create();

-- backfill orgs with no areas
DO $$
DECLARE o record;
BEGIN
  FOR o IN SELECT id FROM public.organizations WHERE NOT EXISTS (
    SELECT 1 FROM public.areas a WHERE a.organization_id = organizations.id
  ) LOOP
    PERFORM public.seed_default_areas(o.id);
  END LOOP;
END $$;