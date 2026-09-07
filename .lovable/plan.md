# Painel de equipes, Kanban mais simples e ponto com tarefas

## O que está acontecendo hoje

Existem 4 equipes na sua conta:

| Equipe | Link | Membros ativos | Tarefas |
| --- | --- | --- | --- |
| Acrux ROBOCEP | acrux-robocep | 1 | 2 |
| Sirius ROBOCEP | sirius-robocep | 1 | 0 |
| Acrux ROBOCEP | acrux-robocep-2 | 6 | 52 |
| Helena | helena | 1 | 0 |

Duas se chamam "Acrux ROBOCEP". A confusão de "área não encontrada" aparece quando a equipe aberta na tela não é a que tem as tarefas: cada equipe tem as suas próprias áreas, então o mesmo endereço de área muda de conteúdo conforme a equipe ativa. O nome repetido é o que torna isso invisível para você.

## 1. Painel de equipes (novo)

Nova página "Minhas equipes", acessível pelo seletor de equipe:

- Lista todas as equipes de que você participa, com nome, link, quantidade de membros, tarefas, eventos e pontos registrados, e a data de criação.
- Marca visualmente equipes com nome repetido.
- Botão "Renomear" para diferenciar equipes homônimas.
- Botão "Excluir equipe" (só para quem é dono), com confirmação digitando o nome da equipe e aviso de quantos dados serão apagados junto.
- Depois de excluir, a tela troca automaticamente para outra equipe.

Nada é excluído sem essa confirmação.

## 2. Tirar a aba "Projetos" do Kanban

Na página de cada área, a página passa a mostrar apenas o quadro de tarefas, sem as abas. Os projetos continuam existindo no banco e as páginas de projeto seguem funcionando por link direto — só saem da navegação da área.

## 3. Botão de reset de progresso

No quadro de tarefas, um botão "Resetar progresso" (só para administradores da equipe):

- Confirmação antes de aplicar.
- Devolve todas as tarefas da área/quadro atual para a coluna "A fazer" e zera o percentual de progresso.
- Mantém título, responsáveis, prazos e etiquetas.
- Opção de escolher entre "somente esta área" ou "todas as áreas da equipe".

## 4. Ponto com as tarefas da pessoa no papel timbrado

No PDF do relatório de ponto, depois da tabela de horas, entram duas seções novas:

- "Tarefas concluídas no período": título, área e data de conclusão.
- "Tarefas atribuídas em aberto": título, área, coluna atual e prazo.

Consideram as tarefas em que a pessoa é responsável principal ou co-responsável, dentro do intervalo de datas escolhido no relatório. Vale tanto para o PDF individual quanto para o dos administradores em "Pontos da equipe".

## Detalhes técnicos

- Nova rota `src/routes/_authenticated/org.hub.tsx` + link no `OrgSwitcher`; contagens via uma função de banco `org_overview()` retornando métricas por organização do usuário.
- Exclusão via função `delete_organization(_org uuid)` com `security definer`, restrita a `is_org_owner`, apagando em cascata dados dependentes; migração adiciona a função (sem remover tabelas).
- `area.$slug.index.tsx`: remove `Tabs`, renderiza `KanbanBoard` direto.
- `KanbanBoard.tsx`: ação `resetProgress` (update `status='todo'`, `progress=0`, `position` recalculado) com `is_org_admin` checado na UI e RLS já existente.
- `ponto.tsx` / `pontos.tsx`: consulta de `tasks` + `task_assignees` + `areas` no intervalo, renderizada com `autoTable` adicional antes do bloco de assinaturas.
