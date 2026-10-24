# Corrigir atribuição de responsável nos cartões do quadro

## O problema
O banco aceita a troca de responsável normalmente (as permissões estão corretas). O defeito está no cartão: quando você abre a lista "Responsável" e clica num nome, o clique é capturado pelo sistema de arrastar do cartão. O cartão "rouba" o clique e a escolha nunca é registrada. O mesmo pode acontecer na janela de confirmação de exclusão.

## A correção
- O arrastar só começa quando o clique acontece de fato dentro do cartão — cliques na lista de nomes ou em janelas abertas a partir do cartão passam a ser ignorados pelo arrastar.
- Ao escolher um nome, o cartão atualiza na hora e aparece a confirmação "Responsável atualizado".
- Conferir no navegador: criar tarefa, trocar o responsável duas vezes e remover, e arrastar o cartão continua funcionando.

## Detalhes técnicos
- `src/components/KanbanBoard.tsx`, `startDrag`: retornar cedo se `!(e.currentTarget as HTMLElement).contains(e.target as Node)` (eventos de portal do Radix borbulham pela árvore React) e incluir `[role='option'],[role='listbox'],[role='dialog']` na lista de exclusão.
- Mesma checagem em `moveDrag`/`endDrag` para não reagir a eventos de portal.
- Toast de sucesso no `patchTask` quando o patch muda `assignee_id`.
