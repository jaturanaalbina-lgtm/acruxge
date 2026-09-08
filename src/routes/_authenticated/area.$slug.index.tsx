import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KanbanBoard, NewTaskButton } from "@/components/KanbanBoard";
import { Button } from "@/components/ui/button";
import { useActiveOrg } from "@/contexts/active-org";

export const Route = createFileRoute("/_authenticated/area/$slug/")({
  ssr: false,
  component: AreaPage,
});

function AreaPage() {
  const { slug } = Route.useParams();
  const { activeOrgId, isLoading: orgLoading } = useActiveOrg();

  const { data: area, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["area", activeOrgId, slug],
    enabled: !!activeOrgId,
    retry: 2,
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*")
        .eq("organization_id", activeOrgId!).eq("slug", slug).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Enquanto a equipe ativa ainda não está definida, é carregamento — não "não encontrada".
  if (orgLoading || !activeOrgId || isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando área…</div>;
  }

  if (isError) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Não conseguimos abrir esta área agora.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>Tentar de novo</Button>
      </div>
    );
  }

  if (!area) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Esta área não existe na equipe selecionada.</p>
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>Recarregar</Button>
          <Button size="sm" asChild><Link to="/dashboard">Voltar ao painel</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{area.name}</h1>
            <p className="text-sm text-muted-foreground">Quadro de tarefas da área.</p>
          </div>
          <NewTaskButton areaId={area.id} />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <KanbanBoard key={`${activeOrgId}:${area.id}`} areaId={area.id} projectId={null} />
      </div>
    </div>
  );
}
