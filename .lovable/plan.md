# Calendário de posts, PDF de tarefas e PDF de pontos

## 1. Editar o calendário de posts
Hoje o planejamento só deixa ver/editar quem está cadastrado na área Social (ou é admin). Como a atribuição de áreas foi retirada, quase ninguém está nessa lista, por isso a edição falha.
- Liberar ver, criar, editar e excluir posts para qualquer membro ativo da equipe.
- A lista de posts passa a filtrar pela equipe ativa (hoje não filtra).
- Mostrar o erro na tela quando uma alteração falhar, em vez de silenciar.

## 2. PDF de tarefas concluídas
- Por padrão, a coluna "Concluída em" sai do PDF.
- Na tela "Tarefas da equipe", nova opção "Incluir data de conclusão" (desligada por padrão).
- Quando ligada, cada tarefa concluída mostra a data num campo editável na prévia antes de exportar; o valor editado vai só para o PDF (não muda a tarefa).

## 3. Pontos sem marca de edição
- Remover o "· ajustado" das listas de "Meu ponto" e "Pontos da equipe".
- Confirmar que PDF e CSV (geral, individual e todos individuais) não trazem nenhuma marca de ajuste.

## Detalhes técnicos
- Migração: recriar as 4 políticas de `content_posts` usando apenas `is_org_member(auth.uid(), organization_id)`.
- `social.content.tsx`: `.eq("organization_id", activeOrgId)` na consulta; `onError` com toast em update/delete.
- `tasks-pdf.ts` / `report-tasks.ts`: parâmetro `showDoneDate` e mapa `doneDates: Record<taskId,string>`; sem a coluna quando desligado.
- `tarefas-equipe.tsx`: switch + inputs `date` por tarefa concluída.
- `ponto.tsx:476`, `pontos.tsx:323`: remover o sufixo.
