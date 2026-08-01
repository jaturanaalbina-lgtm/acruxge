# Tela inicial pública + criação de equipe com marca

## O que muda para o usuário

1. **Nova tela inicial pública (`/`)**
   - Hoje `/` só redireciona para login ou dashboard. Passa a ser uma landing page real, no mesmo visual escuro atual.
   - Conteúdo: apresentação curta da plataforma (Kanban por área, ponto com relatório em PDF, planejamento de conteúdo, painel de admin), botão principal **"Criar minha equipe"** e botão secundário **"Entrar"**.
   - Quem já está logado vê "Ir para o painel" em vez de "Entrar".

2. **Login vira o link de convite da equipe**
   - `/auth` aceita `?org=<slug>`: ao abrir esse link, a tela mostra o logo, o nome e a cor da equipe, e quem criar conta ali já entra como membro daquela equipe (sem precisar convite individual).
   - Nas Configurações da equipe (e no criar equipe, ao final) aparece o link pronto para compartilhar, com botão "Copiar link" — só criador/admins veem.
   - Entrar sem `?org=` continua funcionando igual.

3. **Criar equipe com cores e logo**
   - No fluxo de criação (`/onboarding` e `/org/new`) e nas configurações da equipe:
     - **Logo**: upload de imagem (arquivo) com pré-visualização, além da opção de colar URL.
     - **Cores**: seletor de cor primária e cor de destaque, com paletas prontas e prévia ao vivo do sidebar/botões.
   - As cores escolhidas passam a pintar a interface da equipe ativa (sidebar, botões, destaques), mantendo o tema escuro atual como base.

## Detalhes técnicos

**Banco**
- `organizations`: novas colunas `primary_color text`, `accent_color text` (defaults = roxo atual), `join_enabled boolean default true`.
- Função `security definer` `get_org_public(_slug text)` retornando apenas `id, name, brand_name, logo_url, primary_color, accent_color, join_enabled` — leitura pública para renderizar a tela de login com marca (sem expor membros/dados).
- Função `security definer` `join_org_by_slug(_slug text)` que insere o usuário autenticado como `member` respeitando `member_limit` e `join_enabled`.
- Atualizar `handle_new_user` para, quando `raw_user_meta_data->>'org_slug'` existir, vincular o novo usuário àquela organização.
- `my_organizations` e `get_org_public` retornam as novas colunas.

**Storage**
- Bucket público `org-logos` com políticas: leitura pública; upload/update/delete apenas por admins da organização (caminho `<organization_id>/...`).

**Frontend**
- `src/routes/index.tsx`: deixa de ser redirect e passa a renderizar a landing (SSR ligado, `head()` com título/descrição próprios). Rota `/dashboard` continua o destino de quem está logado.
- Novo `src/components/OrgBrandForm.tsx`: campos de nome, logo (upload + preview) e cores, reutilizado em onboarding, nova equipe e configurações.
- `src/contexts/active-org.tsx`: aplica `primary_color`/`accent_color` como CSS variables (`--acrux`, `--acrux-glow`) no elemento raiz quando há equipe ativa.
- `src/routes/auth.tsx`: lê `?org=`, busca `get_org_public`, mostra a marca da equipe e envia `org_slug` no signup; após login com conta existente, chama `join_org_by_slug` se ainda não for membro.
- `src/lib/organizations.functions.ts`: `createOrganization` e `updateOrganization` passam a aceitar cores; nova server function para gerar/copiar o link de convite.
