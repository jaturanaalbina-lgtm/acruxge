# GE by Acrux ROBOCEP — rebrand, Kanban enxuto e painel de pontos

## 1. Renomear "Painel de Equipe" para "GE by Acrux ROBOCEP"

Substituir em todos os pontos visíveis:
- Landing pública (cabeçalho, rodapé, título e metadados SEO)
- Tela de login/cadastro (quando não há equipe com marca própria)
- Cabeçalho interno ("· Gestão da Equipe" vira "GE by Acrux ROBOCEP")
- Prévia da marca nas configurações da equipe
- Metadados do site (título e descrição)

Onde a equipe tiver marca própria (logo/nome), a marca dela continua vindo primeiro — GE aparece como assinatura da plataforma.

## 2. Tipografia de destaque

Mokoto é comercial, então uso **Orbitron** (Google Fonts, estética tech/robótica) apenas onde harmoniza:
- Logotipo "GE by Acrux ROBOCEP"
- Títulos grandes da landing e slogan
- Números das estatísticas do dashboard e cronômetro do ponto

Texto corrido e interface continuam com a fonte atual, para não perder legibilidade.

## 3. Mais vida na primeira tela (landing)

Sem mudar a identidade visual:
- Cartões de recurso com elevação, borda que acende na cor primária e leve movimento no hover
- Botões com brilho/escala sutil no hover
- Links do topo com sublinhado animado
- Aparição suave dos blocos ao carregar
- Todas as animações respeitam "reduzir movimento" do sistema

## 4. Kanban com 3 colunas

Exibir apenas **A Fazer**, **Fazendo** e **Feito**. Conforme escolhido, o banco não muda: as colunas Backlog, Em Revisão e Aguardando Aprovação deixam de aparecer, e tarefas antigas nesses status ficam ocultas até serem movidas. Novas tarefas nascem em "A Fazer".

## 5. Excluir tarefa no Kanban

Cada cartão ganha um botão de excluir (aparece ao passar o mouse), com diálogo de confirmação antes de apagar. Segue a regra atual do banco: apagam quem criou a tarefa ou administradores; se não houver permissão, mostro aviso claro.

## 6. Aba de Pontos para administradores

Nova página "Pontos da equipe", visível só para administradores:
- Lista de todos os registros de ponto da equipe ativa (membro, data, entrada, saída, duração, relatório do dia)
- Filtros por membro e por período
- Totais de horas por membro no período
- Exportação em CSV e PDF (mesmo layout timbrado já usado no Ponto)
- Link na barra lateral dentro do bloco de administração

## Detalhes técnicos

- Fonte carregada via `<link>` no `__root.tsx` e exposta como `--font-display` em `src/styles.css` (utilitário `font-display`).
- Kanban: reduzir `COLUMNS` em `src/components/KanbanBoard.tsx` para `todo | in_progress | done`; status padrão de criação passa a `todo`. Enum `task_status` no banco permanece intacto.
- Exclusão: `supabase.from("tasks").delete()` + `AlertDialog`, com atualização otimista e invalidação da query já existente (realtime continua funcionando).
- Nova rota `src/routes/_authenticated/pontos.tsx` com `beforeLoad` de admin (mesmo padrão de `members.tsx`), consultando `time_entries` filtrado por `organization_id` — o RLS atual já permite leitura de todos os registros pelo admin da organização. Nomes dos membros via `list_directory`.
- Sem migração de banco.
