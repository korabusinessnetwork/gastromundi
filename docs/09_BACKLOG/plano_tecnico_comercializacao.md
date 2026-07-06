# Plano Técnico — Camada de Comercialização (Planos, Billing, Add-ons, Theming)

## Objetivo

Traduzir [ADR-005](../08_DECISOES/adr-005.md), [ADR-006](../08_DECISOES/adr-006.md) e [ADR-007](../08_DECISOES/adr-007.md) num roteiro de implementação por fases, revisável **antes** de qualquer código ser escrito.

## Como ler este documento

Cada fase lista: migrations, RPCs, arquivos de app a criar/alterar, e o que fica **fora** da fase (adiado). As fases são sequenciais — cada uma pressupõe a anterior pronta e testada. Implementa-se **uma fase por vez**, com revisão do founder entre uma e outra.

**Status atual: Fases 1 e 2 implementadas e aprovadas. Fase 3 (add-ons) ainda não iniciada.**

---

## Fase 1 — Fundação (`tenants` mínimo) — CONCLUÍDA

Pré-requisito de tudo: hoje não existe `tenant_id` em lugar nenhum (ADR-004: single-tenant real). Sem essa fundação, nenhuma RPC das fases seguintes tem o que consultar.

**Migration:** `supabase/migrations/20260716_tenants_minimo.sql`
- `CREATE TABLE public.tenants (id uuid PK default gen_random_uuid(), nome text, tema jsonb default '{}', created_at timestamptz default now())`
- `INSERT INTO public.tenants (nome) VALUES ('GastroMundi')` — a única linha, hoje.
- RLS: `tenants_select_auth` (qualquer autenticado lê; nesta fase, a única linha que existe).

**App:**
- `src/lib/tenant.js` (novo): `buscarTenantAtual()` — lê a única linha de `tenants` (select com colunas nomeadas, nunca `*`).
- `AppContext.jsx`: novo slice `tenant` (id, nome, tema) preenchido dentro do `bootstrap()` já existente, fire-and-forget na falha (não bloqueia o app se a leitura falhar — só fica sem os dados de tenant, com fallback ao nome/identidade atuais hardcoded).
- Nenhuma tela nova: esta fase não muda nada visível — só estabelece a base de dados e o carregamento.

**Fora desta fase:** qualquer coisa de multi-tenant real (várias linhas, `tenant_id` nas tabelas operacionais, membership usuário↔tenant). Isso é a decisão 002, trabalho futuro e maior, fora do escopo comercial imediato. Também fora: planos, add-ons, billing, theming — vêm nas fases seguintes.

**Testes:** `src/lib/tenant.test.js` (função pura de validação + mock de Supabase, seguindo o padrão de `src/lib/clientes.js`/`src/lib/relatorios.js`).

**Critério de pronto:** `SELECT * FROM tenants` retorna 1 linha; nenhuma tabela existente foi alterada; `npm test`/`npm run build` verdes; app continua funcionando exatamente igual (o slice `tenant` é consumido por ninguém ainda, além de estar disponível para as próximas fases).

---

## Fase 2 — Registro de planos e módulos (ADR-005, parte 1) — CONCLUÍDA

**Migration:** `supabase/migrations/20260717_planos_modulos.sql`
- `public.planos` + seed das 5 linhas (basico, simples, medio, alto, avancado) com `ordem` 1..5.
- `public.planos_modulos` + seed completo (repetindo módulos herdados, conforme ADR-005 §2).
- `tenants.plano_codigo` (default `'avancado'`) — o tenant real começa no plano mais alto, sem perder acesso a nada.
- Funções `public.tenant_tem_modulo(tenant_id, modulo)` e `public.tenant_atual_tem_modulo(modulo)` (conveniência para o single-tenant de hoje) — `SECURITY DEFINER`, `STABLE`.
- RLS: `planos`/`planos_modulos` só leitura pelo app.
- **Camada 2 (backend) implementada nesta fase, não adiada para a Fase 5:** políticas `RESTRICTIVE` de escrita (INSERT/UPDATE/DELETE) em `estoque`, `lancamentos` e `clientes` — os três módulos com tabela isolada e ausentes em algum tier. **Não gated nesta fase:** `products`/`pending`/`vendas`/`venda_itens`/`venda_pagamentos` (módulos-piso presentes em todo plano, gating seria só risco sem benefício) e `cozinha`/`mesas_comandas`/`pedidos`/`alertas` (sem tabela isolada seguramente separável do fluxo compartilhado de PDV/Palm nesta fase — registrados em `planos_modulos` para a Fase 3+ considerar).

