## Objetivo
Restringir os links e páginas de **Setup admin**, **Aprovações** e **Convites** apenas para administradores.

## Mudanças

### 1. `src/components/AppSidebar.tsx`
- Consultar se o usuário atual tem papel `admin` via `supabase.rpc("has_role", { _user_id, _role: "admin" })` em um `useQuery`.
- Esconder os itens "Setup admin", "Aprovações" e "Convites" quando `isAdmin === false`.
- Exceção: manter "Setup admin" visível quando **ainda não existe nenhum admin** no sistema (consulta count em `user_roles` com `role=admin`), para permitir o primeiro claim. Assim que houver um admin, só admins veem.

### 2. Proteção nas rotas (defesa em profundidade)
Adicionar `beforeLoad` em cada uma redirecionando não-admins para `/dashboard`:
- `src/routes/_authenticated/approvals.tsx` — exige admin.
- `src/routes/_authenticated/invites.tsx` — exige admin.
- `src/routes/_authenticated/setup.tsx` — permite acesso se o usuário é admin **ou** se ainda não existe nenhum admin (preserva o fluxo do primeiro claim, que já é validado no server `claimAdmin`).

Sem alterações de banco ou de design.
