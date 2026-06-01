# CONECTA API — Plano de Construção

Aplicação muito extensa. Vou entregar em fases para garantir qualidade. **Esta primeira entrega** monta toda a fundação (design system, auth, navegação, schema do banco) e implementa **3 módulos completos**: Dashboard, Empresas, Bancos de Dados. Os demais módulos (Tabelas, Queries, Conectividade, Sincronização, Configurações) ficarão como rotas funcionais com UI base pronta para iteração nas próximas mensagens.

## Fase 1 — Fundação (esta entrega)

### Backend (Lovable Cloud / Supabase)
- Habilitar Lovable Cloud
- Criar tabelas: `companies`, `databases`, `sync_logs`, `saved_queries`, `agents`, `connectivity_logs`
- RLS: por enquanto, dados visíveis a qualquer usuário autenticado (sistema interno de admin). Cada usuário autenticado pode ler/escrever.
- Trigger `handle_new_user` opcional não é necessário (sem profile).

### Autenticação
- Email/senha (Lovable Cloud)
- Rota `/login` pública, demais rotas protegidas por layout `_authenticated`
- Auto-confirm já é o padrão do Cloud

### Design System (`src/styles.css`)
- Tema escuro forçado (sem toggle)
- Tokens em oklch correspondendo a:
  - bg `#0D1117`, card `#161B22`, border `#30363D`
  - primary teal `#00D4AA`, secondary `#3B82F6`
  - success/warn/error `#3FB950` / `#D29922` / `#F85149`
  - foreground `#E6EDF3`, muted-foreground `#8B949E`
- Fontes: JetBrains Mono (títulos/code) + Inter (corpo) via Google Fonts no `__root.tsx`
- Variants de Button e Badge (status: success, warning, error, info, pending)

### Shell de navegação
- `Sidebar` fixa 240px com logo, 8 itens de menu (Lucide icons), rodapé com versão + status
- Header com breadcrumb dinâmico, sino de notificações, avatar
- Layout `_authenticated.tsx` envolvendo tudo

### Módulos completos nesta entrega
1. **Dashboard** — 4 KPIs (queries reais ao Supabase), tabela últimas 10 sincronizações, lista lateral de agentes
2. **Empresas** — CRUD completo com modal, busca, filtro de status, máscara de CNPJ, navegação para Bancos filtrado
3. **Bancos de Dados** — CRUD completo, filtro por empresa, modal com todos os campos, banner pós-cadastro, botões testar/sincronizar (acionam mock log)

### Módulos como placeholders funcionais
- Tabelas, Queries, Conectividade, Sincronização, Configurações: rota criada, página com cabeçalho correto e empty state "Em construção — disponível na próxima iteração". Isso evita 404 nos links da sidebar.

## Fase 2 (próxima mensagem)
- Queries (editor com syntax highlighting básico)
- Conectividade (testador de URL custom + histórico)
- Tabelas (mock de schema)

## Fase 3
- Sincronização (4 abas)
- Configurações (5 seções)

## Detalhes técnicos
- TanStack Start + TanStack Query para fetches
- Server functions para reads sensíveis quando necessário; CRUD simples direto do cliente com RLS
- `sonner` para toasts
- Validação com Zod + react-hook-form (já no template)
- `lucide-react` para ícones
- Máscara CNPJ manual (sem dep extra)

## Confirmação
Confirme para eu prosseguir com **Fase 1**. Se preferir outra priorização de módulos, me diga.