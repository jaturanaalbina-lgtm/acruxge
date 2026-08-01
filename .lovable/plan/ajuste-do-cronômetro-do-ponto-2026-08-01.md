# Ajuste do cronômetro do ponto

## O que está acontecendo

No banco existe um registro de ponto aberto desde **07/07** que nunca foi encerrado, e outro que ficou aberto por mais de 2 dias (3066 minutos). Como a tela sempre pega o ponto aberto mais recente e conta a partir do `clock_in`, o cronômetro parece "infinito": ele mostra dias de duração e nunca zera.

Além disso, ao encerrar só o registro exibido é fechado — se houver mais de um aberto (o que já ocorreu), o antigo continua pendente e o cronômetro volta a correr.

## O que será feito

1. **Encerrar sempre tudo**: ao clicar em "Encerrar ponto", fechar todos os registros abertos do usuário na equipe ativa, não apenas o exibido, com o mesmo relatório.
2. **Limite de jornada**: se um ponto aberto passar de um limite (sugestão: 12 horas), ele é considerado sessão esquecida. A duração gravada é limitada a esse teto e o registro é marcado no relatório como "encerrado automaticamente".
3. **Higienizar o que está aberto agora**: fechar o registro pendente de 07/07 na migração, com duração limitada ao teto e nota indicando fechamento automático.
4. **Contagem correta**: cronômetro continua em HH:MM:SS, mas exibindo dias quando passar de 24h, e mostrando um aviso visual quando ultrapassar o limite de jornada.
5. **Catalogação garantida**: após encerrar, invalidar as consultas e confirmar que o registro aparece imediatamente na lista do período (hoje já invalida, mas o filtro padrão começa no dia 1 do mês — será mantido).

## Detalhes técnicos

- Migração: `UPDATE public.time_entries SET clock_out = clock_in + interval '12 hours', duration_minutes = 720, notes = coalesce(notes,'') || '[encerrado automaticamente]' WHERE clock_out IS NULL AND clock_in < now() - interval '12 hours';`
- `src/routes/_authenticated/ponto.tsx`: `stopMut` passa a buscar todos os registros com `clock_out IS NULL` do usuário e atualizá-los em lote; duração calculada por registro com `Math.min(realMinutes, 720)`.
- Formatação: `fmtHMS` passa a exibir `Xd HH:MM:SS` acima de 24h.