**App:**
- `src/constants/modulos.js` (novo) — códigos de módulo únicos, evita string solta.
- `src/lib/tenant.js`: `buscarModulosDoPlano(planoCodigo)`, `buscarBootstrapTenant()` (combina tenant+módulos num único bootstrap), `moduloHabilitado(modulosDisponiveis, modulo)` (pura — fonte única de gating no front).
- `AppContext.jsx`: `tenant` ganha `planoCodigo`/`modulosDisponiveis`; novo `moduloHabilitado(modulo)` exposto via `useApp()`.
- `Sidebar.jsx`: item com permissão de papel OK mas módulo fora do plano aparece **visível e bloqueado** (convite a upgrade, não escondido) — modal explicando e sugerindo contato com o suporte.
- `PrivateRoute`/`routes/index.jsx`: `requiredModulo`/`moduloLabel` — quem navega direto pela URL vê `UpgradeNecessario` (tela amigável) em vez de a view quebrar ou redirecionar sem explicação.
- Módulos gated no front: `cardapio` (Produtos), `pdv`, `cozinha`, `clientes`, `relatorios`, `estoque`, `financeiro`. `configuracoes`/`admin` não são gated por plano (só por papel).

**Testes:** `src/lib/tenant.test.js` (12 casos: `buscarModulosDoPlano`, `buscarBootstrapTenant`, `moduloHabilitado` pura) + `src/components/desktop/Sidebar.test.jsx` (3 casos: todos os módulos visíveis no plano avançado; módulo fora do plano aparece bloqueado com convite a upgrade, não escondido; módulo do piso — PDV — nunca bloqueado). Suite completa: 173 testes verdes.

**Fora desta fase:** add-ons (Fase 3), billing (Fase 4), enforcement total de assinatura (Fase 5). O gating de módulo (RESTRICTIVE nas 3 tabelas citadas acima) já foi implementado nesta fase, adiantado em relação ao rascunho original — risco baixo e cobertura imediata de segurança real.

**Critério de pronto:** ✅ com o tenant seedado em `avancado`, o Sidebar mostra exatamente os mesmos itens de hoje (nenhuma regressão) — `npm test`/`npm run build` verdes.

---

## Fase 3 — Add-ons pagos (ADR-005, parte 2 — decisão 019)

**Migration:** `NNNNNNNN_addons.sql`
- `CREATE TABLE public.addons (...)` + seed (`nfe`, `tef`).
- `CREATE TABLE public.tenant_addons (...)`.
- Atualizar `tenant_tem_modulo(...)` para unir módulos do plano com módulos dos add-ons ativos do tenant.

**App:** nenhuma UI nova ainda (não há tela de contratar add-on nesta fase — isso é F017/F019 propriamente ditos, que já estão no backlog com seus próprios critérios). Esta fase só garante que a *fundação* de dados existe para quando F017/F019 forem implementadas.

**Testes:** `calcularModulosDisponiveis(plano, addonsAtivos)` pura, cobrindo: plano sem add-on, plano com add-on, add-on desativado não conta.

**Critério de pronto:** ativar manualmente um add-on via SQL para o tenant seed e confirmar que `modulos_disponiveis` no bootstrap passa a incluir o módulo do add-on, sem mexer em `plano_codigo`.

---

## Fase 4 — Billing: modelo de dados e ciclo (ADR-006, sem enforcement ainda)

**Decisões do founder incorporadas nesta fase** (ADR-006, Questões em Aberto resolvidas 2026-07-06): carência = **3 dias**; status de enforcement é **derivado na consulta** a partir de `data_vencimento`/`carencia_dias` (nunca depende de job); renovação **manual** nesta fase (sem gateway pago).

