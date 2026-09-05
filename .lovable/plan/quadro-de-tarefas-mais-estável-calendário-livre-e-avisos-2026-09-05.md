# Quadro de tarefas mais estável, calendário livre e avisos

## 1. Arrumar as áreas e o quadro de tarefas

O que muda para você:

- Ao abrir uma área, a página deixa de ficar "meio carregada": enquanto os dados chegam aparece um esqueleto de carregamento, e se algo falhar aparece uma mensagem com botão "Tentar de novo" em vez de tela vazia ou ícone quebrado.
- Nenhuma tarefa fica escondida. Hoje existem 3 tarefas guardadas em situações antigas (2 em "backlog" e 1 em "aguardando aprovação") que não aparecem em nenhuma das três colunas. Elas passam a aparecer em "A Fazer" (backlog) e "Fazendo" (aprovação), e nada mais fica invisível no futuro.
- Arrastar fica mais confiável: o cartão inteiro pode ser arrastado (não só a alcinha), com um pequeno limiar para não confundir com clique, e o cartão pode ser solto em qualquer ponto da coluna.
- A ordem dos cartões dentro da coluna passa a ser salva, então ela se mantém para todo mundo.
- As atualizações em tempo real passam a valer também para tarefas compartilhadas entre áreas, e a lista deixa de recarregar sozinha a toda hora.

Antes de escrever o código, vou abrir a área no navegador e reproduzir esse "ícone de pasta" que você viu, para confirmar exatamente onde aparece — a causa ainda não está confirmada.

## 2. Mais liberdade no calendário

- Arrastar um evento de um dia para outro no calendário (mantendo a duração), com atualização imediata na tela.
- Botão de excluir direto no evento, na lista do dia, com confirmação — sem precisar abrir a edição.
- Duplicar um evento para outra data.
- Quem pode mover/excluir continua sendo quem criou o evento e os administradores, como você escolheu. Para os demais, os botões nem aparecem.

## 3. Avisos de eventos, prazos e tarefas

- Um sino no topo do app com a lista de avisos e um contador de não lidos.
- Aviso quando uma tarefa é atribuída a você (criação ou mudança de responsável), inclusive corresponsáveis.
- Lembretes de evento: na véspera, no dia e 1 hora antes do horário marcado.
- Lembretes de prazo de tarefa: na véspera e no dia, para as tarefas das quais você é responsável.
- Cada aviso também vira uma notificação do navegador (a permissão é pedida uma vez), aproveitando o mesmo mecanismo já usado pelo ponto.
- Clicar no aviso leva direto à tarefa ou ao dia do evento.

## Detalhes técnicos

- Nova tabela `notifications` (id, organization_id, user_id, type, title, body, link, entity_id, read_at, created_at) com RLS: cada pessoa lê e marca como lida apenas as próprias; inserção permitida a membros ativos da organização; GRANTs para `authenticated` e `service_role`; tabela publicada no Realtime.
- Gatilhos no banco para gerar avisos de atribuição: `AFTER INSERT/UPDATE OF assignee_id ON tasks` e `AFTER INSERT ON task_assignees`, ignorando auto-atribuição.
- Coluna `position` já existe em `tasks`; passa a ser gravada no drag & drop e usada na ordenação (`order("position").order("created_at")`).
- `src/components/KanbanBoard.tsx`: mapa de status → coluna (backlog→todo, review/approval→in_progress) para que nenhuma tarefa suma; chaves de query incluindo `activeOrgId`; `task-assignees` com chave estável; Realtime também por `task_areas`; drag no cartão inteiro com limiar de 5px e reordenação dentro da coluna.
- `src/routes/_authenticated/area.$slug.index.tsx`: skeleton de carregamento, `errorComponent` na rota e estado de erro com "Tentar de novo".
- `src/routes/_authenticated/calendario.tsx`: drag de eventos entre células do mês (Pointer Events, mesmo padrão do Kanban), update otimista de `start_date`/`end_date`, exclusão inline e duplicar.
- `src/lib/notifications.ts` + `src/components/NotificationBell.tsx`: consulta com React Query, assinatura Realtime, marcar como lida/todas lidas e disparo da notificação do navegador via `showReminderNotification` já existente; agendamento de lembretes de véspera/dia/1h no cliente com deduplicação em `localStorage`.
