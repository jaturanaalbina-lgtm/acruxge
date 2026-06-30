import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { claimAdmin } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/setup")({
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (isAdmin) return;
    const { count } = await supabase
      .from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) > 0) throw redirect({ to: "/dashboard" });
  },
  component: SetupPage,
});

function SetupPage() {
  const claim = useServerFn(claimAdmin);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await claim({ data: { email } });
      toast.success(`Promovido a admin · ${res.areas} áreas atribuídas`);
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao promover");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <Card className="glass-panel p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-lg bg-gradient-to-br from-acrux to-acrux-glow flex items-center justify-center">
            <ShieldCheck className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Configuração inicial</h1>
            <p className="text-xs text-muted-foreground">
              Reivindique o papel de administrador da equipe. Disponível enquanto não houver outro admin.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Confirme seu email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="você@exemplo.com"
              required
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Deve ser o mesmo email da conta autenticada — usado como verificação.
            </p>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Promovendo..." : "Tornar-me administrador"}
          </Button>
        </form>

        <div className="mt-6 text-xs text-muted-foreground space-y-1">
          <p>· Concede o papel <strong>admin</strong> à sua conta.</p>
          <p>· Vincula você como líder em todas as áreas principais (Social, Engenharia, Programação).</p>
          <p>· Após existir um admin, apenas admins podem promover outros usuários.</p>
        </div>
      </Card>
    </div>
  );
}
