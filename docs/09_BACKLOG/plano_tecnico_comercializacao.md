# Plano Técnico — Camada de Comercialização (Planos, Billing, Add-ons, Theming)

## Objetivo

Traduzir [ADR-005](../08_DECISOES/adr-005.md), [ADR-006](../08_DECISOES/adr-006.md) e [ADR-007](../08_DECISOES/adr-007.md) num roteiro de implementação por fases, revisável **antes** de qualquer código ser escrito.

## Como ler este documento

Cada fase lista: migrations, RPCs, arquivos de app a criar/alterar, e o que fica **fora** da fase (adiado). As fases são sequenciais — cada uma pressupõe a anterior pronta e testada. Implementa-se **uma fase por vez**, com revisão do founder entre uma e outra.

**Status atual: Fases 1-5 implementadas (billing fechado). Fase 6 (theming/white-label) ainda não iniciada — aguardando revisão do founder.**

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

## Fase 3 — Add-ons pagos: NF-e e TEF (ADR-005 §3, decisão 019) — CONCLUÍDA

**Migration:** `supabase/migrations/20260718_addons.sql`
- `public.addons` (seed: `nfe`, `tef`) + `public.tenant_addons` (tenant_id, addon_codigo, ativo, ativado_em) — **eixo ortogonal ao plano**, não uma extensão de `planos_modulos`: um tenant no plano Básico pode ter `nfe` ativo.
- `tenant_atual_tem_addon(addon)` (`SECURITY DEFINER`, `STABLE`) — mesma convenção de `tenant_atual_tem_modulo` (Fase 2), pronta para RLS futura quando NF-e/TEF passarem a persistir dados reais (hoje são só stubs, nada é gravado além de um evento no Jarvas).
- Nenhuma linha inserida em `tenant_addons` para o tenant atual — nenhum add-on ativo por padrão, pagamento idêntico a antes desta fase.

**App:**
- `src/constants/addons.js` (novo) — códigos de add-on (`NFE`, `TEF`).
- `src/lib/tenant.js`: `buscarAddonsAtivos(tenantId)`, `addonHabilitado(addonsAtivos, addon)` (pura — fonte única, equivalente a `moduloHabilitado` mas sem depender de plano); `buscarBootstrapTenant()` agora também retorna `addonsAtivos`.
- `AppContext.jsx`: `addonHabilitado(addon)` exposto via `useApp()`.
- `src/lib/fiscal.js` (novo) — `emitirDocumentoFiscal(venda, opts)`: **stub**, registra um evento (`fiscal.documento_simulado`) via o Event Bus do Jarvas em vez de chamar um provedor. O comentário no código marca exatamente onde o provedor real (Focus NFe, PlugNotas etc.) entra depois — mesma assinatura, sem mexer em quem chama.
- `src/lib/tef.js` (novo) — `processarPagamentoTef(pagamento, opts)`: **stub** análogo (evento `tef.pagamento_simulado`), mais `isPagamentoCartao(metodo)` (pura) para restringir TEF a crédito/débito. Mesmo comentário de ponto de extensão para o provedor real (SiTef, PayGo etc.).
- `src/components/desktop/views/PDVView/useFinalizarPagamento.js`: depois da venda gravada, dois blocos fire-and-forget novos (mesmo padrão do bloco do Financeiro já existente) — só executam se `addonHabilitado('nfe')`/`addonHabilitado('tef')`; sem o add-on, nenhum dos dois módulos sequer é chamado.

**Testes:** `tenant.test.js` (+8 casos: `buscarAddonsAtivos`, `addonHabilitado`, `buscarBootstrapTenant` com add-ons); `fiscal.test.js` (3 casos) e `tef.test.js` (9 casos) novos; `useFinalizarPagamento.test.jsx` (+5 casos: sem add-on nada dispara, `nfe` habilitado dispara o stub fiscal, `tef` habilitado dispara o stub só em cartão, `tef` habilitado não dispara em dinheiro/pix, falha do add-on nunca quebra a venda). Suite completa: 195 testes verdes.

**Fora desta fase:** UI de contratação/ativação de add-on (isso é F017/F019 propriamente ditos, com seus próprios critérios de aceite); qualquer provedor fiscal/TEF pago (Restrições de Custo — hooks nativos prontos, integração real adiada); RLS de escrita ligada a `tenant_atual_tem_addon` (não há tabela de dados reais para proteger ainda, só o evento no Jarvas).

