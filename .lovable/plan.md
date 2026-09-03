# Nova marca, calendário da equipe, notificações e tarefas compartilhadas

## 1. Logo principal

- Subir a imagem enviada (o "A" da Acrux) para o CDN e usá-la como logo padrão do sistema.
- Substituir o ícone atual (chip/Cpu) na tela inicial, no cabeçalho da tela de login e no topo da sidebar.
- Também usar como favicon do site.
- Equipes que subiram logo própria continuam mostrando a logo delas; a nova imagem vira o padrão da plataforma e o fallback.

## 2. Notificação permanente do ponto

Hoje a notificação já existe, mas some ao fechar/recarregar a página.

- Ao iniciar o ponto, pedir permissão e manter uma notificação fixa ("Ponto em andamento") que não pode ser dispensada pelo usuário.
- A notificação é recriada automaticamente sempre que o app abre com um ponto em aberto e se atualiza a cada minuto com o tempo trabalhado.
- Ela só desaparece quando o ponto é encerrado.
- Um botão "Encerrar ponto" na própria notificação leva direto para a tela de ponto.

## 3. Calendário geral da equipe

Nova aba "Calendário" na sidebar, visível para todos os membros da equipe.

- Visão de mês com os quadrados dos dias coloridos conforme o que existe naquela data:
  - cor personalizada do evento (escolhida na criação),
  - destaque automático para prazos de tarefas do Kanban.
- Clicar num dia abre a lista de eventos/prazos daquele dia.
- Criar/editar/excluir evento: título, descrição, data (ou período), hora opcional, área relacionada, cor e responsáveis.
- Notificações de lembrete: aviso no dia do evento e um aviso antecipado (véspera) para eventos e prazos de tarefas, usando o mesmo mecanismo de notificação do ponto.
- Permissões: qualquer membro ativo da equipe vê; criar/editar/excluir fica com quem criou o evento e com admins da equipe.

## 4. Tarefa em duas áreas com dois encarregados

- No diálogo de nova tarefa (e na edição), trocar "área" por seleção múltipla de áreas e "responsável" por seleção múltipla de responsáveis.
- Ao salvar em mais de uma área, a tarefa aparece no Kanban de cada área selecionada, marcada como compartilhada, mostrando os avatares de todos os encarregados.
- Mover o cartão de coluna, renomear, mudar prazo ou excluir reflete em todas as áreas ao mesmo tempo (é a mesma tarefa, não cópias soltas).
- Cartões compartilhados exibem um selo com as áreas envolvidas.

## Detalhes técnicos

- Assets: `lovable-assets create` a partir do upload; pointer em `src/assets/`, mais `public/favicon.ico` real.
- Banco (migração): `calendar_events` (org, título, descrição, datas, cor, área opcional, criador) + `calendar_event_members`; `task_areas` (task_id, area_id) e `task_assignees` (task_id, user_id) para o vínculo múltiplo, com backfill das tarefas atuais a partir de `tasks.area_id` / `tasks.assignee_id`. GRANTs + RLS por organização em todas as tabelas novas; realtime habilitado em `calendar_events`.
- Kanban (`src/components/KanbanBoard.tsx`): consulta passa a filtrar por `task_areas`; seleção múltipla de áreas e responsáveis; mutações escrevem nas tabelas de junção.
- Ponto: service worker ganha ação "encerrar" e a notificação é re-emitida no carregamento do app enquanto houver registro aberto.
- Calendário: nova rota `src/routes/_authenticated/calendario.tsx` + item na `AppSidebar`, com head/SEO próprio.
