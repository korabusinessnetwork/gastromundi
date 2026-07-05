# Débito Técnico — Backlog — GastroMundi

## Objetivo
Registrar e priorizar o débito técnico identificado no GastroMundi: código que funciona mas precisa ser melhorado, arquiteturas temporárias, testes ausentes e outras decisões de curto prazo que precisam ser revisadas.

## Contexto
Débito técnico é inevitável em produtos que evoluem rápido. O risco está em ignorá-lo indefinidamente. Este arquivo torna o débito visível e permite planejá-lo junto com as features — não como um projeto separado que nunca acontece.

## Regras Gerais
- Todo débito técnico identificado deve ser registrado aqui (não apenas "na cabeça")
- Débito técnico crítico (que afeta segurança ou estabilidade) tem prioridade automática alta
- Débito técnico deve ser planejado junto com features — reservar capacidade no sprint
- "Faremos depois" só é válido se tiver data ou milestone definida

## Validações
- Itens de débito sem contexto suficiente são marcados como "Necessita Investigação"
- Débito técnico com impacto em segurança deve ser resolvido antes de novas features da área afetada

## Permissões
- Qualquer dev pode registrar débito técnico
- Priorização é responsabilidade do tech lead em alinhamento com o product owner

## Exceções
- Débito técnico em código de prova de conceito marcado `[POC]` é esperado e não precisa ser registrado até a decisão de manter o código

## Auditoria
- Revisão do débito técnico: mensalmente ou a cada fim de ciclo
- Débito técnico resolvido deve ter data e PR/commit de referência

## Eventos
- `tech-debt.identified` — novo débito técnico registrado
- `tech-debt.resolved` — débito técnico resolvido

## Configurações Futuras
- Integrar análise estática de código (SonarQube, CodeClimate) para identificar débito automaticamente
- Criar métrica de "índice de saúde técnica" do projeto

## Casos de Uso
- Planejamento de sprint (reservar % de capacidade para débito)
- Decisões de refatoração
- Revisão de arquitetura
- Onboarding técnico (entender o estado atual do código)

## Critérios de Aceite
- [ ] Todo item tem impacto, esforço e prioridade estimados
- [ ] Items críticos têm assignee e data-alvo
- [ ] Itens resolvidos estão marcados com data e referência

---

## Categorias de Débito Técnico

| Categoria | Descrição |
|-----------|-----------|
| 🏗️ Arquitetura | Estruturas que precisam ser redesenhadas |
| 🧪 Testes | Cobertura de testes ausente ou insuficiente |
| 🔒 Segurança | Vulnerabilidades ou práticas de segurança inadequadas |
| ⚡ Performance | Gargalos de performance identificados |
| 📦 Dependências | Bibliotecas desatualizadas ou com vulnerabilidades |
| 🧹 Code Quality | Código duplicado, complexo ou mal documentado |

---

## Débito Técnico Ativo

> Auditoria de 2026-07-04 (análise completa do código em produção).

