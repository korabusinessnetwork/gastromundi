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
| TD004 | Estoque como JSONB único em `config` (race conditions, sem histórico, limite global 10 hardcoded) | 🏗️ Arquitetura | Médio | Alto | 🟡 Medium | Identificado |
| TD005 | Zero testes automatizados; sem script `test`/`lint` no package.json | 🧪 Testes | Alto | Alto | 🟠 High | Identificado |
| TD006 | `supabase/schema.sql` defasado vs migrações (policies `acesso_total` já substituídas) | 🧹 Code Quality | Médio (onboarding perigoso) | Baixo | 🟡 Medium | Identificado |
| TD007 | `dist/` commitado no repositório | 🧹 Code Quality | Baixo | Baixo | 🟢 Low | Identificado |
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
