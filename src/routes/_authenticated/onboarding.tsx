import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createOrganization } from "@/lib/organizations.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({
  ssr: false,
  component: OnboardingPage,
});

function OnboardingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createOrg = useServerFn(createOrganization);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");

  const { data: orgs = [] } = useQuery({
    queryKey: ["my-organizations"],
    queryFn: async () => {
      const { data } = await supabase.rpc("my_organizations");
      return data ?? [];
    },
  });

  // Se o usuário já tem equipe(s), pula para o dashboard.
  useEffect(() => {
    if (orgs.length > 0) navigate({ to: "/dashboard" });
  }, [orgs, navigate]);

  const create = useMutation({
    mutationFn: async () => createOrg({ data: { name, brand_name: brand || name } }),
    onSuccess: async (org: any) => {
      toast.success(`Equipe "${org.name}" criada!`);
      if (typeof window !== "undefined") localStorage.setItem("active_org_id", org.id);
      await qc.invalidateQueries({ queryKey: ["my-organizations"] });
      navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto size-14 rounded-2xl bg-gradient-to-br from-acrux to-acrux-glow flex items-center justify-center">
            <Sparkles className="size-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold">Bem-vindo!</h1>
          <p className="text-sm text-muted-foreground">
            Crie o painel da sua equipe para começar a organizar áreas, projetos, tarefas e ponto.
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="size-4" /> Criar nova equipe
          </div>
          <div>
            <Label>Nome da equipe</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Acrux ROBOCEP" />
          </div>
          <div>
            <Label>Nome no papel timbrado (opcional)</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Como aparece no cabeçalho do PDF" />
            <p className="text-xs text-muted-foreground mt-1">Deixe vazio para usar o mesmo nome.</p>
          </div>
          <Button
            className="w-full"
            disabled={name.trim().length < 2 || create.isPending}
            onClick={() => create.mutate()}
          >
            Criar equipe
          </Button>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Foi convidado para uma equipe existente? Peça para reenviarem o link do convite.
          {" "}<Link to="/auth" className="underline">Sair</Link>
        </p>
      </div>
    </div>
  );
}
