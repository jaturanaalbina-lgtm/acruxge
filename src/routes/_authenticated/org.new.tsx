import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createOrganization } from "@/lib/organizations.functions";
import { OrgBrandForm, DEFAULT_BRAND, type OrgBrand } from "@/components/OrgBrandForm";
import { OrgShareLink } from "@/components/OrgShareLink";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/org/new")({
  ssr: false,
  component: NewOrgPage,
});

function NewOrgPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const createOrg = useServerFn(createOrganization);
  const [brand, setBrand] = useState<OrgBrand>(DEFAULT_BRAND);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

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
      await qc.invalidateQueries({ queryKey: ["my-organizations"] });
      setCreatedSlug(org.slug);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (createdSlug) {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Equipe criada!</h1>
          <p className="text-sm text-muted-foreground">Compartilhe o link abaixo com os membros da equipe.</p>
        </div>
        <Card className="p-6 space-y-4">
          <OrgShareLink slug={createdSlug} />
          <Button className="w-full" onClick={() => navigate({ to: "/dashboard" })}>Ir para o painel</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Plus /> Nova equipe</h1>
        <p className="text-sm text-muted-foreground">Cada equipe tem seus próprios membros, áreas e dados.</p>
      </div>
      <Card className="p-6 space-y-5">
        <OrgBrandForm value={brand} onChange={setBrand} />
        <Button
          className="w-full"
          disabled={brand.name.trim().length < 2 || create.isPending}
          onClick={() => create.mutate()}
        >
          Criar equipe
        </Button>
      </Card>
    </div>
  );
}
