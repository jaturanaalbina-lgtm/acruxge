import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createOrganization } from "@/lib/organizations.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");

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
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Plus /> Nova equipe</h1>
        <p className="text-sm text-muted-foreground">Cada equipe tem seus próprios membros, áreas e dados.</p>
      </div>
      <Card className="p-6 space-y-4">
        <div>
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Nome no papel timbrado (opcional)</Label>
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <Button className="w-full" disabled={name.trim().length < 2 || create.isPending} onClick={() => create.mutate()}>
          Criar equipe
        </Button>
      </Card>
    </div>
  );
}
