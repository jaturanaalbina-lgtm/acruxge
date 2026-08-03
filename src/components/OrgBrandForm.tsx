import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

export type OrgBrand = {
  name: string;
  brand_name: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
};

export const DEFAULT_BRAND: OrgBrand = {
  name: "",
  brand_name: "",
  logo_url: "",
  primary_color: "#8B5CF6",
  accent_color: "#A78BFA",
};

const PALETTES: Array<{ label: string; primary: string; accent: string }> = [
  { label: "Roxo", primary: "#8B5CF6", accent: "#A78BFA" },
  { label: "Azul", primary: "#3B82F6", accent: "#60A5FA" },
  { label: "Verde", primary: "#10B981", accent: "#34D399" },
  { label: "Âmbar", primary: "#F59E0B", accent: "#FBBF24" },
  { label: "Rosa", primary: "#EC4899", accent: "#F472B6" },
  { label: "Vermelho", primary: "#EF4444", accent: "#F87171" },
];

const MAX_BYTES = 300 * 1024;

export function OrgBrandForm({
  value,
  onChange,
  showName = true,
}: {
  value: OrgBrand;
  onChange: (next: OrgBrand) => void;
  showName?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<OrgBrand>) => onChange({ ...value, ...patch });

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Selecione uma imagem.");
    if (file.size > MAX_BYTES) return toast.error("Imagem muito grande (máx. 300 KB).");
    const reader = new FileReader();
    reader.onload = () => set({ logo_url: String(reader.result) });
    reader.onerror = () => toast.error("Não foi possível ler a imagem.");
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-5">
      {showName && (
        <>
          <div>
            <Label>Nome da equipe</Label>
            <Input
              value={value.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Ex.: Acrux ROBOCEP"
            />
          </div>
          <div>
            <Label>Nome no papel timbrado (opcional)</Label>
            <Input
              value={value.brand_name}
              onChange={(e) => set({ brand_name: e.target.value })}
              placeholder="Como aparece no cabeçalho do PDF"
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label>Logo da equipe</Label>
        <div className="flex items-center gap-3">
          <div
            className="size-16 rounded-xl border border-border flex items-center justify-center overflow-hidden shrink-0"
            style={{
              background: value.logo_url
                ? undefined
                : `linear-gradient(135deg, ${value.primary_color}, ${value.accent_color})`,
            }}
          >
            {value.logo_url ? (
              <img src={value.logo_url} alt="Logo da equipe" className="size-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-white">
                {(value.name || "EQ").slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="size-4 mr-1.5" /> Enviar imagem
              </Button>
              {value.logo_url && (
                <Button type="button" variant="ghost" size="sm" onClick={() => set({ logo_url: "" })}>
                  <X className="size-4 mr-1.5" /> Remover
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG ou SVG até 300 KB.</p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <Input
          value={value.logo_url.startsWith("data:") ? "" : value.logo_url}
          onChange={(e) => set({ logo_url: e.target.value })}
          placeholder="…ou cole uma URL de imagem (https://…)"
        />
      </div>

      <div className="space-y-2">
        <Label>Cores da equipe</Label>
        <div className="flex flex-wrap gap-2">
          {PALETTES.map((p) => {
            const active = p.primary.toLowerCase() === value.primary_color.toLowerCase();
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => set({ primary_color: p.primary, accent_color: p.accent })}
                title={p.label}
                className={`size-8 rounded-full border-2 transition ${active ? "border-foreground scale-110" : "border-transparent"}`}
                style={{ background: `linear-gradient(135deg, ${p.primary}, ${p.accent})` }}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <Label className="text-xs text-muted-foreground">Cor principal</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={value.primary_color}
                onChange={(e) => set({ primary_color: e.target.value })}
                className="h-9 w-10 rounded border border-border bg-transparent"
              />
              <Input value={value.primary_color} onChange={(e) => set({ primary_color: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cor de destaque</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={value.accent_color}
                onChange={(e) => set({ accent_color: e.target.value })}
                className="h-9 w-10 rounded border border-border bg-transparent"
              />
              <Input value={value.accent_color} onChange={(e) => set({ accent_color: e.target.value })} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="text-xs text-muted-foreground mb-2">Prévia</div>
        <div className="flex items-center gap-3">
          <div
            className="size-9 rounded-lg overflow-hidden flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${value.primary_color}, ${value.accent_color})` }}
          >
            {value.logo_url && <img src={value.logo_url} alt="" className="size-full object-cover" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{value.name || "Sua equipe"}</div>
            <div className="text-[11px] text-muted-foreground">GE by Acrux ROBOCEP</div>
          </div>
          <span
            className="text-xs font-medium px-3 py-1.5 rounded-md text-white"
            style={{ backgroundColor: value.primary_color }}
          >
            Botão
          </span>
        </div>
      </div>
    </div>
  );
}
