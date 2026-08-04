import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveOrg } from "@/contexts/active-org";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { UserCog, Mail, KeyRound, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/perfil")({
  ssr: false,
  component: PerfilPage,
  head: () => ({
    meta: [
      { title: "Meu perfil | GE by Acrux ROBOCEP" },
      { name: "description", content: "Edite seu nome, telefone, e-mail e senha na plataforma GE by Acrux ROBOCEP." },
      { property: "og:title", content: "Meu perfil | GE by Acrux ROBOCEP" },
      { property: "og:description", content: "Gerencie seus dados de acesso e informações pessoais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PerfilPage() {
  const qc = useQueryClient();
  const { orgs } = useActiveOrg();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const { data: me } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) throw new Error("Sessão expirada");
      const { data: profile } = await supabase
        .from("profiles").select("*").eq("id", user.id).maybeSingle();
      return { email: user.email ?? "", profile };
    },
  });

  useEffect(() => {
    if (!me) return;
    setEmail(me.email);
    setFullName(me.profile?.full_name ?? "");
    setPhone(me.profile?.phone ?? "");
  }, [me]);

  const initials = (fullName || me?.email || "?").slice(0, 2).toUpperCase();

  const saveProfile = async () => {
    if (fullName.trim().length < 2) return toast.error("Informe seu nome completo.");
    setSavingProfile(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), phone: phone.trim() || null })
      .eq("id", auth.user!.id);
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil atualizado");
    qc.invalidateQueries({ queryKey: ["me-profile"] });
    qc.invalidateQueries({ queryKey: ["admin-members"] });
  };

  const saveEmail = async () => {
    const next = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(next)) return toast.error("E-mail inválido.");
    if (next === me?.email) return toast.info("Este já é o seu e-mail atual.");
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser(
      { email: next },
      { emailRedirectTo: `${window.location.origin}/perfil` },
    );
    setSavingEmail(false);
    if (error) return toast.error(error.message);
    toast.success("Enviamos um link de confirmação para o novo e-mail.");
  };

  const savePassword = async () => {
    if (pwd.length < 8) return toast.error("A senha precisa ter ao menos 8 caracteres.");
    if (pwd !== pwd2) return toast.error("As senhas não coincidem.");
    setSavingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setSavingPwd(false);
    if (error) return toast.error(error.message);
    setPwd(""); setPwd2("");
    toast.success("Senha alterada com sucesso");
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg bg-gradient-to-br from-acrux to-acrux-glow flex items-center justify-center">
          <UserCog className="size-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold font-display">Meu perfil</h1>
          <p className="text-sm text-muted-foreground">Atualize seus dados e credenciais de acesso.</p>
        </div>
      </div>

      <Card className="glass-panel p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            {me?.profile?.avatar_url
              ? <img src={me.profile.avatar_url} alt="Sua foto de perfil" className="size-full object-cover" />
              : <span className="text-sm font-medium">{initials}</span>}
          </div>
          <div className="flex flex-wrap gap-1">
            {orgs.map((o) => (
              <Badge key={o.id} variant="outline">
                {o.brand_name || o.name}{o.role !== "member" ? ` · ${o.role === "owner" ? "Dono" : "Admin"}` : ""}
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="nome">Nome completo</Label>
            <Input id="nome" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} />
          </div>
          <div>
            <Label htmlFor="tel">Telefone</Label>
            <Input id="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="(41) 90000-0000" />
          </div>
        </div>
        <Button onClick={saveProfile} disabled={savingProfile}>
          <Save className="size-4 mr-1" /> Salvar dados
        </Button>
      </Card>

      <Card className="glass-panel p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Mail className="size-4" /> E-mail de acesso</div>
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
          <p className="text-xs text-muted-foreground mt-1">
            Você receberá um link de confirmação no novo endereço. O e-mail só muda depois de confirmado.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={savingEmail}>Alterar e-mail</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterar e-mail de acesso?</AlertDialogTitle>
              <AlertDialogDescription>
                Enviaremos um link de confirmação para {email}. Até confirmar, continue entrando com o e-mail atual.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={saveEmail}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>

      <Card className="glass-panel p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4" /> Senha</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="pwd">Nova senha</Label>
            <Input id="pwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="pwd2">Confirmar nova senha</Label>
            <Input id="pwd2" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={savingPwd || !pwd || !pwd2}>Alterar senha</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alterar sua senha?</AlertDialogTitle>
              <AlertDialogDescription>
                Você continuará conectado neste dispositivo, mas precisará da nova senha nos próximos acessos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={savePassword}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </div>
  );
}