**Critério de pronto:** ✅ com nenhum add-on ativo (estado real do tenant hoje), o fluxo de pagamento é idêntico a antes desta fase — `npm test`/`npm run build` verdes.

---

## Fase 4 — Billing: modelo de dados e ciclo (ADR-006, sem enforcement ainda) — CONCLUÍDA

**Decisões do founder incorporadas nesta fase** (ADR-006, Questões em Aberto resolvidas 2026-07-06): carência = **3 dias**; status é **derivado na consulta** a partir de `data_vencimento`/`carencia_dias` (nunca depende de job); renovação **manual** nesta fase (sem gateway pago).

**Migration:** `supabase/migrations/20260719_assinaturas.sql`
- `public.assinaturas` (`carencia_dias` default 3, `status` como CACHE — nunca a fonte de verdade) + `public.assinaturas_pagamentos` (histórico de renovações).
- Seed: uma linha para o tenant existente, `status='ativo'`, `data_vencimento` = hoje + 30 dias, `valor_mensal = 0` (placeholder — ajustar antes de cobrar qualquer cliente real).
- `public.calcular_status_assinatura(data_vencimento, carencia_dias, hoje)` — função SQL **pura**, mesma lógica espelhada em `src/lib/assinatura.js`.
- `public.sincronizar_status_assinatura(tenant_id)` (`SECURITY DEFINER`) — atualiza só o CACHE; chamada lazy no bootstrap, nunca decide o que é exibido (isso já vem calculado do client).
- `public.confirmar_renovacao_assinatura(tenant_id, competencia, valor, metodo, confirmado_por)` (`SECURITY DEFINER`, restrito a gerente/admin) — grava o pagamento manual e empurra o vencimento por um ciclo.

**App:**
- `src/lib/assinatura.js` (novo): `calcularStatusAssinatura`/`calcularDiasParaVencimento` (puras, espelham a função SQL), `buscarAssinaturaAtual`, `sincronizarStatusAssinatura`, `confirmarRenovacaoAssinatura`.
- `src/lib/tenant.js`: `buscarBootstrapTenant()` agora também retorna `assinatura: { status, diasParaVencer, carenciaDias, valorMensal, dataVencimento }` — status **já calculado localmente**, não é o cache do banco.
- `AppContext.jsx`: expõe `assinatura` via `useApp()`; dispara `sincronizarStatusAssinatura` fire-and-forget após o bootstrap (só mantém o cache administrativo em dia, não afeta o que é exibido).
- `src/components/desktop/AssinaturaBanner.jsx` + `.css` (decisão 018): banner não bloqueante — aviso pré-vencimento (≤5 dias, ainda ativo), aviso de carência (com dias restantes) e aviso de bloqueado (só texto, nada impede nada); visível **só para gerente/admin** (evita jargão de faturamento para quem opera o caixa).
- Renovação manual: a RPC + `confirmarRenovacaoAssinatura` existem e estão testadas, mas **não construí uma tela de administração dedicada nesta passada** (o pedido permitia "documentada como manual" como alternativa) — hoje a renovação é chamada via SQL Editor/RPC direta; uma tela fica para quando fizer sentido priorizar.

**Testes:** `assinatura.test.js` (19 casos — fronteiras exatas: véspera do vencimento, dia do vencimento, 1 dia de carência, último dia de carência, 1 dia após esgotar a carência, carência=0); `tenant.test.js` (+3 casos, assinatura incluída no bootstrap); `AssinaturaBanner.test.jsx` (6 casos); `useFinalizarPagamento.test.jsx` (+1 caso: venda finalizada normalmente mesmo com assinatura `bloqueado` — prova de que Fase 4 não bloqueia nada). Suite completa: 222 testes verdes.

**Fora desta fase:** bloqueio de verdade (Fase 5); gateway de pagamento (fora de escopo, adiado por custo); tela de administração para renovação (ver nota acima).

**Critério de pronto:** ✅ `calcular_status_assinatura`/`calcularStatusAssinatura` retornam o status correto nas fronteiras exatas; o tenant atual está `ativo` com vencimento em 30 dias; nenhuma escrita foi impedida (testado explicitamente) — `npm test`/`npm run build` verdes.

