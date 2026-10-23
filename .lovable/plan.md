# Como criar novas APIs no módulo "APIs"

## Como funciona hoje (resposta direta)

Sim: hoje a criação é feita **pelo prompt**. O módulo "APIs" só controla **quem pode usar** cada API (nome, endereço, permissão, situação e empresas habilitadas). Ele não tem campos de tabela, colunas ou filtros porque foi entregue a opção A ("APIs programadas") da proposta anterior.

Fluxo atual para uma API nova (ex.: Pedidos):

1. Você pede no chat: "crie a API de Pedidos usando a tabela X do Firebird, com os campos A, B, C e filtro por data".
2. Eu programo: o agente passa a sincronizar a tabela, crio a tabela de destino no Hub e o endereço `/api/v1/pedidos` com a mesma verificação de chave das Entregas.
3. Você cadastra (ou eu cadastro) a API no menu "APIs" e liga para as empresas desejadas no botão "APIs" em Empresas.

## Opção para o futuro: montar APIs pela tela (opção B)

Se quiser criar sem prompt, a proposta é adicionar ao cadastro da API:

- **Fonte dos dados**: escolher uma tabela já sincronizada (lista vinda da tela "Tabelas").
- **Campos**: marcar quais colunas aparecem na resposta, com nome de saída opcional.
- **Filtros aceitos**: escolher colunas filtráveis (ex.: data inicial/final, código) e o tipo (data, número, texto).
- **Ordenação e limite** de linhas por chamada.
- **Pré-visualização**: botão "Testar" mostrando a resposta com dados reais da empresa.
- Um único endereço genérico `/api/v1/{identificador}` responde por todas as APIs montadas assim.

Limitações: só funciona com tabelas que o agente já sincroniza; não aceita SQL livre (para não expor dados indevidos); consultas complexas (junções, cálculos) continuam pelo prompt.

## Detalhes técnicos (opção B)

- Novas colunas em `api_catalog`: `source_table`, `fields` (jsonb), `filters` (jsonb), `order_by`, `max_rows`, `kind` ('coded' | 'builder').
- Rota `src/routes/api/v1/$slug.ts` que usa `authorizeApiRequest`, valida filtros contra a configuração (lista branca de colunas) e consulta sempre limitada à empresa/banco da chave.
- Editor no diálogo do `_app.apis.tsx` com seleção de tabela/colunas a partir do `schema_cache`.

Aprovar este plano implementa a opção B. Se preferir continuar pelo prompt, basta me dizer qual API criar e de qual tabela.
