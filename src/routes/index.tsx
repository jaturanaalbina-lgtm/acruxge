import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cpu, KanbanSquare, Clock, CalendarDays, ShieldCheck, Palette, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GE by Acrux ROBOCEP · Gestão de Equipe para robótica" },
      {
        name: "description",
        content:
          "GE by Acrux ROBOCEP: Kanban por área, controle de ponto com relatório em PDF, planejamento de conteúdo e administração de membros da sua equipe.",
      },
      { property: "og:title", content: "GE by Acrux ROBOCEP · Gestão de Equipe para robótica" },
      {
        property: "og:description",
        content:
          "Kanban colaborativo em tempo real, ponto com relatório, planejamento de conteúdo e gestão de membros — com a marca da sua equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  { icon: KanbanSquare, title: "Kanban por área", desc: "A fazer, fazendo e feito, com prazos, prioridades e sincronização em tempo real." },
  { icon: Clock, title: "Ponto e relatórios", desc: "Cronômetro, relatório obrigatório do dia e exportação em PDF para papel timbrado." },
  { icon: CalendarDays, title: "Planejamento de conteúdo", desc: "Planilha de posts com data, tipo, comunidade, responsável e status." },
  { icon: ShieldCheck, title: "Permissões por cargo", desc: "Donos e admins controlam membros, projetos e configurações da equipe." },
  { icon: Palette, title: "Marca da equipe", desc: "Escolha o logo e as cores principais — o painel inteiro se adapta." },
  { icon: Cpu, title: "Multi-equipe", desc: "Cada equipe tem seu próprio painel, membros e dados totalmente isolados." },
];


function LandingPage() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let alive = true;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase.auth.getSession().then(({ data }) => {
        if (alive) setSignedIn(Boolean(data.session));
      });
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--acrux-glow)_22%,transparent),transparent_60%)]" />

      <header className="max-w-5xl mx-auto flex items-center justify-between px-5 py-5 animate-rise">
        <div className="group flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-gradient-to-br from-acrux to-acrux-glow flex items-center justify-center shadow-lg shadow-acrux/40 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
            <Cpu className="size-4.5 text-white" />
          </div>
          <span className="font-display font-semibold tracking-tight text-sm sm:text-base">
            GE <span className="text-muted-foreground font-sans font-normal">by</span> Acrux ROBOCEP
          </span>
        </div>
        <Button asChild variant="ghost" size="sm" className="relative transition-colors hover:text-acrux-glow">
          {signedIn ? <Link to="/dashboard">Ir para o painel</Link> : <Link to="/auth">Entrar</Link>}
        </Button>
      </header>

      <main className="max-w-5xl mx-auto px-5 pb-20">
        <section className="pt-10 pb-14 text-center space-y-5 animate-rise">
          <h1 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">
            GE — Gestão de Equipe
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
            Organize projetos, tarefas, membros, ponto e conteúdo em um só lugar. Crie a sua equipe em menos de um
            minuto, escolha o logo e as cores, e compartilhe o link de entrada com o time.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button
              asChild
              size="lg"
              className="group transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-acrux/40"
            >
              <Link to="/org/new">
                Criar minha equipe
                <ArrowRight className="size-4 ml-1 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="transition-all duration-300 hover:-translate-y-0.5 hover:border-acrux hover:text-acrux-glow"
            >
              {signedIn ? <Link to="/dashboard">Ir para o painel</Link> : <Link to="/auth">Entrar</Link>}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            Já faz parte de uma equipe? Peça o link de entrada para o criador ou um administrador.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Card
              key={f.title}
              style={{ animationDelay: `${80 * i}ms` }}
              className="group p-5 space-y-2 animate-rise hover-lift hover:hover-lift-on"
            >
              <div className="size-9 rounded-lg bg-acrux/15 flex items-center justify-center transition-all duration-300 group-hover:bg-acrux/30 group-hover:scale-110">
                <f.icon className="size-4.5 text-acrux-glow" />
              </div>
              <h2 className="font-display text-sm font-semibold">{f.title}</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
            </Card>
          ))}
        </section>

        <section className="mt-14">
          <Card className="p-7 text-center space-y-4 animate-rise hover-lift hover:hover-lift-on">
            <h2 className="font-display text-xl font-semibold">Pronto para começar?</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Crie o painel da sua equipe, personalize a marca e convide todo mundo com um único link.
            </p>
            <Button
              asChild
              size="lg"
              className="transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-acrux/40"
            >
              <Link to="/org/new">Criar minha equipe</Link>
            </Button>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        <span className="font-display">GE by Acrux ROBOCEP</span> · gestão interna para equipes de robótica
      </footer>
    </div>
  );
}

