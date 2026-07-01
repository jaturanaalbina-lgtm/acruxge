import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Cpu } from "lucide-react";
import { lovable } from "@/integrations/lovable";


async function handleGoogle() {
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: window.location.origin,
  });
  if (result.error) toast.error(result.error.message ?? "Falha ao entrar com Google");
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ invite: typeof s.invite === "string" ? s.invite : undefined }),
  component: AuthPage,
});

type InviteInfo = { email: string; area_name: string | null; is_leader: boolean; used_at: string | null; expires_at: string };

function AuthPage() {
  const navigate = useNavigate();
  const { invite: inviteToken } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [tab, setTab] = useState<"signin" | "signup">(inviteToken ? "signup" : "signin");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  useEffect(() => {
    if (!inviteToken) return;
    (async () => {
      const { data, error } = await supabase.rpc("get_invite_by_token", { _token: inviteToken });
      if (error || !data || data.length === 0) {
        toast.error("Convite inválido ou não encontrado");
        return;
      }
      const row = data[0] as InviteInfo;
      if (row.used_at) { toast.error("Este convite já foi utilizado"); return; }
      if (new Date(row.expires_at).getTime() < Date.now()) { toast.error("Convite expirado"); return; }
      setInviteInfo(row);
      setEmail(row.email);
      setTab("signup");
    })();
  }, [inviteToken]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo(a) de volta!");
    navigate({ to: "/dashboard" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (!inviteInfo) {
      // Fire-and-forget admin notification via WhatsApp
      notifyAdminOfSignup({ data: { email, fullName } }).catch(() => {});
      toast.success("Conta criada! Aguarde a aprovação do administrador.");
    } else {
      toast.success("Conta criada. Você já pode entrar.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--acrux-glow)_25%,transparent),transparent_60%)]" />
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="size-10 rounded-lg bg-gradient-to-br from-acrux to-acrux-glow flex items-center justify-center shadow-lg shadow-acrux/40">
            <Cpu className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Acrux ROBOCEP</h1>
            <p className="text-xs text-muted-foreground">Gestão interna da equipe</p>
          </div>
        </div>
        <Card className="glass-panel p-6">
          {inviteInfo && (
            <div className="mb-4 rounded-md border border-acrux/40 bg-acrux/5 p-3 text-xs">
              <div className="font-medium text-foreground">Você foi convidado(a)</div>
              <div className="text-muted-foreground mt-0.5">
                Área: <span className="text-foreground">{inviteInfo.area_name ?? "—"}</span>
                {inviteInfo.is_leader && <span className="ml-2">· papel de líder</span>}
              </div>
            </div>
          )}
          <Button type="button" variant="outline" className="w-full mb-4" onClick={handleGoogle}>
            <svg className="size-4 mr-2" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12S6.8 21.5 12 21.5c6.9 0 9.5-4.8 9.5-7.3 0-.5 0-.9-.1-1.3H12z"/></svg>
            Continuar com Google
          </Button>
          <div className="relative mb-4"><div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div><div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">ou com email</span></div></div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="mt-4">
              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" disabled={loading} className="w-full">Entrar</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup" className="mt-4">
              <form onSubmit={handleSignUp} className="space-y-3">
                <div>
                  <Label>Nome completo</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required readOnly={Boolean(inviteInfo)} />

                </div>
                <div>
                  <Label>Senha</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
                </div>
                <Button type="submit" disabled={loading} className="w-full">Criar conta</Button>
                <p className="text-xs text-muted-foreground">A primeira conta criada deve ser promovida a administradora pelo banco para liberar gestão completa.</p>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
