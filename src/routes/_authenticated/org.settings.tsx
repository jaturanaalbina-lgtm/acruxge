import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useActiveOrg } from "@/contexts/active-org";
import { updateOrganization } from "@/lib/organizations.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/org/settings")({
  ssr: false,
  component: OrgSettingsPage,
});

function OrgSettingsPage() {
  const { activeOrg, isAdmin, refetch } = useActiveOrg();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateOrganization);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [logo, setLogo] = useState("");
  const [limit, setLimit] = useState<number>(10);

  useEffect(() => {
    if (activeOrg) {
      setName(activeOrg.name);
      setBrand(activeOrg.brand_name ?? "");
      setLogo(activeOrg.logo_url ?? "");
      setLimit(activeOrg.member_limit);
    }
  }, [activeOrg]);

  const save = useMutation({
    mutationFn: async () => updateFn({
      data: {
        organization_id: activeOrg!.id,
        name,
        brand_name: brand || null,
        logo_url: logo || null,
        member_limit: limit,
      },
    }),
    onSuccess: async () => {
      toast.success("Equipe atualizada");
      await qc.invalidateQueries({ queryKey: ["my-organizations"] });
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!activeOrg) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!isAdmin) return <div className="p-6 text-sm text-muted-foreground">Apenas admins da equipe podem editar.</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Settings /> Configurações da equipe</h1>
        <p className="text-sm text-muted-foreground">
          {activeOrg.member_count} de {activeOrg.member_limit} membros · slug <code>{activeOrg.slug}</code>
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div>
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Nome no papel timbrado (PDF de ponto)</Label>
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div>
          <Label>URL do logo (opcional)</Label>
          <Input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…" />
        </div>
        <div>
          <Label>Limite de membros</Label>
          <Input type="number" min={1} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 1)} />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
      </Card>
    </div>
  );
}