| # | Título | Categoria | Impacto | Esforço | Prioridade | Status |
|---|--------|-----------|---------|---------|-----------|--------|
| TD001 | Senhas legíveis em `config.credentials` acessíveis a qualquer usuário logado | 🔒 Segurança | Alto | Médio | 🔴 Critical | Resolvido (2026-07-04) |
| TD002 | Logs de diagnóstico com dados de sessão/token no console (`TODO: remove diag`) | 🔒 Segurança | Médio | Baixo | 🟠 High | Resolvido (2026-07-04) |
| TD003 | Bootstrap carrega TODAS as vendas sem limite (`sales` sem filtro de data) | ⚡ Performance | Alto (cresce com o tempo) | Baixo | 🟠 High | Resolvido (2026-07-04) |
| TD004 | Estoque como JSONB único em `config` (race conditions, sem histórico, limite global 10 hardcoded) | 🏗️ Arquitetura | Médio | Alto | 🟡 Medium | Resolvido (2026-07-04) |
| TD005 | Zero testes automatizados; sem script `test`/`lint` no package.json | 🧪 Testes | Alto | Alto | 🟠 High | Resolvido (2026-07-04) |
| TD006 | `supabase/schema.sql` defasado vs migrações (policies `acesso_total` já substituídas) | 🧹 Code Quality | Médio (onboarding perigoso) | Baixo | 🟡 Medium | Resolvido (2026-07-04) |
| TD007 | `dist/` commitado no repositório | 🧹 Code Quality | Baixo | Baixo | 🟢 Low | Resolvido (2026-07-04) |
| TD008 | Rate limiting de login só no cliente (sessionStorage, contornável) | 🔒 Segurança | Baixo (Supabase Auth tem proteção própria) | Baixo | 🟢 Low | Identificado |
| TD009 | `sales`/`fechamentos` como blobs JSONB — relatórios/consultas SQL limitados | 🏗️ Arquitetura | Médio | Alto | 🟡 Medium | Identificado (alinhado ao modelo-alvo docs/04) |
| TD010 | Realtime só em `pending` — estoque/config/insights não sincronizam entre dispositivos | 🏗️ Arquitetura | Médio | Médio | 🟡 Medium | Identificado |

### [TD001] Senhas legíveis em `config.credentials`

**Categoria:** Segurança · **Impacto:** Alto · **Esforço:** Médio · **Prioridade:** 🔴 Critical · **Status:** Resolvido (2026-07-04)

**Descrição:** `AppContext.saveCredential` grava senhas em texto puro na key `credentials` da tabela `config` ("para recuperação administrativa"). A policy `config_select_auth` (migração 20240107) permite que **qualquer usuário autenticado** (inclusive garçom) leia a tabela `config` inteira via REST — incluindo todas as senhas. O bootstrap ainda baixa `credentials` para todos os clientes.

**Solução proposta:** eliminar o armazenamento de senha legível (usar reset de senha via Edge Function `manage-user`, que já existe). Se a recuperação administrativa for indispensável, mover para tabela própria com RLS `admin`-only — nunca na `config` de leitura geral. Remover `credentials` do bootstrap.

**Resolução:** removidos `credentials`/`saveCredential` de `AppContext.jsx` (state, bootstrap, action e context value), das duas chamadas em `ConfiguracoesView.jsx` (criação e edição de usuário — o reset de senha já é coberto por `criarAuthUsuario`/`atualizarSenhaAuth`) e da coluna "Senha" em `RelatorioView.jsx` (thead, células, state `senhasVisiveis` e export em PDF). Migração `supabase/migrations/20260704_remove_credentials.sql` apaga as senhas já gravadas em produção (`DELETE FROM config WHERE key = 'credentials'`).

### [TD002] Logs de diagnóstico sensíveis

**Status:** Resolvido (2026-07-04)

**Descrição:** `src/lib/supabase.js`, `AppContext.addSale` e `PDVView.handleConfirmPayment` logam presença/expiração de token e metadados de sessão no console (marcados `TODO: remove diag`). Viola a regra do CLAUDE.md.

**Solução proposta:** remover os blocos de diag (ou condicionar a `import.meta.env.DEV`).

**Resolução:** removidos os blocos `[supabase:init]`, `[addSale:pre-request]`, `[addSale:error-detail]`, `[handleConfirmPayment:pre-request]` e `[handleConfirmPayment:error-detail]` (e os `getSession` usados só para diagnóstico). Os `console.error` de erro simples que já existiam foram mantidos.

### [TD003] Bootstrap sem limite em `sales`

**Status:** Resolvido (2026-07-04)

**Descrição:** `supabase.from("sales").select("id,data,at")` sem filtro — baixa o histórico completo a cada login. Com meses de operação, o boot fica lento e caro.

**Solução proposta:** filtrar por janela (ex.: 90 dias) no bootstrap; relatórios de período maior consultam sob demanda.

**Resolução:** query de bootstrap agora filtra `.gte("at", <90 dias atrás>)`, com comentário explicando que relatórios de período maior devem consultar sob demanda.

