import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Check, Link2 } from "lucide-react";
import { toast } from "sonner";

export function OrgShareLink({
  slug,
  joinEnabled,
  onToggleJoin,
}: {
  slug: string;
  joinEnabled?: boolean;
  onToggleJoin?: (v: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/auth?org=${slug}` : `/auth?org=${slug}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="flex items-center gap-2"><Link2 className="size-4" /> Link de entrada da equipe</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Compartilhe com os membros: quem criar conta por esse link entra direto na sua equipe.
        </p>
      </div>
      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
      {onToggleJoin && (
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <div className="text-sm">
            Permitir entrada pelo link
            <div className="text-xs text-muted-foreground">Desligue para bloquear novos ingressos.</div>
          </div>
          <Switch checked={joinEnabled ?? true} onCheckedChange={onToggleJoin} />
        </div>
      )}
    </div>
  );
}
