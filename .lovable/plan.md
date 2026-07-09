
## Objetivo

Transformar o painel atual (hoje exclusivo da Acrux ROBOCEP) em um sistema **multi-tenant**, onde cada equipe cria seu próprio "workspace" (painel isolado) com áreas, membros, tarefas, conteúdo e ponto próprios. A Acrux vira apenas o primeiro workspace.

## Conceito

Novo nível no topo da hierarquia: **Organization** (equipe/tenant).

```
Organization (equipe)
 └── Areas
      └── Projects
           └── Tasks
     Members (via organization_members)
     Time entries, Content posts, Invites → todos vinculados à organization
```

Um usuário pode pertencer a várias organizations e alterna entre elas por um seletor no topo do sidebar.

## Modelo de dados (mudanças)

Nova tabela `organizations`:
- `id`, `name`, `slug` (único, usado em URLs), `logo_url`, `brand_name` (ex.: "Acrux ROBOCEP" para papel timbrado do PDF), `created_by`, `created_at`.

Nova tabela `organization_members`:
- `organization_id`, `user_id`, `role` (`owner` | `admin` | `member`), `created_at`. PK composta.
- Substitui o conceito global de "admin". `is_admin` passa a ser "admin **dentro** da organization".

Colunas `organization_id` (NOT NULL, FK, ON DELETE CASCADE) em:
`areas`, `projects`, `tasks`, `content_posts`, `time_entries`, `invites`, `user_roles` (opcional — pode ser deprecada em favor de `organization_members`).

Índices em todos os `organization_id`.

### Funções SECURITY DEFINER novas
- `current_org_id()` — lê o header/claim/RPC-param da organization ativa (via `set_config` por request, ver abaixo).
- `is_org_member(_user, _org)`, `is_org_admin(_user, _org)`, `is_org_owner(_user, _org)`.
- Reescrita de `has_role`, `is_admin`, `admin_list_members`, `is_area_member` para receber/derivar `organization_id`.

### RLS
Toda policy passa a exigir `organization_id = current_org_id()` **e** `is_org_member(auth.uid(), organization_id)`. Grants seguem o padrão (`authenticated`, `service_role`).

### Migração de dados
Migração cria uma organization "Acrux ROBOCEP" e faz backfill de `organization_id` em todas as linhas existentes; owner = admin atual.

## Seleção da organization ativa

Client mantém `active_org_id` em `localStorage` + React context (`useActiveOrg`).
Toda chamada Supabase inclui `x-org-id` via header custom no fetch do client (já existe `createSupabaseFetch` — só estender). Um middleware SQL `set_config('app.current_org', ...)` roda por request; `current_org_id()` lê daí.

Server functions (`createServerFn`) recebem `organization_id` no `inputValidator` e checam `is_org_member` no handler antes de qualquer operação.

## UI

### Novo
- **Seletor de organization** no topo do `AppSidebar` (dropdown com logo, nome, "Criar nova equipe", "Configurações da equipe").
- **Rota `/onboarding`**: após signup sem organization, usuário escolhe **Criar equipe** (vira owner) ou **Entrar por convite**.
- **Rota `/org/settings`** (só owner/admin): nome, slug, logo, brand name para PDF, membros da equipe, papéis.
- **Rota `/org/new`**: formulário de criação.

### Ajustado
- `AppSidebar`: filtra áreas pela org ativa; label da app troca de "Acrux ROBOCEP" para `organization.brand_name`.
- `Members` e `Invites`: escopo da org ativa. Papel "admin" vira "admin da equipe".
- `ponto.tsx` (PDF): cabeçalho usa `organization.brand_name` e `logo_url` em vez de "Acrux ROBOCEP" hard-coded.
- `__root.tsx` head: título/descrição genéricos ("Painel da Equipe — powered by Lovable") ou dinâmicos por org quando dentro do app.
- Convite por email já carrega `organization_id`; `handle_new_user` associa automaticamente à org do convite.

## Fluxo de novo cliente

1. Usuário cria conta → `/onboarding`.
2. "Criar equipe" → preenche nome/slug → vira `owner` de uma nova organization vazia.
3. Cria áreas, convida membros, começa a usar.
4. Cada equipe vê **apenas** seus próprios dados.

## Arquivos afetados

**Novos**
- `supabase/migrations/<ts>_multi_tenant.sql` (tabelas, RLS, backfill, funções).
- `src/contexts/active-org.tsx` (context + hook).
- `src/routes/_authenticated/onboarding.tsx`.
- `src/routes/_authenticated/org.new.tsx`.
- `src/routes/_authenticated/org.settings.tsx`.
- `src/components/OrgSwitcher.tsx`.
- `src/lib/organizations.functions.ts` (create/update/list/switch).

**Editados**
- `src/integrations/supabase/client.ts` — injetar header `x-org-id` (é auto-gerado; alternativa: envolver client num wrapper próprio em `src/lib/`).
- `src/components/AppSidebar.tsx` — OrgSwitcher, filtro por org, brand dinâmica.
- `src/hooks/use-is-admin.ts` → `use-is-org-admin.ts` (recebe org).
- `src/lib/admin.functions.ts` — todas as funções escopadas por org.
- `src/routes/_authenticated/{members,invites,area.$slug.*,ponto,social.content,dashboard}.tsx` — escopar por org ativa; redirect para `/onboarding` se usuário não tem org.
- `src/routes/__root.tsx` — meta tags genéricas.

## Não incluso nesta fase

- Billing por organization (cada equipe assinando separado) — precisa Stripe/Paddle multi-tenant, fica para depois.
- Domínios customizados por equipe.
- Convites cross-org (usuário já pode estar em várias, mas UI de gestão inicial é mínima).

## Riscos / pontos de atenção

- **Migração destrutiva de RLS**: qualquer erro derruba o acesso a dados existentes. Migração roda em transação; backfill antes de aplicar novas policies.
- **`src/integrations/supabase/client.ts` é auto-gerado** — não pode ser editado. Solução: criar wrapper `src/lib/supabase-org.ts` que usa `.headers({ 'x-org-id': ... })` por chamada, ou usar RPC helper que seta `app.current_org` por sessão.
- Convites existentes precisam de `organization_id` retroativo (todos vão para Acrux).
- Papel global `admin` (você) permanece como super-admin da plataforma? Confirmar (ver pergunta abaixo).

## Perguntas antes de implementar

1. **Super-admin de plataforma**: você quer manter um papel global (só você) que enxerga todas as organizations — para suporte —, ou remover completamente e ficar só com admins por organization?
2. **Signup aberto**: qualquer pessoa com email pode criar uma nova equipe/organization, ou só quem tem convite/aprovação sua?
3. **Cobrança**: por enquanto tudo grátis para todas as equipes (você paga o Lovable), ou já quer preparar limite (ex.: máx. N membros no plano free)?
