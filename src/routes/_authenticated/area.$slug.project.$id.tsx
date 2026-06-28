import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KanbanBoard, NewTaskButton } from "@/components/KanbanBoard";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/area/$slug/project/$id")({
  ssr: false,
  component: ProjectPage,
});

function ProjectPage() {
  const { slug, id } = Route.useParams();

  const { data: project } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("*, areas(name,slug)").eq("id", id).maybeSingle();
      return data;
    },
  });

  if (!project) return <div className="p-6 text-sm text-muted-foreground">Carregando projeto…</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-2">
        <Link to="/area/$slug" params={{ slug }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ChevronLeft className="size-3" /> Voltar para {project.areas?.name}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            {project.description && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{project.description}</p>}
          </div>
          <NewTaskButton areaId={project.area_id} projectId={project.id} />
        </div>
      </div>
      <KanbanBoard areaId={project.area_id} projectId={project.id} />
    </div>
  );
}
