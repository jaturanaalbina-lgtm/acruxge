# Avisos que chegam sem abrir o site

Hoje os avisos só aparecem quando a pessoa está com o site aberto: o sino e as notificações são gerados pelo próprio navegador enquanto a página está carregada. Vamos mudar isso para que o aviso chegue no celular ou no computador mesmo com o site fechado.

## 1. Instalar na tela de início

- O app ganha nome, ícone e cores próprias, para poder ser adicionado à tela de início do celular e abrir em tela cheia, sem barra de navegador.
- Um convite discreto dentro do app ("Adicionar à tela de início") com o passo a passo para Android e iPhone.
- No iPhone, o aviso só funciona depois que a pessoa adiciona à tela de início — isso é uma exigência da Apple, e o texto do convite deixa isso claro.

## 2. Avisos com o site fechado

- Cada pessoa autoriza os avisos uma única vez, tocando em um botão dentro do app.
- A partir daí, o aparelho fica registrado e passa a receber os avisos mesmo com o site fechado.
- Um lugar no perfil para ligar e desligar os avisos.

## 3. Quando o aviso é enviado

- Tarefa atribuída a você: no momento em que alguém te coloca como responsável (inclusive corresponsável).
- Lembrete de evento: na véspera, no dia e 1 hora antes.
- Prazo de tarefa: na véspera e no dia do prazo.

O envio passa a ser feito pelo servidor, em horários fixos, e não mais pelo aparelho de quem está com o site aberto — por isso o aviso chega mesmo para quem não entra no sistema há dias. Tocar no aviso abre direto a tarefa ou o dia do evento.

## O que preciso de você

Para o envio funcionar é preciso conectar o serviço de notificações do Google (Firebase Cloud Messaging), que é gratuito nesse uso. Vou abrir o cartão de conexão no chat; você cria/escolhe o projeto no Firebase e marca a opção de notificações para navegador. Sem isso, o restante fica pronto, mas nenhum aviso sai.

## Detalhes técnicos

- Conexão do conector `firebase_messaging` com "Include web push"; envio pelo gateway (`/v1/projects/_/messages:send`), nunca direto no `fcm.googleapis.com`.
- `public/manifest.webmanifest` + tags `manifest`, `theme-color`, `apple-touch-icon` no `head()` do `__root.tsx`; ícones 192/512 gerados a partir do logo. Sem service worker de offline — apenas `public/firebase-messaging-sw.js` para push.
- `src/lib/push.ts`: `enablePush()` com os estados `not-configured | unsupported | open-in-new-tab | denied | registered`; registro do SW com config na query string; `messagingSenderId` derivado do app ID.
- Nova tabela `push_tokens` (id, organization_id, user_id, token único, user_agent, created_at, last_seen_at) com RLS por `auth.uid()`, GRANTs para `authenticated` e `service_role`.
- Agendamento no servidor: rota `src/routes/api/public/push-dispatch.ts` (verificação por segredo no header) que lê `notifications` não enviadas, eventos e prazos, envia via gateway e marca `pushed_at`; coluna `pushed_at` adicionada a `notifications`. `pg_cron` chama essa rota a cada 15 minutos na URL estável do projeto.
- Gatilho de atribuição já existente em `tasks`/`task_assignees` continua criando a linha em `notifications`; o disparo passa a ser do cron. Tokens que retornarem 404 UNREGISTERED são apagados.
- `NotificationBell` continua igual para quem está com o site aberto; a deduplicação por `localStorage` sai em favor de `pushed_at` no banco.