**Migration:** `NNNNNNNN_assinaturas.sql`
- `CREATE TABLE public.assinaturas (...)` (`carencia_dias INTEGER NOT NULL DEFAULT 3`) + `assinaturas_pagamentos (...)`.
- Seed: uma linha para o tenant existente, `status='ativo'` (cache), `data_vencimento` = hoje + 30 dias (dá um ciclo de folga para não quebrar produção no dia do deploy).
- Função pura `public.calcular_status_assinatura(p_data_vencimento date, p_carencia_dias integer, p_hoje date DEFAULT current_date) RETURNS text` — calcula `'ativo' | 'carencia' | 'bloqueado'` sem ler nenhuma coluna de cache (ver ADR-006 §3).
- RPC `public.sincronizar_status_assinatura(p_tenant_id uuid)` (`SECURITY DEFINER`) — chama a função pura acima e atualiza a coluna `status` (cache) se estiver desatualizada; chamada de forma **lazy** a partir do bootstrap (sem `pg_cron` nesta fase — decisão confirmada).
- RPC `public.confirmar_renovacao_assinatura(p_tenant_id, p_competencia, p_valor, p_metodo, p_confirmado_por)` — grava pagamento, empurra `data_vencimento`, volta status (cache) para `ativo`.

**App:**
- `src/lib/assinatura.js` (novo): `calcularStatusAssinatura(dataVencimento, carenciaDias, hoje)` (pura, espelha a função SQL, testável sem Supabase), `buscarStatusAssinatura()`, `confirmarRenovacao(...)` (chama a RPC).
- Bootstrap (`AppContext`) passa a incluir `assinatura: { status_efetivo, vencimento, avisoPreVencimento }` e dispara `sincronizar_status_assinatura` de forma fire-and-forget (não bloqueia o carregamento).
- Banner não bloqueante quando `avisoPreVencimento` (ex.: "Sua mensalidade vence em 3 dias").
- Tela administrativa simples (fora do escopo de UI do usuário final — só o dono/operador da plataforma acessa) para chamar `confirmar_renovacao_assinatura` manualmente após confirmar o pagamento fora do sistema.

**Testes:** `calcularStatusAssinatura` (pura — cobre ativo/carência/bloqueado nas fronteiras exatas de data), `calcularDiasParaVencimento`, sem side-effect no Postgres real.

**Fora desta fase:** bloqueio de verdade (Fase 5); gateway de pagamento (fora de escopo, adiado por custo).

**Critério de pronto:** `calcular_status_assinatura` retorna o status correto para datas simuladas nas três faixas (ativo/carência/bloqueado); nenhuma tela de usuário final ainda bloqueia nada.

---

## Fase 5 — Enforcement real (ADR-006 §3) — a fase que "vale" de verdade

**Decisão do founder incorporada:** bloqueio é **TOTAL** — sem exceção para leitura, login ou fechamento de caixa aberto.

**Migration:** `NNNNNNNN_enforcement.sql`
- `public.assinatura_ativa(p_tenant_id uuid) RETURNS boolean` (`SECURITY DEFINER`, `STABLE`) — busca `data_vencimento`/`carencia_dias`, chama `calcular_status_assinatura(...)` e retorna `true` só se `'ativo'` ou `'carencia'` (e `false` sempre que a coluna `status` já estiver `'cancelado'` manualmente). **Nunca lê a coluna `status` para os casos ativo/carência/bloqueado** — sempre recalcula.
- Alterar as políticas `WITH CHECK`/`USING` de **todas as operações** (leitura incluída, por decisão de bloqueio total) das tabelas operacionais (`vendas`, `venda_itens`, `venda_pagamentos`, `pending`, `lancamentos`, e demais tabelas por módulo tocadas nas Fases 2-3) para incluir `AND public.assinatura_ativa(<tenant_id resolvido>)`.

