# Módulo "APIs": catálogo de APIs e habilitação por empresa

Proposta para avaliação. Nada será alterado até você aprovar.

## Ideia geral

Hoje existe uma API só (Entregas / Logitech), fixa dentro do cadastro da empresa. A proposta é transformar isso em um **catálogo**: cada API vira um item cadastrado no sistema e, em cada empresa, você escolhe quais APIs ficam ligadas. Uma empresa pode usar uma, várias ou nenhuma.

```text
Catálogo de APIs            Empresa (Pharmapele)
- Entregas (Logitech)  -->  [x] Entregas   chave fc_live_ab12...
- Pedidos              -->  [x] Pedidos    chave fc_live_cd34...
- Estoque              -->  [ ] Estoque
- Clientes             -->  [ ] Clientes
```

## O que o usuário verá

1. **Novo menu "APIs"** (somente administradores)
   - Lista de APIs do catálogo: nome, descrição, endereço, situação (ativa / em teste / desativada) e quantas empresas usam.
   - Tela de detalhe de cada API: parâmetros aceitos, exemplo de resposta e lista das empresas que a usam.
   - Ligar ou desligar uma API para todas as empresas de uma vez (manutenção).

2. **No cadastro da Empresa**, o botão "API / Logitech" vira **"APIs"**
   - Lista de todas as APIs do catálogo com um interruptor para habilitar cada uma.
   - Para cada API habilitada: endereço pronto para copiar, geração/revogação de chave e último uso (como já funciona hoje).
   - Opção de usar **uma chave para várias APIs** ou **uma chave por API** (mais seguro: revogar uma não afeta as outras).

3. **Registro de uso** por empresa e por API: quantas chamadas, último acesso e erros, aproveitando o histórico de acesso que já existe.

## Regras

- Uma API só responde para uma empresa se estiver ativa no catálogo **e** habilitada naquela empresa **e** a chave tiver permissão para ela.
- Desabilitar a API na empresa bloqueia o acesso na hora, sem precisar apagar chaves.
- A API de Entregas atual entra no catálogo como primeira API, e a Pharmapele já começa com ela habilitada: o Logitech continua funcionando sem mudar nada.

## Um ponto importante

O catálogo controla **quem pode usar** cada API. Criar uma API nova (ex.: Pedidos) ainda exige programar a consulta dos dados dela, e muitas vezes ensinar o agente a sincronizar a tabela correspondente do Firebird. Duas formas de fazer isso:

- **A. APIs programadas** (recomendado para começar): cada nova API é desenvolvida sob pedido e depois cadastrada no catálogo. Mais seguro e mais rápido de entregar.
- **B. APIs montadas pela tela** (mais tarde): o administrador escolhe uma tabela já sincronizada, os campos e os filtros, e o sistema publica a API sozinho. Mais flexível, porém mais trabalhoso e exige cuidado para não expor dados indevidos.

Sugestão: fazer A agora e deixar B como evolução.

## Etapas sugeridas

1. Criar o catálogo e cadastrar a API de Entregas nele.
2. Criar a tela de habilitação por empresa (substituindo o botão atual).
3. Fazer a API de Entregas checar se está habilitada para a empresa da chave.
4. Criar o menu "APIs" para administradores.
5. Adicionar as próximas APIs conforme a necessidade (Pedidos, Estoque etc.).

## Detalhes técnicos

- Tabela `api_catalog` (slug, nome, descrição, caminho, escopo exigido ex. `entregas:read`, status, documentação de parâmetros em jsonb).
- Tabela `company_apis` (company_id, api_id, enabled, habilitada_em, habilitada_por), única por par empresa/API.
- `api_keys.scopes` continua sendo a permissão da chave; ao gerar, o usuário marca quais APIs habilitadas a chave cobre.
- Função compartilhada de autorização para todas as rotas `/api/v1/*`: valida hash da chave, revogação, escopo, status no catálogo e `company_apis.enabled`, e grava em `api_access_log`.
- Migração: insere "entregas" em `api_catalog` e habilita para as empresas que já possuem chaves ativas com `entregas:read`.
- RLS: catálogo legível por autenticados e editável só por admin; `company_apis` legível por quem tem acesso à empresa e editável por admin.