### [TD004] Estoque como JSONB único em `config`

**Categoria:** Arquitetura · **Impacto:** Médio · **Esforço:** Alto · **Prioridade:** 🟡 Medium · **Status:** Resolvido (2026-07-04)

**Descrição:** o saldo de estoque vivia inteiro em `config.key='estoque'` como um objeto `{ [produtoId]: quantidade }`, atualizado via read-modify-write do objeto completo — sujeito a race condition entre dispositivos. Não havia mínimo por produto: UI e Jarvas usavam um limite "baixo" global hardcoded (10 unidades).

**Solução proposta:** tabela própria `estoque` (uma linha por produto, com mínimo próprio) e decremento atômico via RPC para a baixa por venda.

**Resolução:** criada `supabase/migrations/20260705_estoque_tabela.sql` — tabela `public.estoque` (`produto_id`, `quantidade`, `minimo`, `updated_at`) com RLS (leitura para authenticated; insert/update para caixa/gerente/admin; delete para gerente/admin) e RPC `baixar_estoque` (decremento atômico, `SECURITY DEFINER`, mesmo padrão de `limpar_reserva_mesa`). Backfill migra os dados do JSONB antigo e remove a key `estoque` de `config`. `AppContext.jsx` passou a ler/escrever na nova tabela (bootstrap, `updateEstoque`, `bulkSetEstoque`, novo `estoqueMinimos` e `setMinimoEstoque`, novo canal Realtime), mantendo o mesmo shape `{ [produtoId]: quantidade }` no state `estoque` para não quebrar os consumidores existentes. `PDVView` passou a descontar estoque na baixa de venda via nova função `baixarEstoque` (RPC atômica) em vez do loop `updateEstoque(prodId, atual - qty)`. `EstoqueView.jsx` e `jarvasEngine.js` trocaram o limite global de 10 pelo mínimo por produto (`estoqueMinimos`, fallback 10 quando não cadastrado), com edição do mínimo inline na tabela de estoque.

**Nota:** `supabase/schema.sql` declara `products.id` como `uuid`, mas a produção real usa `bigint` (já registrado em TD006) — a nova tabela `estoque.produto_id` usa `bigint` para bater com o banco real.

### [TD005] Zero testes automatizados

**Categoria:** Testes · **Impacto:** Alto · **Esforço:** Alto · **Prioridade:** 🟠 High · **Status:** Resolvido (2026-07-04)

**Descrição:** o projeto não tinha nenhum teste automatizado nem script `test`/`lint` no `package.json` — toda regressão em lógica pura (cálculo de pagamento, conversão de unidades, força de senha, regras do Jarvas) só era pega manualmente.

**Solução proposta:** criar a base de testes com Vitest, cobrindo primeiro as funções puras que carregam dinheiro e regra de negócio.

**Resolução:** instalado `vitest` (dev dependency) com `vitest.config.js` na raiz (`environment: "node"`, alias `@` igual ao do `vite.config.js`, `include: ["src/**/*.test.js"]`). Scripts `npm test` (`vitest run`) e `npm run test:watch` (`vitest`) adicionados ao `package.json`. Suítes criadas ao lado de cada arquivo testado:
- `src/utils/pagamentos.test.js` — `normalizarPagamentos`, `totalPorMetodo`, `totalTroco` (split de pagamento, precisão de centavos, método desconhecido, venda sem pagamentos).
- `src/utils/conversaoUnidades.test.js` — conversões de compra/consumo/estoque ida e volta, fator 1 e fracionário, unidade desconhecida, `fmtQtd`.
- `src/utils/crypto.test.js` — `passwordStrength` (todos os níveis) e `sanitizeInput` (remoção de caracteres perigosos, trim, limite de tamanho padrão e customizado).
- `src/lib/jarvasEngine.test.js` — motor de regras do Jarvas, com `@/lib/jarvas` e `@/lib/supabase` mockados via `vi.mock`. As funções de regra (`regraEstoque`, `regraDivergenciaCaixa`, `regraTendenciaVendas`, `regraPrevisaoRuptura`, `regraPrevisaoFaturamento`) foram exportadas de `jarvasEngine.js` (sem alterar lógica) para serem testáveis isoladamente. Cobre: alerta de ruptura vs sugestão de estoque baixo (mínimo por produto) vs nenhum insight; dedupe via `jaExiste`; divergência de caixa nas três faixas de severidade; tendência de vendas (alta/queda/volume insuficiente/itens cancelados ignorados); previsão de ruptura (risco/estoque folgado/sem vendas); previsão de faturamento (média correta ignorando a semana corrente parcial, histórico insuficiente).