---

## Fase 5 — Enforcement real (ADR-006 §4) — a fase que "vale" de verdade — CONCLUÍDA

**Decisão do founder incorporada:** bloqueio é **TOTAL** — leitura E escrita das tabelas operacionais falham quando `bloqueado`.

**Migration:** `supabase/migrations/20260720_assinatura_enforcement.sql`
- `public.assinatura_ativa(p_tenant_id uuid)` (`SECURITY DEFINER`, `STABLE`) — busca `data_vencimento`/`carencia_dias`, chama `calcular_status_assinatura(...)` (Fase 4) e retorna `true` só se `'ativo'`/`'carencia'` (e `false` sempre que `status` já estiver `'cancelado'` manualmente, ou `true` se o tenant nem tem linha em `assinaturas` — ausência de billing configurado não é inadimplência). **Nunca lê a coluna `status` para decidir ativo/carência/bloqueado** — sempre recalcula.
- `public.assinatura_atual_ativa()` — conveniência para o único tenant de hoje (mesma convenção de `tenant_atual_tem_modulo`/`tenant_atual_tem_addon`).
- Políticas `RESTRICTIVE` (SELECT + INSERT + UPDATE + DELETE) geradas via `DO` block/loop em 12 tabelas: `sales`, `vendas`, `venda_itens`, `venda_pagamentos`, `pending`, `lancamentos`, `estoque`, `clientes`, `products`, `fechamentos`, `config`, `mesas`. Somam-se (AND) às políticas de papel/módulo já existentes — não as substituem.
- **Deliberadamente fora do enforcement** (ver comentário completo na migration): `tenants`/`assinaturas` (precisam continuar legíveis para o app saber que está bloqueado); `users` (precisa continuar legível para a autenticação resolver o usuário — bloquear geraria "usuário não encontrado" em vez de "mensalidade atrasada", uma mensagem enganosa); `planos`/`planos_modulos`/`addons`/`tenant_addons` (lookup, nunca foram gated); `jarvas_eventos`/`jarvas_insights`/`operator_logs` (telemetria/auditoria — decisão 010, Jarvas nunca bloqueia); tabelas de cadastro secundário (fichas técnicas, impressão, fiscal por produto) — fora de escopo desta passada.

**App:**
- `src/lib/assinatura.js`: `assinaturaPermiteOperacao(status)` (pura, espelha a checagem SQL — só para a UI decidir o que mostrar).
- `PrivateRoute.jsx`: se `assinatura.status` não permite operar, renderiza `AssinaturaBloqueada` (tela cheia) **antes** de qualquer checagem de permissão/módulo — cobre toda rota (pdv, produtos, financeiro, /palm etc.) num só lugar. Isso acontece **depois** do login (não durante) — decisão consciente: `users` fica de fora do enforcement de RLS justamente para a autenticação funcionar e o app chegar a esse ponto para mostrar o aviso certo, em vez de travar o login com uma mensagem errada.
- `src/components/desktop/AssinaturaBloqueada.jsx` + `.css` (decisão 018) — tela clara, sem jargão, com orientação de como regularizar.

**Testes:** `assinatura.test.js` (+6 casos: `assinaturaPermiteOperacao` para os 4 status + status ausente + integração com renovação revertendo o bloqueio); `PrivateRoute.test.jsx` (novo, 6 casos: ativo/carência liberam, bloqueado impede mesmo com permissão/módulo OK, bloqueado tem prioridade sobre convite a upgrade, assinatura `null` não bloqueia por engano, não-autenticado sempre vai pro login independente da assinatura). RLS real não é testável em Vitest — validado pela leitura cuidadosa da migration e pelo mesmo padrão já usado nas Fases 2/3; recomenda-se uma conferência manual no SQL Editor antes de considerar produção (simular tenant com `data_vencimento` vencida e confirmar que um `select`/`insert` em `vendas` falha). Suite completa: 234 testes verdes.

**Critério de pronto:** ✅ com o tenant seed `ativo` e vencimento futuro (estado real de hoje), `assinatura_atual_ativa()` retorna `true` e nada muda na operação; a lógica de bloqueio (`assinaturaPermiteOperacao`) está testada nas mesmas fronteiras da Fase 4 — `npm test`/`npm run build` verdes.

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
