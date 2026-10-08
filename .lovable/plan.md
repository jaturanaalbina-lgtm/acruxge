# Tarefas distribuídas + relatórios individuais no ponto

## 1. Nova aba "Minhas tarefas" (todos os integrantes)
- Item novo no menu lateral, em "Geral".
- Lista todas as tarefas atribuídas à pessoa logada na equipe ativa, de todas as áreas.
- Contadores no topo: Total, Feitas, Fazendo, A fazer, Atrasadas.
- Filtros: situação, área e período; busca pelo título.
- Cada tarefa mostra título, área, situação, prazo (em vermelho se atrasada) e leva ao quadro da área ao clicar.
- Atualiza sozinha quando alguém muda uma tarefa.

## 2. Nova aba "Tarefas da equipe" (só admins)
- Item no menu, junto de "Pontos da equipe".
- Filtros: período, membro (ou todos) e área.
- Resumo por membro: total atribuído, concluídas, em andamento, não feitas (a fazer) e atrasadas.
- Lista detalhada das tarefas abaixo do resumo.
- Exportação em PDF no papel timbrado (mesmo modelo e margens do ponto):
  - **Equipe inteira**: tabela-resumo por membro + seções "Concluídas", "Em andamento" e "Não feitas".
  - **Individual**: botão em cada membro (e no filtro de membro) gerando a folha só daquela pessoa.
  - **Todos individuais**: um PDF com uma folha por integrante.
- Também exporta CSV.

## 3. Pontos da equipe: relatórios individuais
- Na página "Pontos da equipe" já existente, cada cartão de "Horas por membro" ganha o botão "PDF individual".
- Novo botão "PDF individual de todos": um único PDF com uma folha por integrante (cada folha começa em página nova, com nome, período, total de horas, registros e as tarefas da pessoa).
- O PDF geral da equipe continua como está.

## Detalhes técnicos
- Rotas novas: `src/routes/_authenticated/minhas-tarefas.tsx` e `src/routes/_authenticated/tarefas-equipe.tsx` (esta com checagem `isAdmin`), links no `AppSidebar`, `head()` próprio em cada uma.
- Dados via `fetchAssignedTasks` de `src/lib/report-tasks.ts` (responsável principal + `task_assignees`), estendido com `created_at` e agrupamento por status: done = concluída, in_progress/review/approval = realizando, backlog/todo = não feita. Filtro de período por prazo/atualização.
- Módulo compartilhado `src/lib/letterhead-pdf.ts` com cabeçalho/margens do papel timbrado reutilizado por ponto, pontos e tarefas; `drawTaskSections` ampliado para três seções.
- `pontos.tsx`: função `exportMemberPDF(userId)` e `exportAllIndividualPDF()` usando `doc.addPage()` por membro.
- Sem mudanças no banco: RLS atual já permite leitura das tarefas da equipe.
