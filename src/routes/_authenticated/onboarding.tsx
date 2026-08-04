import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createOrganization } from "@/lib/organizations.functions";
import { OrgBrandForm, DEFAULT_BRAND, type OrgBrand } from "@/components/OrgBrandForm";
import { OrgShareLink } from "@/components/OrgShareLink";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Sparkles, Hourglass } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({
  ssr: false,
  component: OnboardingPage,
});

function OnboardingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createOrg = useServerFn(createOrganization);
  const [brand, setBrand] = useState<OrgBrand>(DEFAULT_BRAND);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  const { data: orgs = [] } = useQuery({
    queryKey: ["my-organizations"],
    queryFn: async () => {
      const { data } = await supabase.rpc("my_organizations");
      return data ?? [];
    },
  });

  const { data: pendingOrgs = [] } = useQuery({
    queryKey: ["my-pending-organizations"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data } = await (supabase.rpc as any)("my_pending_organizations");
      return (data ?? []) as Array<{ id: string; name: string; brand_name: string | null; logo_url: string | null }>;
    },
  });

  // Se o usuário já tem equipe(s), pula para o dashboard.
  useEffect(() => {
    if (orgs.length > 0 && !createdSlug) navigate({ to: "/dashboard" });
  }, [orgs, navigate, createdSlug]);


  const create = useMutation({
    mutationFn: async () =>
      createOrg({
        data: {
          name: brand.name,
          brand_name: brand.brand_name || brand.name,
          logo_url: brand.logo_url || null,
          primary_color: brand.primary_color,
          accent_color: brand.accent_color,
        },
      }),
    onSuccess: async (org: any) => {
      toast.success(`Equipe "${org.name}" criada!`);
      if (typeof window !== "undefined") localStorage.setItem("active_org_id", org.id);
      setCreatedSlug(org.slug);
      await qc.invalidateQueries({ queryKey: ["my-organizations"] });
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
          <h1 className="text-2xl font-semibold">{createdSlug ? "Equipe criada!" : "Bem-vindo!"}</h1>
          <p className="text-sm text-muted-foreground">
            {createdSlug
              ? "Compartilhe o link abaixo com os membros da sua equipe."
              : "Crie o painel da sua equipe para começar a organizar áreas, projetos, tarefas e ponto."}
          </p>
        </div>

        {!createdSlug && pendingOrgs.length > 0 && (
          <Card className="p-5 space-y-2 border-dashed">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Hourglass className="size-4" /> Aguardando aprovação
            </div>
            <p className="text-sm text-muted-foreground">
              Seu pedido para entrar em{" "}
              <strong>{pendingOrgs.map((o) => o.brand_name || o.name).join(", ")}</strong>{" "}
              foi enviado. Assim que um administrador da equipe autorizar, o painel aparecerá aqui automaticamente.
            </p>
          </Card>
        )}

        {createdSlug ? (

          <Card className="p-6 space-y-4">
            <OrgShareLink slug={createdSlug} />
            <Button className="w-full" onClick={() => navigate({ to: "/dashboard" })}>Ir para o painel</Button>
          </Card>
        ) : (
          <Card className="p-6 space-y-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="size-4" /> Criar nova equipe
            </div>
            <OrgBrandForm value={brand} onChange={setBrand} />
            <Button
              className="w-full"
              disabled={brand.name.trim().length < 2 || create.isPending}
              onClick={() => create.mutate()}
            >
              Criar equipe
            </Button>
          </Card>
        )}

        {!createdSlug && (
          <p className="text-center text-xs text-muted-foreground">
            Foi convidado para uma equipe existente? Peça o link de entrada para o criador ou um admin.
            {" "}<Link to="/auth" className="underline">Sair</Link>
          </p>
        )}
      </div>
    </div>
  );
}
