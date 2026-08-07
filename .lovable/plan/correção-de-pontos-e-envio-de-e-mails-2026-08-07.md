# Correção de pontos e envio de e-mails

## 1. Editar os registros de ponto

Hoje um registro de ponto não pode ser corrigido: se alguém esquece de encerrar, marca errado ou erra o relatório, o registro fica torto para sempre.

O que muda:

- **Editar registro**: em "Meu ponto", cada registro ganha um botão de editar que abre uma janela com data, hora de entrada, hora de saída e o relatório do dia. A duração é recalculada automaticamente ao salvar.
- **Quem pode editar**: o próprio membro corrige os seus registros; admins da equipe corrigem os de qualquer membro, pela aba "Pontos da equipe".
- **Validações**: saída precisa ser depois da entrada, nada além de 24h em um único registro, relatório com o mínimo atual de caracteres, e não é possível colocar horários no futuro.
- **Marcação de ajuste**: todo registro alterado à mão fica marcado como "ajustado" (com data do ajuste e quem ajustou), aparecendo como observação nos relatórios em PDF/CSV — assim o histórico continua confiável.
- **Encerrar um ponto esquecido**: se um registro estiver aberto, a edição permite definir a hora de saída e fechá-lo.

## 2. E-mails que não estão funcionando

O projeto **não tem um domínio de e-mail configurado**. Sem isso:

- A confirmação de troca de e-mail no perfil sai por um remetente genérico da plataforma, cai em spam com frequência e por isso "não dá certo".
- Nenhum e-mail com a marca da equipe pode ser enviado.

Para resolver de verdade é preciso configurar um domínio de envio (um domínio que você já tenha, ex.: `acruxrobocep.com.br`). Depois disso eu configuro os modelos de e-mail de autenticação (confirmação de cadastro, troca de e-mail, recuperação de senha) com a identidade do GE by Acrux ROBOCEP.

Enquanto o domínio não estiver pronto, também vou melhorar a tela de perfil para deixar claro o que está acontecendo: aviso de "confirmação pendente" após pedir a troca de e-mail, botão para reenviar o link e orientação para checar a caixa de spam.

Observação: quem entrou pelo Google continua entrando pelo Google mesmo depois de trocar o e-mail de acesso — a troca não desconecta a conta Google. Se a intenção for outra, é só avisar.

## Detalhes técnicos

- Migração: colunas `edited_at timestamptz` e `edited_by uuid` em `public.time_entries`; política de UPDATE já permite dono e admin da equipe — será revisada para garantir que admins possam alterar `clock_in`, `clock_out`, `work_date`, `notes`.
- `src/routes/_authenticated/ponto.tsx`: diálogo de edição com inputs `date` + `time`, recálculo de `duration_minutes` e invalidação das queries `time-open` / `time-entries`.
- `src/routes/_authenticated/pontos.tsx`: mesmo diálogo para admins, reutilizado por um componente novo `src/components/TimeEntryEditDialog.tsx`; invalida `org-time-entries`.
- Exportações CSV/PDF passam a incluir a marcação de ajuste manual.
- E-mails: configurar domínio de envio e, em seguida, gerar os modelos de e-mail de autenticação com a marca.
