# Integração Logitech: acesso à URL e Chave da API por empresa

Adicionar, no módulo **Empresas**, um botão por empresa cadastrada que abre uma janela com tudo o que o sistema Logitech precisa para se conectar: o endereço (URL) da API de entregas e a chave de acesso daquela empresa.

## O que o usuário verá

No card de cada empresa, ao lado de "Editar" e "Ver Bancos", um botão **"API / Logitech"**. Ao clicar, abre uma janela com:

1. **Endereço da API** — URL completa pronta para copiar, por exemplo:
   `https://fcertapi.lovable.app/api/v1/entregas?data_inicio=AAAA-MM-DD&data_fim=AAAA-MM-DD`
   com botão de copiar.
2. **Como autenticar** — aviso de que a chave vai no cabeçalho `Authorization: Bearer <chave>`, com um exemplo pronto para copiar.
3. **Chaves da empresa** — lista das chaves já emitidas para a empresa: nome, prefixo (ex.: `fc_live_ab12…`), data de criação, último uso e situação (ativa/revogada). Por segurança a chave completa não fica guardada, então só o prefixo aparece.
4. **Gerar nova chave** — campo de nome e botão. A chave completa é exibida **uma única vez**, em destaque, com botão de copiar e aviso claro de que não poderá ser vista novamente.
5. **Revogar chave** — botão por chave ativa, com confirmação.
6. **Parâmetros aceitos** — pequena tabela de referência (`data_inicio`, `data_fim`, `limit`, `offset`) e exemplo de resposta resumido.

## Regras

- Só usuários autenticados com acesso à empresa (ou administradores) podem ver e gerar chaves.
- A chave nova é criada no servidor, guardada apenas como hash (mesmo formato já usado hoje), com escopo `entregas:read` e vinculada à empresa.
- Chave revogada deixa de funcionar imediatamente na API de entregas (comportamento já existente).

## Detalhes técnicos

- Novo arquivo `src/lib/api-keys.functions.ts` com server functions protegidas por `requireSupabaseAuth`:
  - `listCompanyApiKeys({ companyId })` — retorna `id, name, key_prefix, scopes, created_at, last_used_at, revoked_at`.
  - `createCompanyApiKey({ companyId, name })` — gera `fc_live_` + 32 bytes aleatórios, calcula SHA-256, grava em `api_keys` (`company_id`, `key_prefix`, `key_hash`, `scopes: ['entregas:read']`) e devolve a chave em texto **apenas nessa resposta**.
  - `revokeCompanyApiKey({ keyId })` — preenche `revoked_at`/`revoked_reason`.
  - Todas validam permissão via `private.user_has_company_access` / `private.has_role(admin)`, com `supabaseAdmin` só após a checagem.
- Novo componente `src/components/conecta/CompanyApiDialog.tsx` com a janela descrita.
- `src/routes/_app.empresas.tsx`: novo botão no card abrindo o diálogo (estado local por empresa).
- URL base montada a partir de `window.location.origin`, com nota de que o endereço publicado é o correto para produção.
- Nenhuma mudança de schema: `api_keys` e `api_access_log` já existem.
