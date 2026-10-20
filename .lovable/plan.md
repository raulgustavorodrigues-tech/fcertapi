# Intervalos maiores para heartbeat e sincronização do agente

## Situação atual
- Heartbeat (contato com o Hub para buscar comandos): a cada **30 s**, fixo no instalador.
- Sincronização (entregas + tabelas): a cada **15 min** (900 s), configurável por banco.
- O painel considera o agente "offline" após **5 min** sem heartbeat.
- O agente já aceita uma nova frequência de sincronização vinda do Hub sem reinstalar, mas o heartbeat não.

## Proposta de novos valores

| Item | Hoje | Proposto |
|---|---|---|
| Heartbeat | 30 s | **120 s** (2 min) |
| Sincronização de entregas e tabelas | 15 min | **30 min** |
| Marca "instável" no painel | após 1 min | após 5 min |
| Marca "offline" no painel | após 5 min | após 10 min |

Efeito: cerca de 4x menos chamadas de heartbeat e metade das sincronizações. Em troca, comandos do painel (Testar, Sync, Entregas 60d, Atualizar agente) podem demorar até ~2 min para começar, e os dados da Logitech podem ter até 30 min de atraso. A janela de 60 dias continua igual.

## O que muda
1. **Agente (nova versão 1.5.8)**: padrões novos de 120 s e 1800 s; o heartbeat passa a aceitar o intervalo enviado pelo Hub (`next_heartbeat_in`), assim dá para ajustar depois sem reinstalar. Depois de executar um comando, continua com resposta rápida (5 s) por alguns ciclos.
2. **Hub (heartbeat)**: envia 120 s como padrão para os agentes.
3. **Instalador**: o arquivo de configuração gerado passa a trazer `HEARTBEAT_INTERVAL=120` e sincronização padrão de 1800 s quando o banco não tiver valor próprio.
4. **Painel (Bancos, Agente, Dashboard)**: limites de "instável"/"offline" ajustados para não acusar falso offline; tempo de espera dos comandos aumentado para ~3 min.
5. **Bancos existentes** que ainda estão em 900 s: atualizar para 1800 s (opcional — confirmar na aprovação).

## Depois da aprovação
- Publicar o release `agent-v1.5.8` no GitHub e atualizar os secrets `AGENT_LATEST_VERSION` / `AGENT_INSTALLER_URL`.
- Usar "Atualizar todos os agentes" para levar a FCERTA/Pharmapele à nova versão.

## Detalhes técnicos
- `agent/agent.py`: `AGENT_VERSION="1.5.8"`; defaults `SYNC_INTERVAL=1800`, `HEARTBEAT_INTERVAL=120`; em `heartbeat()` aplicar `next_heartbeat_in` (limitado a 30–600 s); loop mantém `sleep 5` por 3 ciclos após comandos.
- `src/routes/api/public/heartbeat.ts`: fallback `heartbeat_interval_seconds ?? 120`; `register.ts` idem e `sync_interval ?? 1800`.
- `agent-installer.ts`: `HEARTBEAT_INTERVAL=120`, `SYNC_INTERVAL=${db.sync_interval ?? 1800}`.
- `src/lib/commands.ts` (`agentConnectionMode`, `heartbeatTone`) e `_app.agente.tsx` (`statusOf`): offline > 10 min, alerta > 5 min; `awaitCommandResult` timeout padrão 180 s.
- Fallbacks de versão do Hub para `agent-v1.5.8`.
