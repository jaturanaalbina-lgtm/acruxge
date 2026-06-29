import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pending")({
  ssr: false,
  component: PendingPage,
});

function PendingPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-6">
      <Card className="glass-panel p-8 max-w-md text-center space-y-4">
        <div className="size-12 rounded-full bg-acrux/10 mx-auto flex items-center justify-center">
          <Clock className="size-6 text-acrux" />
        </div>
        <h1 className="text-xl font-semibold">Aguardando aprovação</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta foi criada e um administrador foi notificado no WhatsApp. Assim que aprovada, você poderá acessar a plataforma.
        </p>
        <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}>
          Sair
        </Button>
      </Card>
    </div>
  );
}
