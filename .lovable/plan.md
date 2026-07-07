## 1. Ocultar Setup admin

- Remover o item "Setup admin" da `AppSidebar.tsx` (esconder sempre).
- A rota `/setup` permanece ativa para uso interno, mas não aparece no menu.
- Promoção/rebaixamento de admin continua sendo feito só pela página **Membros** (já implementado no turno anterior).

## 2. Ajustes no sistema de Ponto

### Fluxo de trabalho
- Iniciar ponto: cria o registro (como hoje).
- Encerrar ponto: abre um **diálogo obrigatório** pedindo o relatório do dia ("O que você fez hoje?"). Sem preencher, o ponto **não é encerrado**.
- O relatório é salvo no campo `notes` do próprio `time_entries` (agrupado por dia — se já houver texto do dia, concatena com timestamp).
- Bloquear encerramento com texto vazio (mínimo ~10 caracteres).

### Contabilização
- O tempo já é contabilizado em `duration_minutes` na hora do stop. Vou reforçar:
  - Mostrar total do dia e total do período (já existe).
  - Impedir múltiplos pontos abertos simultâneos (checagem no start).
  - Corrigir edge case: quando o ponto passa da meia-noite, `work_date` fica o dia do início — manter esse comportamento e deixar explícito no relatório.

### Exportação em PDF (papel timbrado)
- Novo botão "Exportar PDF" ao lado do "Exportar CSV".
- Gera PDF client-side com **jsPDF + jspdf-autotable**.
- Layout pensado para impressão em papel timbrado da Acrux ROBOCEP:
  - Margem superior de ~4 cm (espaço reservado para o timbre físico).
  - Título: "Relatório de Ponto — {Nome do Membro}".
  - Período: {de} a {até}.
  - Tabela por dia: Data · Entrada · Saída · Duração · Atividades.
  - Rodapé: total de horas do período + linha de assinatura ("_____________ Assinatura do colaborador").
  - Fonte serifada padrão, preto/cinza, sem elementos decorativos que conflitem com o timbre.

### Detalhes técnicos
- Instalar `jspdf` e `jspdf-autotable`.
- Buscar `profiles.full_name` do usuário para o cabeçalho do PDF.
- Manter o campo `notes` por entrada (permite várias sessões no mesmo dia com relatórios distintos).
- O diálogo de encerramento usa `<Dialog>` do shadcn com `<Textarea>` obrigatório.

## Arquivos afetados
- `src/components/AppSidebar.tsx` — remover item Setup admin.
- `src/routes/_authenticated/ponto.tsx` — diálogo obrigatório no stop + exportação PDF.
- `package.json` — adicionar `jspdf` e `jspdf-autotable`.

Sem mudanças de banco.
