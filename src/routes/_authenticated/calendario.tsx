import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveOrg } from "@/contexts/active-org";
import { useOrgMembers } from "@/components/KanbanBoard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays, Bell } from "lucide-react";
import { toast } from "sonner";
import { ensureNotificationPermission } from "@/lib/ponto-notification";
import { pushReminders, type ReminderItem } from "@/lib/notifications";

export const Route = createFileRoute("/_authenticated/calendario")({
  ssr: false,
  component: CalendarPage,
  head: () => ({
    meta: [
      { title: "Calendário da equipe | GE by Acrux ROBOCEP" },
      { name: "description", content: "Eventos, prazos e lembretes da equipe em um calendário compartilhado." },
      { property: "og:title", content: "Calendário da equipe | GE by Acrux ROBOCEP" },
      { property: "og:description", content: "Organize eventos, prazos e lembretes da sua equipe de robótica." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const NONE = "__none__";
const COLORS = ["#8B5CF6", "#22C55E", "#F59E0B", "#EF4444", "#38BDF8", "#EC4899"];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  color: string;
  area_id: string | null;
  created_by: string | null;
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = () => iso(new Date());

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function CalendarPage() {
  const { user } = Route.useRouteContext();
  const { activeOrgId, isAdmin } = useActiveOrg();
  const qc = useQueryClient();
  const { data: members = [] } = useOrgMembers();

  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<string>(todayISO());
  const [editing, setEditing] = useState<Partial<EventRow> | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const days = useMemo(() => monthGrid(year, month), [year, month]);
  const rangeFrom = iso(days[0]);
  const rangeTo = iso(days[days.length - 1]);

  const { data: areas = [] } = useQuery({
    queryKey: ["areas", activeOrgId],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id,name").eq("organization_id", activeOrgId!).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const eventsKey = ["calendar-events", activeOrgId, rangeFrom, rangeTo];
  const { data: events = [] } = useQuery({
    queryKey: eventsKey,
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events").select("*")
        .eq("organization_id", activeOrgId!)
        .gte("start_date", rangeFrom).lte("start_date", rangeTo)
        .order("start_date");
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const { data: deadlines = [] } = useQuery({
    queryKey: ["task-deadlines", activeOrgId, rangeFrom, rangeTo],
    enabled: !!activeOrgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks").select("id,title,due_date,status,assignee_id")
        .eq("organization_id", activeOrgId!)
        .gte("due_date", rangeFrom).lte("due_date", rangeTo)
        .neq("status", "done");
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; due_date: string; status: string; assignee_id: string | null }[];
    },
  });

  useEffect(() => {
    if (!activeOrgId) return;
    const ch = supabase
      .channel(`calendar:${activeOrgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events" }, () =>
        qc.invalidateQueries({ queryKey: ["calendar-events"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeOrgId, qc]);

  // Lembretes: véspera, dia e 1 hora antes do horário marcado
  useEffect(() => {
    if (!activeOrgId) return;
    if (!events.length && !deadlines.length) return;

    const run = () => {
      const now = new Date();
      const today = iso(now);
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
      const tmr = iso(tomorrow);
      const items: ReminderItem[] = [];

      for (const e of events) {
        if (e.start_date === tmr) {
          items.push({
            key: `ev-${e.id}-d1`, type: "event_reminder", title: "Evento amanhã",
            body: e.title, link: "/calendario", entity_id: e.id,
          });
        }
        if (e.start_date === today) {
          items.push({
            key: `ev-${e.id}-d0`, type: "event_reminder", title: "Evento hoje",
            body: e.title, link: "/calendario", entity_id: e.id,
          });
          if (e.start_time) {
            const start = new Date(`${e.start_date}T${e.start_time}`);
            const diffMin = (start.getTime() - now.getTime()) / 60000;
            if (diffMin > 0 && diffMin <= 60) {
              items.push({
                key: `ev-${e.id}-h1`, type: "event_reminder", title: "Evento em menos de 1 hora",
                body: `${e.title} · ${e.start_time.slice(0, 5)}`, link: "/calendario", entity_id: e.id,
              });
            }
          }
        }
      }

      for (const t of deadlines) {
        if (t.assignee_id !== user.id) continue;
        if (t.due_date === tmr) {
          items.push({
            key: `tk-${t.id}-d1`, type: "task_due", title: "Prazo de tarefa amanhã",
            body: t.title, link: "/calendario", entity_id: t.id,
          });
        }
        if (t.due_date === today) {
          items.push({
            key: `tk-${t.id}-d0`, type: "task_due", title: "Prazo de tarefa hoje",
            body: t.title, link: "/calendario", entity_id: t.id,
          });
        }
      }

      if (!items.length) return;
      void (async () => {
        await ensureNotificationPermission();
        await pushReminders(activeOrgId, user.id, items);
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })();
    };

    run();
    const timer = window.setInterval(run, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [events, deadlines, activeOrgId, user.id, qc]);

  const byDay = useMemo(() => {
    const map: Record<string, EventRow[]> = {};
    for (const e of events) {
      const end = e.end_date ?? e.start_date;
      const d = new Date(e.start_date + "T00:00:00");
      const last = new Date(end + "T00:00:00");
      while (d <= last) { (map[iso(d)] ||= []).push(e); d.setDate(d.getDate() + 1); }
    }
    return map;
  }, [events]);

  const deadlinesByDay = useMemo(() => {
    const map: Record<string, typeof deadlines> = {};
    for (const t of deadlines) (map[t.due_date] ||= []).push(t);
    return map;
  }, [deadlines]);

  const save = useMutation({
    mutationFn: async (ev: Partial<EventRow>) => {
      if (!activeOrgId) throw new Error("Selecione uma equipe.");
      const payload = {
        organization_id: activeOrgId,
        title: (ev.title ?? "").trim(),
        description: ev.description || null,
        start_date: ev.start_date!,
        end_date: ev.end_date || null,
        start_time: ev.start_time || null,
        color: ev.color || COLORS[0],
        area_id: ev.area_id || null,
      };
      if (!payload.title) throw new Error("Informe um título.");

      let eventId = ev.id;
      if (eventId) {
        const { error } = await supabase.from("calendar_events").update(payload).eq("id", eventId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("calendar_events").insert({ ...payload, created_by: user.id }).select("id").single();
        if (error) throw error;
        eventId = data.id;
      }
      await supabase.from("calendar_event_members").delete().eq("event_id", eventId!);
      if (participants.length) {
        const { error } = await supabase
          .from("calendar_event_members")
          .insert(participants.map((u) => ({ event_id: eventId!, user_id: u })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Evento salvo");
      setEditing(null);
      setParticipants([]);
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("calendar_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento excluído");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["calendar-events"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const moveEvent = useMutation({
    mutationFn: async ({ ev, date }: { ev: EventRow; date: string }) => {
      const delta = Math.round(
        (new Date(date + "T00:00:00").getTime() - new Date(ev.start_date + "T00:00:00").getTime()) / 86400000,
      );
      let end: string | null = ev.end_date ?? null;
      if (end) {
        const d = new Date(end + "T00:00:00");
        d.setDate(d.getDate() + delta);
        end = iso(d);
      }
      const { error } = await supabase.from("calendar_events")
        .update({ start_date: date, end_date: end }).eq("id", ev.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Evento movido"); qc.invalidateQueries({ queryKey: ["calendar-events"] }); },
    onError: () => toast.error("Você não pode mover este evento."),
  });

  const duplicateEvent = useMutation({
    mutationFn: async (ev: EventRow) => {
      const { error } = await supabase.from("calendar_events").insert({
        organization_id: activeOrgId!, title: `${ev.title} (cópia)`, description: ev.description,
        start_date: ev.start_date, end_date: ev.end_date, start_time: ev.start_time,
        color: ev.color, area_id: ev.area_id, created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Evento duplicado"); qc.invalidateQueries({ queryKey: ["calendar-events"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const [dragEvId, setDragEvId] = useState<string | null>(null);
  const dropOnDay = (date: string) => {
    const ev = events.find((x) => x.id === dragEvId);
    setDragEvId(null);
    if (!ev || !canEdit(ev) || ev.start_date === date) return;
    moveEvent.mutate({ ev, date });
  };

  const openNew = (date: string) => {
    setParticipants([]);
    setEditing({ start_date: date, color: COLORS[0], title: "" });
  };

  const openEdit = async (ev: EventRow) => {
    const { data } = await supabase.from("calendar_event_members").select("user_id").eq("event_id", ev.id);
    setParticipants((data ?? []).map((r: any) => r.user_id));
    setEditing(ev);
  };

  const canEdit = (ev: EventRow) => isAdmin || ev.created_by === user.id;
  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold flex items-center gap-2">
            <CalendarDays className="size-5 text-acrux-glow" /> Calendário da equipe
          </h1>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <Bell className="size-3" /> Lembretes automáticos na véspera e no dia do evento ou prazo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Mês anterior"
            onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft className="size-4" /></Button>
          <div className="text-sm font-medium capitalize w-40 text-center">{monthLabel}</div>
          <Button variant="outline" size="icon" aria-label="Próximo mês"
            onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight className="size-4" /></Button>
          <Button size="sm" onClick={() => openNew(selected)}><Plus className="size-4" /> Novo evento</Button>
        </div>
      </div>

      <Card className="p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-[11px] uppercase tracking-wide text-muted-foreground text-center py-1">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = iso(d);
            const inMonth = d.getMonth() === month;
            const evs = byDay[key] ?? [];
            const dls = deadlinesByDay[key] ?? [];
            const main = evs[0]?.color ?? (dls.length ? "#F59E0B" : null);
            const isToday = key === todayISO();
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                onDoubleClick={() => openNew(key)}
                onDragOver={(e) => { if (dragEvId) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); dropOnDay(key); }}
                className={`min-h-20 rounded-md border p-1.5 text-left transition-colors hover:border-acrux/60 ${
                  selected === key ? "ring-2 ring-acrux/60" : ""
                } ${inMonth ? "border-border" : "border-transparent opacity-40"}`}
                style={main ? { backgroundColor: `color-mix(in oklab, ${main} 18%, transparent)`, borderColor: `color-mix(in oklab, ${main} 45%, transparent)` } : undefined}
              >
                <div className={`text-xs ${isToday ? "font-bold text-acrux-glow" : "text-muted-foreground"}`}>
                  {d.getDate()}
                </div>
                <div className="mt-1 space-y-0.5">
                  {evs.slice(0, 2).map((e) => (
                    <div
                      key={e.id}
                      draggable={canEdit(e)}
                      onDragStart={() => setDragEvId(e.id)}
                      onDragEnd={() => setDragEvId(null)}
                      title={canEdit(e) ? "Arraste para outro dia" : e.title}
                      className={`truncate text-[10px] px-1 rounded ${canEdit(e) ? "cursor-grab active:cursor-grabbing" : ""}`}
                      style={{ backgroundColor: `color-mix(in oklab, ${e.color} 35%, transparent)` }}
                    >
                      {e.title}
                    </div>
                  ))}
                  {dls.slice(0, 1).map((t) => (
                    <div key={t.id} className="truncate text-[10px] px-1 rounded bg-amber-500/25">⏱ {t.title}</div>
                  ))}
                  {evs.length + dls.length > 3 && (
                    <div className="text-[10px] text-muted-foreground">+{evs.length + dls.length - 3}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium capitalize">
            {new Date(selected + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </h2>
          <Button size="sm" variant="outline" onClick={() => openNew(selected)}><Plus className="size-4" /> Adicionar</Button>
        </div>

        {(byDay[selected] ?? []).map((e) => (
          <div key={e.id} className="flex items-start gap-3 rounded-md border border-border p-3">
            <span className="mt-1 size-3 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{e.title}</div>
              {e.start_time && <div className="text-xs text-muted-foreground">{e.start_time.slice(0, 5)}</div>}
              {e.description && <div className="text-xs text-muted-foreground mt-1">{e.description}</div>}
              {e.area_id && (
                <Badge variant="secondary" className="mt-1">{areas.find((a) => a.id === e.area_id)?.name ?? "Área"}</Badge>
              )}
            </div>
            {canEdit(e) && (
              <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>Editar</Button>
            )}
          </div>
        ))}

        {(deadlinesByDay[selected] ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <span className="size-3 rounded-full bg-amber-500 shrink-0" />
            <div className="text-sm">Prazo da tarefa: <span className="font-medium">{t.title}</span></div>
          </div>
        ))}

        {!(byDay[selected] ?? []).length && !(deadlinesByDay[selected] ?? []).length && (
          <div className="text-xs text-muted-foreground py-4 text-center">Nenhum evento ou prazo neste dia.</div>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar evento" : "Novo evento"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input value={editing?.title ?? ""} onChange={(e) => setEditing((s) => ({ ...s, title: e.target.value }))} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={editing?.description ?? ""} onChange={(e) => setEditing((s) => ({ ...s, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="date" value={editing?.start_date ?? ""} onChange={(e) => setEditing((s) => ({ ...s, start_date: e.target.value }))} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="date" value={editing?.end_date ?? ""} onChange={(e) => setEditing((s) => ({ ...s, end_date: e.target.value }))} />
              </div>
              <div>
                <Label>Hora</Label>
                <Input type="time" value={editing?.start_time?.slice(0, 5) ?? ""} onChange={(e) => setEditing((s) => ({ ...s, start_time: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Área</Label>
              <Select
                value={editing?.area_id ?? NONE}
                onValueChange={(v) => setEditing((s) => ({ ...s, area_id: v === NONE ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Sem área" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem área</SelectItem>
                  {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cor de destaque</Label>
              <div className="flex gap-2 mt-1">
                {COLORS.map((c) => (
                  <button
                    key={c} type="button" aria-label={`Cor ${c}`}
                    onClick={() => setEditing((s) => ({ ...s, color: c }))}
                    className={`size-7 rounded-full border-2 ${editing?.color === c ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>Responsáveis</Label>
              <div className="mt-1 max-h-36 overflow-y-auto space-y-1.5 rounded-md border border-border p-2">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={participants.includes(m.id)}
                      onCheckedChange={(v) =>
                        setParticipants((p) => (v ? [...p, m.id] : p.filter((x) => x !== m.id)))
                      }
                    />
                    {m.full_name ?? "Membro"}
                  </label>
                ))}
                {!members.length && <div className="text-xs text-muted-foreground">Nenhum membro ativo.</div>}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editing?.id && (
              <Button variant="ghost" className="text-destructive" onClick={() => remove.mutate(editing.id!)}>
                <Trash2 className="size-4" /> Excluir
              </Button>
            )}
            <Button onClick={() => save.mutate(editing!)} disabled={save.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
