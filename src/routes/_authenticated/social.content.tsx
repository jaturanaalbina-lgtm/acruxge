import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus, Download, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/social/content")({
  ssr: false,
  component: ContentPlanner,
});

type Status = "todo" | "producing" | "review" | "scheduled" | "published" | "cancelled";
const STATUS_LABEL: Record<Status, string> = {
  todo: "A Fazer", producing: "Em Produção", review: "Revisão", scheduled: "Agendado", published: "Publicado", cancelled: "Cancelado",
};
const STATUS_COLOR: Record<Status, string> = {
  todo: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  producing: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  review: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  scheduled: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  published: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-300 border-red-500/30",
};

function ContentPlanner() {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const monthStart = useMemo(() => new Date(date.getFullYear(), date.getMonth(), 1), [date]);
  const monthEnd = useMemo(() => new Date(date.getFullYear(), date.getMonth() + 1, 0), [date]);

  const { data: socialArea } = useQuery({
    queryKey: ["area-social"],
    queryFn: async () => (await supabase.from("areas").select("id").eq("slug", "social").maybeSingle()).data,
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["posts", date.getFullYear(), date.getMonth(), socialArea?.id],
    enabled: !!socialArea?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("content_posts")
        .select("*")
        .gte("post_date", monthStart.toISOString().slice(0, 10))
        .lte("post_date", monthEnd.toISOString().slice(0, 10))
        .order("post_date");
      return data ?? [];
    },
  });

  const filtered = posts.filter((p: any) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search && !`${p.title} ${p.community ?? ""} ${p.post_type ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["posts"] }); toast.success("Removido"); },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("content_posts").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });

  const exportCsv = () => {
    const headers = ["Data", "Post", "Tipo", "Comunidade", "Status"];
    const rows = filtered.map((p: any) => [p.post_date, p.title, p.post_type ?? "", p.community ?? "", STATUS_LABEL[p.status as Status]]);
    const csv = [headers, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `planejamento-${date.getFullYear()}-${date.getMonth() + 1}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const monthLabel = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planejamento de Conteúdo</h1>
          <p className="text-sm text-muted-foreground">Calendário editorial da Social — substitui a planilha.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1))}><ChevronLeft className="size-4" /></Button>
          <div className="min-w-[160px] text-center text-sm font-medium capitalize">{monthLabel}</div>
          <Button variant="outline" size="icon" onClick={() => setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1))}><ChevronRight className="size-4" /></Button>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="size-4" /> Exportar CSV</Button>
          {socialArea && <NewPostDialog areaId={socialArea.id} />}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="size-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input placeholder="Pesquisar posts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[110px_minmax(220px,2fr)_140px_180px_180px_60px] bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <div className="px-3 py-2 border-r border-border">Data</div>
          <div className="px-3 py-2 border-r border-border">Post</div>
          <div className="px-3 py-2 border-r border-border">Tipo</div>
          <div className="px-3 py-2 border-r border-border">Comunidade</div>
          <div className="px-3 py-2 border-r border-border">Status</div>
          <div className="px-3 py-2"></div>
        </div>
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma postagem neste mês.</div>
        )}
        {filtered.map((p: any) => (
          <div key={p.id} className="grid grid-cols-[110px_minmax(220px,2fr)_140px_180px_180px_60px] border-t border-border hover:bg-accent/40 transition-colors text-sm">
            <div className="px-3 py-2 border-r border-border font-mono text-xs">{new Date(p.post_date).toLocaleDateString("pt-BR")}</div>
            <div className="px-3 py-2 border-r border-border">
              <div className="font-medium">{p.title}</div>
              {p.notes && <div className="text-xs text-muted-foreground line-clamp-1">{p.notes}</div>}
            </div>
            <div className="px-3 py-2 border-r border-border text-muted-foreground">{p.post_type ?? "—"}</div>
            <div className="px-3 py-2 border-r border-border text-muted-foreground">{p.community ?? "—"}</div>
            <div className="px-3 py-2 border-r border-border">
              <Select value={p.status} onValueChange={(v) => updateStatus.mutate({ id: p.id, status: v as Status })}>
                <SelectTrigger className="h-7 w-full border-none bg-transparent shadow-none px-1 focus:ring-0">
                  <Badge variant="outline" className={STATUS_COLOR[p.status as Status]}>{STATUS_LABEL[p.status as Status]}</Badge>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="px-3 py-2 flex items-center justify-center">
              <Button variant="ghost" size="icon" className="size-7" onClick={() => del.mutate(p.id)}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewPostDialog({ areaId }: { areaId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [postDate, setPostDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [community, setCommunity] = useState("");
  const [status, setStatus] = useState<Status>("todo");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: area, error: aErr } = await supabase
        .from("areas").select("organization_id").eq("id", areaId).single();
      if (aErr) throw aErr;
      const { error } = await supabase.from("content_posts").insert({
        area_id: areaId, organization_id: area.organization_id,
        post_date: postDate, title, post_type: type || null, community: community || null, status, notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Post adicionado"); qc.invalidateQueries({ queryKey: ["posts"] }); setOpen(false); setTitle(""); setType(""); setCommunity(""); setNotes(""); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="size-4" /> Novo post</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo post</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data</Label><Input type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} /></div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Post</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Tipo</Label><Input placeholder="Reels, Carrossel..." value={type} onChange={(e) => setType(e.target.value)} /></div>
            <div><Label>Comunidade</Label><Input placeholder="Instagram, TikTok..." value={community} onChange={(e) => setCommunity(e.target.value)} /></div>
          </div>
          <div><Label>Observações</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={() => create.mutate()} disabled={!title || create.isPending}>Adicionar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