**App:**
- `PrivateRoute`/`DesktopLayout`: se `assinatura.status_efetivo === 'bloqueado'`, renderiza tela cheia "Sua mensalidade está atrasada" (com instrução de como regularizar) em vez de qualquer rota — **inclusive antes do login ser considerado concluído**, sem exceção.

**Testes:** teste de componente simulando `assinatura.status_efetivo = 'bloqueado'` e confirmando que a tela de bloqueio aparece e nenhuma rota operacional é alcançável; não há como testar RLS real em Vitest — validar manualmente no Supabase Studio (SQL Editor) simulando o JWT do tenant bloqueado antes de considerar a fase pronta.

**Critério de pronto:** com o tenant seed com `data_vencimento` no passado (além da carência), uma tentativa de `select`/`insert` em `vendas` via SQL Editor autenticado como esse tenant **falha** com erro de política, **mesmo sem nenhum job/bootstrap ter rodado antes** — essa é a prova de que o enforcement é real e não depende de sincronização prévia.

---

## Fase 6 — Theming/white-label (ADR-007)

**Migration:** já coberta pela coluna `tenants.tema jsonb` da Fase 1 — nenhuma migration nova aqui, a menos que se decida por armazenamento de logo via Supabase Storage (então precisa de bucket + política de acesso).

**App:**
- `src/styles/tema.css` (novo) com os custom properties default.
- Efeito de boot (`AppContext` ou `main.jsx`) que injeta `<style id="gm-tenant-theme">` com os overrides de `tenant.tema`.
- Início da migração de `src/constants/colors.js` para apontar para os mesmos valores dos custom properties (fonte única), sem quebrar os consumidores atuais de `C.accent` etc.
- Nenhuma tela existente é migrada para `.css` externo nesta fase — isso é o trabalho de F018, que tem seu próprio backlog/critérios e pode ser feito incrementalmente, tela por tela, depois que o padrão estiver validado em pelo menos um componente novo (já há um precedente: `DesempenhoReport.css`, F011).

**Fora desta fase:** paleta completa customizável, upload de logo pela própria UI (fica manual/admin nesta fase, se necessário).

**Critério de pronto:** trocar `tenants.tema.accent` manualmente via SQL e ver a cor de destaque mudar no app sem rebuild.

---

## Resumo de arquivos (visão geral, todas as fases)

**Migrations novas** (`supabase/migrations/`): tenants mínimo, planos+módulos, add-ons, assinaturas, enforcement — 5 arquivos, todas aditivas (não alteram tabelas existentes além de novas colunas/políticas).

**`src/lib/` novo:** `tenant.js`, `assinatura.js` (cada um com seu `.test.js` de funções puras).

**Alterados:** `AppContext.jsx` (novo slice `tenant`), `Sidebar.jsx` e `routes/index.jsx` (filtro por módulo), `PrivateRoute` (bloqueio de assinatura), `src/constants/colors.js` (aponta para tokens).

**Novo (theming):** `src/styles/tema.css`.

---

## Questões em Aberto — status

**Resolvidas pelo founder em 2026-07-06** (ver ADR-006 para o texto completo):
1. Bloqueio total vs. parcial → **total**.
2. Dias de carência → **3 dias**.
3. Mecanismo de agendamento → **checagem lazy no bootstrap**, sem `pg_cron`; enforcement sempre recalculado na consulta, nunca dependente do job.
4. Leitura de "Custo: construir toda a lógica agora com [...]" → **confirmada**: lógica completa agora (free tier), gateway de pagamento adiado, renovação manual nesta fase.

**Ainda em aberto (não bloqueiam a Fase 1, revisitar antes da Fase 6):**
5. Se e quando entra upload de logo pela própria UI vs. manual (ADR-007).

## Referências

- [ADR-005](../08_DECISOES/adr-005.md), [ADR-006](../08_DECISOES/adr-006.md), [ADR-007](../08_DECISOES/adr-007.md)
- `docs/09_BACKLOG/features.md` (F013, F015, F016, F017, F018, F019)
- `docs/05_FLUXOS/billing-flow.md`
- `memory/decisions.md`, `memory/restrictions.md`
