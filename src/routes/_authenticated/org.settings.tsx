import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useActiveOrg } from "@/contexts/active-org";
import { updateOrganization } from "@/lib/organizations.functions";
import { OrgBrandForm, DEFAULT_BRAND, type OrgBrand } from "@/components/OrgBrandForm";
import { OrgShareLink } from "@/components/OrgShareLink";
import { AreasManager } from "@/components/AreasManager";
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

  const [brand, setBrand] = useState<OrgBrand>(DEFAULT_BRAND);
  const [limit, setLimit] = useState<number>(10);
  const [joinEnabled, setJoinEnabled] = useState(true);

  useEffect(() => {
    if (activeOrg) {
      setBrand({
        name: activeOrg.name,
        brand_name: activeOrg.brand_name ?? "",
        logo_url: activeOrg.logo_url ?? "",
        primary_color: activeOrg.primary_color ?? DEFAULT_BRAND.primary_color,
        accent_color: activeOrg.accent_color ?? DEFAULT_BRAND.accent_color,
      });
      setLimit(activeOrg.member_limit);
      setJoinEnabled(activeOrg.join_enabled ?? true);
    }
  }, [activeOrg]);

  const save = useMutation({
    mutationFn: async (patch?: { join_enabled?: boolean }) =>
      updateFn({
        data: {
          organization_id: activeOrg!.id,
          name: brand.name,
          brand_name: brand.brand_name || null,
          logo_url: brand.logo_url || null,
          member_limit: limit,
          primary_color: brand.primary_color,
          accent_color: brand.accent_color,
          join_enabled: patch?.join_enabled ?? joinEnabled,
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
        <OrgShareLink
          slug={activeOrg.slug}
          joinEnabled={joinEnabled}
          onToggleJoin={(v) => { setJoinEnabled(v); save.mutate({ join_enabled: v }); }}
        />
      </Card>

      <Card className="p-6 space-y-5">
        <OrgBrandForm value={brand} onChange={setBrand} />
        <div>
          <Label>Limite de membros</Label>
          <Input type="number" min={1} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 1)} />
        </div>
        <Button onClick={() => save.mutate(undefined)} disabled={save.isPending}>Salvar</Button>
      </Card>
    </div>
  );
}
