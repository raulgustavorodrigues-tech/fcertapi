# API "Pedido Magistral"

Uma nova API para o sistema Pedido Magistral que reúne, por produto: cadastro, estoque mínimo/máximo/atual, lotes disponíveis com validade, histórico de preço de compra, consumo, notas de entrada e fornecedores. Ela usa o mesmo banco Firebird e o mesmo agente que já atendem o Logitech.

## Como vai funcionar

```text
Firebird (farmácia) --1x por dia--> Agente --> Hub (cópia dos dados) --> /api/v1/pedido-magistral --> Pedido Magistral
```

1. **Uma vez por dia** o agente lê as 7 tabelas e envia os dados ao Hub (consumo, notas e preços dos **últimos 12 meses**).
2. O Hub guarda uma cópia separada por banco, igual ao que já acontece com as Entregas.
3. O Pedido Magistral chama **um endereço único** com a chave da empresa e recebe tudo agrupado por produto.
4. A API entra no menu "APIs" e é ligada para cada empresa no botão "APIs" em Empresas.

## Dados de cada tabela


| Assunto          | Tabela  | O que vem                                                                                                  |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| Produtos         | FC03000 | código, descrição, unidade, situação, bloqueio, grupo (M/E/R/O), controle especial (SNGPC), preço de custo |
| Estoque          | FC03100 | filial, mínimo, máximo, atual                                                                              |
| Preço de compra  | FC03160 | data e preço de cada reajuste (12 meses)                                                                   |
| Lotes            | FC03140 | filial, lote, nota, entrada, validade, situação, quantidade (só lotes com saldo)                           |
| Consumo          | FC12110 | quantidade usada, **somada por produto e por mês** (12 meses)                                              |
| Notas de entrada | FC11100 | nota, fornecedor, data, quantidade, preço unitário (12 meses)                                              |
| Fornecedores     | FC02000 | código, CNPJ, nome                                                                                         |


O consumo é somado por mês já no agente: assim o envio fica leve e a análise de sugestão continua possível (média mensal, sazonalidade).

## Exemplo de resposta (um produto)

```text
{
  "cdpro": 1234, "descricao": "...", "unidade": "g", "grupo": "M", "sngpc": "N",
  "situacao": "A", "bloqueio": "L", "preco_custo": 12.5,
  "estoque": [{ "filial": 1, "minimo": 100, "maximo": 500, "atual": 230,
                "soma_lotes": 230, "divergente": false }],
  "lotes": [{ "filial": 1, "lote": "A12", "validade": "2027-03-01", "situacao": "L", "saldo": 230 }],
  "precos": [{ "data": "2026-08-10", "preco": 12.5, "variacao_pct": 4.1 }],
  "consumo_mensal": [{ "mes": "2026-09", "quantidade": 85 }],
  "media_consumo_mensal": 80,
  "entradas": [{ "nota": 5521, "data": "2026-08-10", "quantidade": 200, "preco": 12.5,
                 "fornecedor": { "codigo": 7, "cnpj": "...", "nome": "..." } }]
}
```

Itens calculados que já saem prontos: soma dos lotes x estoque atual (com aviso de divergência), variação percentual do preço entre reajustes e média de consumo mensal.

Filtros aceitos: grupo, filial, situação, produto específico, só produtos abaixo do mínimo, e paginação (a resposta tem muitos produtos).

## O que preciso confirmar com você durante a construção

- Os nomes de campo exatos das tabelas no Firebird (vou validar com "Carregar schemas" no banco da Pharmapele antes de fixar).
- Se produtos inativos ou ocultos devem aparecer na API.

## Etapas

1. Criar no Hub as tabelas de cópia das 7 fontes.
2. Atualizar o agente (nova versão) para ler as 7 tabelas 1x por dia, com o consumo somado por mês.
3. Criar o endereço de recebimento do agente.
4. Criar a API `/api/v1/pedido-magistral` com a mesma checagem de chave, permissão e empresa habilitada.
5. Cadastrar no catálogo e adicionar um botão "Pedido Magistral agora" no banco, para testar sem esperar o dia seguinte.
6. Gerar nova versão do agente (release no GitHub e atualização dos agentes, como nas versões anteriores).

## Detalhes técnicos

- Tabelas: `pm_produtos`, `pm_estoque`, `pm_precos`, `pm_lotes`, `pm_consumo_mensal`, `pm_notas`, `pm_fornecedores`, todas com `database_id` + chave natural (ex. `cdpro`, `cdfil,cdpro`, `cdfil,cdpro,ctlot`), RLS por acesso à empresa e GRANT para `authenticated`/`service_role`. Mais `pm_sync_status` (última execução, linhas por tabela).
- Agente: nova tarefa `sync_pedido_magistral` independente do loop de entregas, intervalo de 86400 s, envio em lotes de 5000 linhas por tabela com HMAC; carga completa substitui as tabelas de cadastro (produtos, estoque, lotes, fornecedores) e janela de 12 meses para as de histórico. Consumo: `SELECT CDPRIN, EXTRACT(YEAR/MONTH FROM DTENTR), SUM(QTREAL) ... GROUP BY`. Lotes: `WHERE ESTAT > 0`.
- Recebimento: `src/routes/api/public/sync-pedido-magistral.ts` com validação Zod e registro em `sync_logs` (entra no contador "Syncs 24h").
- Consumo: `src/routes/api/v1/pedido-magistral.ts` usando `authorizeApiRequest(admin, request, "pedido-magistral")`, escopo `pedido-magistral:read`, paginação `page`/`limit` (máx. 500 produtos), log em `api_access_log`.
- Comando `force_sync_pedido_magistral` em `src/lib/commands.ts` e botão em `_app.bancos.tsx`.  
  
A API deverá realizar uma carga inicial para consultar as informações dos ultimos 12 meses, porém após isso era deve realizar apenas uma carga incremental dos novos dias para analisar o que foi inserido de informação, dessa forma a consulta ficará mais leve.