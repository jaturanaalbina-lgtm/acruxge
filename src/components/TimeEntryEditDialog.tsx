import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Save } from "lucide-react";

export const MIN_REPORT = 10;
const MAX_ENTRY_MINUTES = 24 * 60;

export type EditableEntry = {
  id: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
  duration_minutes: number | null;
  notes: string | null;
};

function toLocalParts(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function fromLocalParts(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

export function TimeEntryEditDialog({
  entry,
  editorId,
  onOpenChange,
  onSaved,
}: {
  entry: EditableEntry | null;
  editorId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState("");
  const [inTime, setInTime] = useState("");
  const [outDate, setOutDate] = useState("");
  const [outTime, setOutTime] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry) return;
    const start = toLocalParts(entry.clock_in);
    const end = entry.clock_out ? toLocalParts(entry.clock_out) : null;
    setDate(start.date);
    setInTime(start.time);
    setOutDate(end?.date ?? start.date);
    setOutTime(end?.time ?? "");
    setNotes(entry.notes ?? "");
  }, [entry]);

  const save = async () => {
    if (!entry) return;
    const start = fromLocalParts(date, inTime);
    if (Number.isNaN(start.getTime())) return toast.error("Informe uma data e hora de entrada válidas.");
    const now = new Date();
    if (start > now) return toast.error("A entrada não pode estar no futuro.");

    let clockOut: string | null = null;
    let duration: number | null = null;

    if (outTime) {
      const end = fromLocalParts(outDate || date, outTime);
      if (Number.isNaN(end.getTime())) return toast.error("Informe uma hora de saída válida.");
      if (end <= start) return toast.error("A saída precisa ser depois da entrada.");
      if (end > now) return toast.error("A saída não pode estar no futuro.");
      const mins = Math.round((end.getTime() - start.getTime()) / 60000);
      if (mins > MAX_ENTRY_MINUTES) return toast.error("Um único registro não pode passar de 24 horas.");
      clockOut = end.toISOString();
      duration = Math.max(1, mins);
    }

    const report = notes.trim();
    if (clockOut && report.length < MIN_REPORT) {
      return toast.error(`Descreva com pelo menos ${MIN_REPORT} caracteres o que foi feito.`);
    }

    setSaving(true);
    const { error } = await supabase
      .from("time_entries")
      .update({
        work_date: date,
        clock_in: start.toISOString(),
        clock_out: clockOut,
        duration_minutes: duration,
        notes: report || null,
        edited_at: new Date().toISOString(),
        edited_by: editorId,
      })
      .eq("id", entry.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Registro ajustado");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={!!entry} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar registro de ponto</DialogTitle>
          <DialogDescription>
            Corrija a data, os horários e o relatório. O total de horas é recalculado automaticamente e o
            registro fica marcado como ajustado manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="te-date">Data</Label>
              <Input id="te-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="te-in">Entrada</Label>
              <Input id="te-in" type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="te-outdate">Data da saída</Label>
              <Input id="te-outdate" type="date" value={outDate} onChange={(e) => setOutDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="te-out">Saída</Label>
              <Input id="te-out" type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Deixe vazio para manter o ponto em aberto.</p>
            </div>
          </div>

          <div>
            <Label htmlFor="te-notes">Relatório do dia</Label>
            <Textarea
              id="te-notes"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Descreva as atividades realizadas neste período..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}><Save className="size-4" /> Salvar ajuste</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
