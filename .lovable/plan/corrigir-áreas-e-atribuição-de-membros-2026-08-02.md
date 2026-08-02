# Corrigir áreas e atribuição de membros

## O que está acontecendo

Verifiquei o banco: apenas a equipe original "Acrux ROBOCEP" (slug `acrux-robocep`) tem as 8 áreas (Social, Projetos, Marketing, Prêmios, Engenharia, CAD, Montagem, Programação). As equipes criadas depois — inclusive `acrux-robocep-2`, onde estão 4 dos membros — foram criadas **com zero áreas**.

Como não existe nenhuma área nessas equipes:
- a barra lateral não mostra áreas nem Kanban;
- o diálogo "Atribuir área" na página de Membros abre vazio, então a atribuição parece "não funcionar".

O código de atribuição em si está correto (a restrição única `area_id + user_id` existe). O problema é a falta de áreas.

## O que vou fazer

1. **Toda equipe nova nasce com a estrutura padrão de áreas**
   Ao criar uma equipe, o sistema cria automaticamente Social (Projetos, Marketing, Prêmios), Engenharia (CAD, Montagem) e Programação.

2. **Corrigir as equipes já existentes**
   As equipes criadas sem áreas recebem a mesma estrutura padrão, para que os membros atuais voltem a ver o Kanban e possam ser atribuídos.

3. **Gerenciador de áreas para administradores**
   Nova seção em Configurações da equipe onde o admin pode criar, renomear, reordenar e excluir áreas e subáreas — sem depender do padrão fixo.

4. **Melhorar a página de Membros**
   - Mensagem clara quando a equipe ainda não tem áreas, com atalho para criá-las.
   - Atualização imediata da lista após atribuir/remover área ou marcar líder.

## Detalhes técnicos

- Migração: função `seed_default_areas(_org uuid)` + gatilho `AFTER INSERT ON organizations` que a chama; execução única de backfill para orgs com `count(areas) = 0`.
- `src/routes/_authenticated/org.settings.tsx`: novo componente `AreasManager` usando as políticas RLS já existentes (`areas write by org admin`).
- `src/routes/_authenticated/members.tsx`: estado vazio + invalidação de `["areas", activeOrgId]` junto com `["admin-members"]`.
- Nenhuma mudança na identidade visual.