**Resultado:** `npm test` — 55 testes, 4 arquivos, todos verdes (~3s). `npm run build` sem erros.

### [TD006] `supabase/schema.sql` defasado vs migrações

**Categoria:** Code Quality · **Impacto:** Médio (onboarding perigoso) · **Esforço:** Baixo · **Prioridade:** 🟡 Medium · **Status:** Resolvido (2026-07-04)

**Descrição:** `schema.sql` era escrito/editado à mão e ficou defasado: declarava `products.id` como `uuid` quando a produção usa `bigint` (quase causou um bug na migração do estoque, TD004), mantinha as policies antigas `"acesso_total"` (substituídas por policies por role na migração 20240107) e não continha tabelas criadas depois (`mesas`, `jarvas_eventos`, `jarvas_insights`, `estoque`, `operator_logs`, notas fiscais etc.).

**Solução proposta:** parar de editar `schema.sql` à mão; gerar/regenerar via `supabase db dump --schema public`, que reflete o banco real.

**Resolução (2026-07-04):** como o `supabase db dump` está bloqueado por falta de Docker, o schema foi extraído do banco de produção via SQL Editor (`information_schema.columns`, `pg_constraint`, `pg_policies`, `pg_proc`) e o `schema.sql` foi reconstruído fielmente a partir desse estado real: 22 tabelas com tipos/defaults corretos (`products.id` = **bigint**), constraints (PK/FK/UNIQUE/CHECK), índices, funções (referenciando as migrações com as definições) e o mapa completo de policies por role. Descobertas registradas no arquivo: `products` não tem mais as colunas legadas de compra; a tabela `logs` está **sem policies** (RLS nega tudo — legada, candidata a remoção); Realtime habilitado em `pending` e `estoque`.

**Regra daqui em diante:** `schema.sql` não é editado à mão — toda mudança nasce em `supabase/migrations/` e o arquivo é atualizado junto (ou regenerado via `supabase db dump -f supabase/schema.sql --schema public` quando houver Docker).

### [TD007] `dist/` commitado no repositório

**Categoria:** Code Quality · **Impacto:** Baixo · **Esforço:** Baixo · **Prioridade:** 🟢 Low · **Status:** Resolvido (2026-07-04)

**Descrição:** a pasta `dist/` (build gerado pelo Vite) estava commitada no repositório, apesar de já constar em `.gitignore` — arquivos gerados versionados junto com o código-fonte.

**Solução proposta:** remover `dist/` do índice do git, mantendo-o no disco e ignorado.

**Resolução:** `git rm -r --cached dist` — `dist/` segue no `.gitignore` (já estava lá) e agora aparece como untracked/ignorado após `npm run build`.

---

## Template de Item de Débito Técnico

```markdown
### [TDXXX] Título do Débito

**Categoria:** Arquitetura / Testes / Segurança / Performance / Dependências / Code Quality  
**Impacto:** Alto / Médio / Baixo  
**Esforço estimado:** Alto / Médio / Baixo  
**Prioridade:** 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low  
**Status:** Identificado | Em andamento | Resolvido  

**Descrição:**
[O que é o problema e onde está no código]

**Impacto atual:**
[Como isso afeta o produto, a equipe ou os usuários]

**Solução proposta:**
[Como poderia ser resolvido]

**Referências:**
[Arquivos, commits ou PRs relacionados]
```
