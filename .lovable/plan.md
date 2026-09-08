# Arrumar o quadro de tarefas (Kanban)

Foco só no quadro, já que as equipes duplicadas foram apagadas.

## O que será feito

1. **Corrigir o erro que trava o site**
   Sobrou um erro de código na página "Todas as equipes" que impede o projeto de compilar. Corrigir essa linha para tudo voltar a abrir normalmente.

2. **Acabar com o aviso "Área não encontrada"**
   Hoje a página decide que a área não existe antes de a equipe terminar de carregar. Passará a esperar o carregamento e, se realmente não houver a área naquela equipe, mostrar uma mensagem clara com botão para voltar ao painel.

3. **Recarregar ao trocar de equipe**
   Ao mudar de equipe, o quadro recarrega as áreas e tarefas daquela equipe em vez de manter as anteriores em tela.

4. **Ícone padrão das áreas**
   Trocar a pasta genérica por um ícone coerente com o quadro, para não parecer erro.

5. **Tirar a aba "Projetos" de dentro das áreas**
   A área abre direto no quadro de tarefas, sem a aba extra.

## Detalhes técnicos

- `src/routes/_authenticated/org.hub.tsx`: remover o `.then` sobre retorno `void` na exclusão (usar `await` + invalidação).
- `src/routes/_authenticated/area.$slug.index.tsx`: tratar `activeOrgId` nulo/carregando como estado de carregamento; incluir `activeOrgId` na chave da query (já presente) e remover o `Tabs`/`ProjectsList`, renderizando `KanbanBoard` direto.
- `src/components/AppSidebar.tsx`: ajustar o ícone padrão de área.
- Verificação com `bunx tsgo --noEmit`.
