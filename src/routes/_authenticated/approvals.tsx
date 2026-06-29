import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { reviewSignup } from "@/lib/approvals.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/approvals")({
  ssr: false,
  component: ApprovalsPage,
});

type Row = { id: string; full_name: string | null; status: string; created_at: string };

function ApprovalsPage() {
  const review = useServerFn(reviewSignup);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, status, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Row[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (userId: string, approve: boolean) => {
    try {
      await review({ data: { userId, approve } });
      toast.success(approve ? "Usuário aprovado" : "Usuário rejeitado");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const pending = rows.filter((r) => r.status === "pending");
  const others = rows.filter((r) => r.status !== "pending");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Aprovações</h1>
        <p className="text-sm text-muted-foreground">Libere ou rejeite novos cadastros da equipe.</p>
      </div>

      <Card className="glass-panel">
        <div className="p-4 border-b border-border text-sm font-medium">Pendentes ({pending.length})</div>
        <div className="divide-y divide-border">
          {loading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}
          {!loading && pending.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nenhuma solicitação pendente.</div>}
          {pending.map((r) => (
            <div key={r.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{r.full_name ?? "(sem nome)"}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => act(r.id, false)}>Rejeitar</Button>
                <Button size="sm" onClick={() => act(r.id, true)}>Aprovar</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="glass-panel">
        <div className="p-4 border-b border-border text-sm font-medium">Histórico</div>
        <div className="divide-y divide-border">
          {others.map((r) => (
            <div key={r.id} className="p-3 flex items-center justify-between text-sm">
              <span className="truncate">{r.full_name ?? "—"}</span>
              <Badge variant={r.status === "approved" ? "default" : "secondary"}>{r.status}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
