# Corrigir status oscilante e painel de falhas no Dashboard

## O que foi encontrado
- O agente Pharmapele (v1.5.8) agora envia sinal a cada **2 min** (120 s). Último sinal visto: há 48 s, normal.
- O Dashboard e o mapa ainda chamam o agente de "online" só se o sinal tiver **menos de 60 s**. Com o novo intervalo, ele fica "online" por ~1 min e "instável" no minuto seguinte, sem parar. É por isso que ele oscila.
- Os cards "Agentes online", a rosca de status, o mapa do Brasil e o painel de saúde usam esse limite antigo de 1 min / 5 min, diferente da tela de Bancos (5 / 10 min).
- "Bancos com mais falhas" conta só as sincronizações com erro. Nas últimas 24 h houve 94 sincronizações com sucesso e nenhuma com erro, mas houve **7 comandos que expiraram** e **1 evento de erro** do agente. Nada disso entra no painel, por isso ele fica sempre zerado.

## O que muda
1. Uma regra única de status para todo o painel: **online** até 5 min sem sinal, **instável** de 5 a 10 min, **offline** depois de 10 min. Vale para cards, rosca, mapa e painel de saúde.
2. Textos atualizados ("heartbeat < 60s" vira "heartbeat < 5 min"; "Sem heartbeat recente" passa a valer após 5 min).
3. "Bancos com mais falhas" passa a somar, por banco, nas últimas 24 h:
   - sincronizações com erro,
   - comandos com erro ou tempo esgotado,
   - eventos do agente com nível de erro.
   O card "Falhas 24h" usa a mesma soma.

## Detalhes técnicos
- `src/lib/commands.ts`: exportar `agentLiveness(last)` -> online/stale/offline (5/10 min), reaproveitado em `_app.index.tsx` (linhas ~506, 648, 891-938) e `BrazilAgentsMap.tsx` (linha 41).
- `_app.index.tsx` query: adicionar `command_results` (status in error,timeout, enqueued_at >= 24h, com `databases(name)`) e `agent_events` (level in ERROR,CRITICAL or status error, 24h, com `databases(name)`); normalizar para `{databases.name}` e concatenar em `errors24h`.
- Teste vitest para `agentLiveness` (120 s = online, 6 min = instável, 11 min = offline).
