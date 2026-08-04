# Dois novos painéis: Perfil e Aprovação de membros

## 1. Painel "Meu perfil" (`/perfil`)

Disponível para qualquer pessoa logada, com link no menu lateral.

- Editar nome e telefone do perfil.
- Alterar e-mail: envia confirmação para o novo endereço (o e-mail só muda depois de confirmado).
- Alterar senha: nova senha + confirmação, com validação mínima de 8 caracteres.
- Foto/iniciais do usuário e a lista de equipes das quais participa (somente leitura).
- Mensagens de sucesso/erro e confirmação antes de salvar mudanças sensíveis.

## 2. Painel "Solicitações" (`/solicitacoes`)

Visível apenas para donos/admins da equipe ativa.

- Toda nova entrada em uma equipe (por link de convite `?org=slug` ou pelo link público) passa a entrar como **pendente** em vez de já virar membro.
- O painel lista as pessoas pendentes daquela equipe: nome, telefone, data do pedido.
- Ações por pessoa: **Aprovar** (vira membro) ou **Recusar** (remove o pedido), com confirmação antes de recusar.
- Contador de pendências no menu lateral para o admin.
- Quem está pendente vê uma tela de espera ("Aguardando aprovação do administrador da equipe") em vez do painel da equipe; segue podendo criar a própria equipe.
- Fundadora/dono da equipe entra sempre aprovada automaticamente.

## Detalhes técnicos

- Migração: adicionar `status` (`pending` | `active`) em `organization_members`, com padrão `pending`; registros existentes viram `active`. Índice por `(organization_id, status)`.
- Ajustar funções do banco: `join_org_by_slug` e o gatilho `handle_new_user` inserem com `pending`; `add_org_creator_as_owner` insere `active`; `is_org_member` / `is_org_admin` / `my_organizations` / `admin_list_members` passam a considerar apenas `active`, preservando o isolamento entre equipes.
- Nova função de banco para listar pendentes da equipe e novas funções de servidor `approveMember` / `rejectMember` (validando que quem chama é admin da equipe).
- Frontend: `src/routes/_authenticated/perfil.tsx`, `src/routes/_authenticated/solicitacoes.tsx`, tela de espera para usuários pendentes em `src/contexts/active-org.tsx`, e novos itens no `AppSidebar`.
- Identidade visual atual (cores da equipe, Orbitron nos títulos, cards de vidro) é mantida.
