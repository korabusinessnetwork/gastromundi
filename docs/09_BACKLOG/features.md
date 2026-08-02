# Features — Backlog — GastroMundi

## Objetivo
Registrar todas as features planejadas para o GastroMundi, com descrição, prioridade, status e referência às regras de negócio correspondentes.

## Contexto
Features são novas capacidades do produto. Toda feature deve ter suas regras de negócio documentadas antes de entrar em desenvolvimento. Este arquivo é o inventário de features — não substitui ferramentas de gestão de projeto.

## Regras Gerais
- Feature sem regras de negócio documentadas não pode entrar em sprint
- Features devem ter critérios de aceite claros antes do desenvolvimento
- Features grandes devem ser quebradas em incrementos entregáveis menores
- Features canceladas devem ser marcadas como `Cancelado` com motivo

## Validações
- Critérios de aceite devem ser verificáveis e mensuráveis
- Dependências entre features devem ser documentadas

## Permissões
- Qualquer membro pode propor features
- Product owner define prioridade e aprova entrada em sprint

## Exceções
- Features de segurança crítica podem ser priorizadas sem processo padrão

## Auditoria
- Status de cada feature deve ser mantido atualizado
- Features concluídas devem ser marcadas com data de entrega

## Eventos
- `feature.proposed` — feature proposta
- `feature.approved` — feature aprovada para desenvolvimento
- `feature.shipped` — feature entregue em produção
- `feature.cancelled` — feature cancelada

## Configurações Futuras
- Vincular features a métricas de negócio (OKRs)
- Criar roadmap visual a partir deste backlog

## Casos de Uso
- Planejamento de sprint
- Comunicação de roadmap para stakeholders
- Priorização de desenvolvimento

## Critérios de Aceite
- [ ] Todas as features têm prioridade e status
- [ ] Features com status "Em desenvolvimento" têm critérios de aceite definidos
- [ ] Features concluídas têm data de entrega registrada

---

> Roadmap de produto direcional em `memory/identity.md`. As fases abaixo refletem esse roadmap.

## MVP — Núcleo operacional (Fase 1)

| # | Feature | Prioridade | Status | Regras | Notas |
|---|---------|-----------|--------|--------|-------|
| F001 | Autenticação + multi-tenant (estabelecimento, papéis) | 🔴 Critical | ✅ Entregue (conferido 2026-08-02) | [auth-flow.md](../05_FLUXOS/auth-flow.md) · decisões 002/008 | Login/sessão em `src/context/AppContext.jsx` + `src/routes/PrivateRoute.jsx`/`ConsoleRoute.jsx`; papéis por cargo em `20260828_permissoes_por_cargo_e_funcionario.sql`; isolamento por tenant nas levas `20260723`–`20260726` (coluna `tenant_id` com DEFAULT `tenant_atual_id()` + policy RESTRICTIVE), escopo de `users` em `20260739`, PK composta por tenant em `20260738` |
| F002 | Onboarding (criar estabelecimento, produtos) | 🟠 High | ✅ Entregue (conferido 2026-08-02) | [onboarding-flow.md](../05_FLUXOS/onboarding-flow.md) | Estabelecimento nasce no Console (`src/components/console/NovoEstabelecimentoModal.jsx` → `provisionar_tenant`, `20260727`/`20260741`, já com assinatura em `20260908`); catálogo entra por arquivo ou foto do cardápio (`ImportarExportarTab.jsx`, edge functions `importar-dados` e `ler-cardapio-ia`) |
| F003 | Cadastro de produtos / cardápio | 🔴 Critical | ✅ Entregue (conferido 2026-08-02) | [ESTOQUE.md](../03_REGRAS_DE_NEGOCIO/ESTOQUE.md) | Pré-requisito do PDV. `ProdutosView.jsx`, `SubprodutosView.jsx` e `CombosView.jsx` (combo multi-produto em `20260726_combo_produtos.sql`); validade por produto em `20260731_produtos_validade.sql` |
| F004 | **PDV — venda (transação-fonte)** | 🔴 Critical | ✅ Entregue (conferido 2026-08-02) | [PDV.md](../03_REGRAS_DE_NEGOCIO/PDV.md) | Coração da operação. `src/components/desktop/views/PDVView/` (com `useFinalizarPagamento.js` testado) e `src/pages/mobile/modulos/pdv/`; venda normalizada em `vendas`/`venda_itens`/`venda_pagamentos` (`20260707_vendas_normalizadas.sql`) |
| F005 | Caixa — abertura/fechamento/sangria | 🔴 Critical | Parcial — abertura/fechamento entregues, **sangria não existe** | [CAIXA.md](../03_REGRAS_DE_NEGOCIO/CAIXA.md) | Abrir/fechar pela `Sidebar` (`AberturaCaixaModal`/`FechamentoModal`, cobertos em `DesktopLayout.test.jsx`), sessão de caixa em `20260744_config_caixa_sessao.sql`. **Falta:** sangria/suprimento — busca por `sangria` em `src/` e `supabase/migrations/` (2026-08-02) não retorna nada; retirada de dinheiro do caixa hoje só existe como lançamento no F009 |
| F006 | Pedidos — ciclo de vida | 🟠 High | ✅ Entregue (conferido 2026-08-02) | [PEDIDOS.md](../03_REGRAS_DE_NEGOCIO/PEDIDOS.md) | Comanda em `pending` (lançar/transferir/cancelar em `PDVView/` e `src/pages/MobilePage.jsx`); produção no KDS (`CozinhaView.jsx`, `20260711_cozinha_kds.sql`); delivery tem máquina de status própria (`20260815_delivery_status_guard.sql`) |

## Backlog — Roadmap por fase

| # | Feature | Prioridade | Status | Regras | Fase |
|---|---------|-----------|--------|--------|------|
| F007 | Cozinha (KDS) | 🟠 High | ✅ Entregue (conferido 2026-08-02) | [COZINHA.md](../03_REGRAS_DE_NEGOCIO/COZINHA.md) | 2 — Produção. `CozinhaView.jsx` (`20260711_cozinha_kds.sql`); impressão por estação em `20260823_estacoes_impressao.sql`/`20260824_trabalhos_impressao.sql` |
| F008 | Estoque — baixa automática + alertas | 🟠 High | ✅ Entregue (conferido 2026-08-02) | [ESTOQUE.md](../03_REGRAS_DE_NEGOCIO/ESTOQUE.md) | 2 — Produção. Tabela própria em `20260705_estoque_tabela.sql`, mínimo por produto em `20260712_estoque_alerta_minimo.sql`, baixa idempotente em `20260830_idempotencia_baixa_estoque.sql` e entrada atômica em `20260901_entrada_estoque_atomica.sql`; falha de baixa vira alerta do gestor em `src/lib/estoque.js` (TD012) |
| F009 | Financeiro — contas, fluxo de caixa | 🟡 Medium | ✅ Entregue (conferido 2026-08-02) | [FINANCEIRO.md](../03_REGRAS_DE_NEGOCIO/FINANCEIRO.md) | 3 — Gestão. `20260710_financeiro.sql` + `FinanceiroView.jsx` e `views/financeiro/` (lançamentos, resumo, período) |
| F010 | Clientes — cadastro, histórico, fiado | 🟡 Medium | ✅ Entregue (conferido 2026-08-02) | [CLIENTES.md](../03_REGRAS_DE_NEGOCIO/CLIENTES.md) | 3 — Gestão. `20260713_clientes.sql` + `ClientesView.jsx`; documento do cliente em `20260825_clientes_documento.sql`; fiado no fechamento (`PDVView/ClienteFiadoSelector.jsx`) |
| F011 | Relatórios — vendas, margem, desempenho | 🟡 Medium | ✅ Entregue (conferido 2026-08-02) | [RELATORIOS.md](../03_REGRAS_DE_NEGOCIO/RELATORIOS.md) | 3 — Gestão. `20260714_relatorio_vendas.sql` + `views/relatorio/` (diário, fechamento, desempenho, logs) e exportação em `src/lib/exportReport.js` |
| F012 | Jarvas — IA transversal (insights/alertas) | 🟡 Medium | ✅ Entregue (conferido 2026-08-02) | [JARVAS.md](../03_REGRAS_DE_NEGOCIO/JARVAS.md) | 4 — Inteligência. `20260703_jarvas.sql` + `src/lib/jarvasEngine.js` e `JarvasPanel.jsx`; assistente na edge function `jarvas-assistente` (resumo por SQL em `20260709`), teto de uso de IA em `20260817_ia_uso_rate_limit.sql` |
| F013 | Assinatura/planos do GastroMundi (5 tiers: Básico/Simples/Médio/Alto/Avançado, decisão 020) — gating por módulo, registro central | 🟠 High | ✅ Entregue (conferido 2026-08-02) | [billing-flow.md](../05_FLUXOS/billing-flow.md) · [ADR-005](../08_DECISOES/adr-005.md) · [plano_tecnico_comercializacao.md](./plano_tecnico_comercializacao.md) | Transversal — fase inicial não depende de gateway (renovação manual, ver ADR-006). `20260717_planos_modulos.sql` (5 tiers + módulos por plano) e `20260718_addons.sql`; gating por módulo no `AppContext` (coberto em `AppContext.gating.test.jsx`) com `UpgradeNecessario.jsx` na tela; troca de plano pelo Console em `20260729_alterar_plano_tenant.sql` |
| F014 | Escala — multi-loja, fiscal, integrações (delivery/pagamentos) | 🟢 Low | Parcial — multi-loja e delivery entregues; pagamentos abertos | — | 5 — Escala. Multi-loja é o multi-tenant do F001 (levas `20260723`–`20260726`); delivery é módulo próprio, não integração de terceiro (`20260804_delivery_fundacao.sql` + `src/pages/delivery/` + `DeliveryView.jsx`); fiscal tem código nativo (ver F019). **Falta:** integração de pagamento (TEF/gateway), que é F017 e depende de custo |
| F015 | Layouts de impressão (comprovante de pagamento, via de produção/cozinha, cupom/pré-nota) — templates configuráveis por estabelecimento (white-label, decisão 017) | 🟠 High | ✅ Concluído (2026-07-06) | [COZINHA.md](../03_REGRAS_DE_NEGOCIO/COZINHA.md) · [ADR-007](../08_DECISOES/adr-007.md) | `src/lib/impressao.js`/`src/lib/impressao/renderizar.js` (browser print, sem serviço pago); routing por categoria/local (`views/impressao/`) segue como config, ainda não consumido pela impressão em si; cupom/pré-nota já nasce pronto para o F019 (add-on fiscal) plugar em cima. Adaptabilidade por impressora entregue em F020 |
| F020 | Layouts de impressão ADAPTÁVEIS por impressora — perfil configurável (largura 58/80mm, margem, corte, fonte) + driver de impressão TROCÁVEL (decisão 025): `browser-raster` (default gratuito) e `escpos-qztray` (substituível, QZ Tray já integrado). Estende o F015 | 🟠 High | ✅ Concluído (2026-07-06) | [ADR-007](../08_DECISOES/adr-007.md) · [decisão 025](../../memory/decisions.md) | `src/lib/impressao/largura.js`/`escposFormatador.js`/`drivers/` (testados por código); `views/impressao/PerfilImpressora.jsx` (UI + preview). **Pendente de teste físico**: corte de guilhotina real, densidade ESC/POS por modelo — só validável em impressora térmica real |
| F016 | Enforcement de assinatura (billing counter) — vigência por ciclo pago (ex.: 30 dias); ao vencer sem renovação, **bloquear o sistema** com mensagem "Sua mensalidade está atrasada". Inclui período de carência/grace e aviso pré-vencimento. Complementa/estende F013 | 🔴 Critical | ✅ Entregue (conferido 2026-08-02) | [billing-flow.md](../05_FLUXOS/billing-flow.md) · [ADR-006](../08_DECISOES/adr-006.md) · [plano_tecnico_comercializacao.md](./plano_tecnico_comercializacao.md) | Transversal — depende de F013; gateway de pagamento adiado por custo, renovação manual na fase inicial. `20260719_assinaturas.sql` + `20260720_assinatura_enforcement.sql`; na tela, `AssinaturaBanner.jsx` (aviso pré-vencimento) e `AssinaturaBloqueada.jsx` (bloqueio), com `src/lib/assinatura.js` e `MinhaAssinaturaTab.jsx`; renovação só pela plataforma em `20260909_renovacao_assinatura_so_plataforma.sql` |
| F017 | Integração TEF (pagamento por maquininha/terminal — cartão débito/crédito integrado ao PDV) | 🟠 High | Parcial — hook nativo entregou (`src/lib/tef.js`), provedor pago adiado | [PDV.md](../03_REGRAS_DE_NEGOCIO/PDV.md) · [ADR-005](../08_DECISOES/adr-005.md) | **Add-on pago transversal** (decisão 019): disponível em TODOS os planos por valor adicional, não é recurso de tier. Código **nativo** (hook no PDV) desde já; provedor TEF pago (SiTef/PayGo) é o que se adia por custo. A **contratação** já é operável: o Console liga/desliga o add-on por estabelecimento (`alternar_addon_tenant`, 20260915) e a própria tela avisa que nenhuma maquininha está integrada — o PDV só simula a aprovação |
| F019 | Emissão de nota fiscal no pagamento (NFC-e/NF-e) — **add-on pago transversal** (decisão 019): opção em TODOS os planos por valor adicional. Hook nativo no fluxo de pagamento; layouts em F015 | 🟠 High | Parcial — emissão nativa entregue, certificado A1 + CSC adiados por custo | [PDV.md](../03_REGRAS_DE_NEGOCIO/PDV.md) · [FINANCEIRO.md](../03_REGRAS_DE_NEGOCIO/FINANCEIRO.md) · [ADR-005](../08_DECISOES/adr-005.md) | Emissão, cancelamento, inutilização e reenvio já existem como edge functions (`supabase/functions/emitir-nfce`, `cancelar-nfce`, `inutilizar-nfce`, `reenviar-nfce`) sobre `20260733_nfce_emitidas.sql` e `20260736_nfce_inutilizacoes.sql`, com `src/lib/fiscal.js`, `NotasFiscaisTab.jsx` e `ImpostosAdmin.jsx` na tela. Código nativo desde já; provedor fiscal pago é o que se adia por custo (ver Restrições de Custo). A **contratação** já é operável: o Console liga/desliga o add-on por estabelecimento (`alternar_addon_tenant`, 20260915) e a própria tela avisa que a emissão só sai depois do certificado A1 e do CSC do estabelecimento no servidor (decisão 026) |
| F022 | **Console da plataforma (super-admin / dono do SaaS)** — página com login próprio e papel cross-tenant (decisão 027): criar estabelecimentos (onboarding), definir plano/add-ons por tenant, conceder/estender tempo de assinatura, configurar fiscal por tenant (decisão 026), ver billing de todos os tenants. Separado e mais protegido que o admin do cliente | 🔴 Critical (bloqueia venda) | ✅ Entregue (2026-08-02) — escopo próprio completo; segue **1 pendência de decisão do dono** (cortesia, ver Notas). Login próprio, criar estabelecimento, alterar plano, definir mensalidade, alterar layout, dashboard de planos, **registrar pagamento da assinatura**, o **histórico de pagamentos com cancelamento de lançamento errado**, a aba **uso e faturamento por estabelecimento** (2026-08-01) e o **liga/desliga dos add-ons pagos por estabelecimento** (2026-08-02) — código em `src/pages/console/` + `src/components/console/` | [sprint_pre_venda.md](./sprint_pre_venda.md) · [decisão 027](../../memory/decisions.md) | Papel `plataforma`/`super_admin` cross-tenant. O override `OR auth.is_super_admin()` vale **só** nas tabelas que o Console lê agregado (`tenants`, `assinaturas`) — tabela operacional **não** tem esse ramo (ADR-008, decisão v2 nº 2), e o que o Console precisa dela vem por RPC `SECURITY DEFINER` que devolve agregado (ex.: `analytics_plataforma`, 20260912) — e toda ESCRITA em assinatura passa por RPC `SECURITY DEFINER` com guarda de super-admin, nunca por policy (ex.: `estornar_pagamento_assinatura`, 20260913). Superfície mais sensível do sistema — auth forte. Código em `src/pages/console/` + `src/components/console/`. **Falta:** nada de escopo próprio do Console — a configuração fiscal por tenant (decisão 026) **não é dele**: já existe do lado do estabelecimento em `PainelFiscal` gravando `tenant_fiscal_config` (20260731), e o que sobra (certificado A1 + valor do CSC no servidor) é o F019/S1-4, que depende de custo. Add-ons por tenant entregues (`alternar_addon_tenant`, 20260915 + `AddonsModal`), no mesmo desenho: sem policy de escrita em `tenant_addons`, tudo pela RPC. **Código entregue ≠ rodando em produção:** as migrations `20260912` (analytics), `20260913` (estorno), `20260914` (identidade) e `20260915` (add-ons) dependem de execução manual no SQL Editor — enquanto não rodarem, a tela correspondente responde `function ... does not exist`. **Pendência de decisão:** estabelecimento de cortesia (`valor_mensal = 0`) não consegue renovar — a RPC `confirmar_renovacao_assinatura` recusa `p_valor <= 0` no banco, então cortesia hoje só se sustenta com data de vencimento longa |
| F021 | **PDV offline-first (PWA)** — vendas continuam sendo lançadas sem internet, gravando local (IndexedDB via Dexie) e sincronizando com o Supabase ao reconectar. Fila `outbox` local + replay idempotente por UUID de cliente; badge de status 🟢 Online / 🟡 Offline (N pendentes) / 🔵 Sincronizando (Princípio nº1). Custo **zero** (Dexie/vite-plugin-pwa/Workbox, MIT; IndexedDB nativo). Diferencial de venda do SaaS (concorrentes cobram caro por isso) | 🟠 High | Parcial — a fila offline e o replay da cascata já rodam (Leva 11), **sem o ADR que o item exigia** | [PDV.md](../03_REGRAS_DE_NEGOCIO/PDV.md) · [PEDIDOS.md](../03_REGRAS_DE_NEGOCIO/PEDIDOS.md) | **Entregue:** `src/lib/offline/fila.js`/`rede.js`/`snapshot.js` (fila com `uid` por operação, storage injetável), drenada no `AppContext.jsx` (`drenarFila`/`executarOpOffline`) cobrindo comanda, venda fechada, baixa de estoque e de subproduto e lançamento financeiro; badge em `src/components/shared/IndicadorRede.jsx`; PWA em `vite.config.js` (`VitePWA`, `vite-plugin-pwa`); pré-requisito (1) resolvido por `20260830_idempotencia_baixa_estoque.sql`. **Falta:** persistência em IndexedDB/Dexie (hoje é `localStorage`), pré-requisitos (2) conflito multi-dispositivo, (5) realtime e (6) contingência de fiscal/TEF — e o ADR, que o código passou por cima. Esforço REAL = Alto (não Médio): a venda é transação-fonte (decisão 009) e dispara caixa/estoque/financeiro/vendas-normalizadas/Jarvas — o outbox precisa enfileirar e **reproduzir a cascata inteira**, não só `pedidos`. Pré-requisitos/riscos: (1) RPCs idempotentes (baixa de estoque não pode debitar 2× no replay); (2) resolução de conflito multi-dispositivo (garçom+caixa na mesma comanda offline); (3) JWT pode expirar offline → refresh no replay; (4) enforcement de assinatura (ADR-006) e RLS por tenant valem no replay; (5) realtime (mesas/Jarvas) degrada offline; (6) fiscal (F019) e TEF (F017) NÃO funcionam offline (SEFAZ/rede) — precisam de modo contingência/adiado |
| F018 | Revisão completa da estrutura de CSS — layout totalmente intuitivo e **responsivo**, com separação CSS/JSX (decisão 018) e base para theming/white-label por tenant (decisão 017) | 🟠 High | Em andamento — a maioria já migrou (contagem de 2026-08-02: **121 dos 156** `.jsx` não-teste importam `.css` co-localizado) | [02_DESIGN_SYSTEM/](../02_DESIGN_SYSTEM/) · [ADR-007](../08_DECISOES/adr-007.md) · [plano_tecnico_comercializacao.md](./plano_tecnico_comercializacao.md) | Transversal — padrão fixado em ADR-007 (`.css` co-localizado + CSS Custom Properties); aplicar tela a tela. **Falta:** 4 arquivos com `style={{` e nenhum `.css` próprio (`components/shared/KLogo.jsx` e as três telas de checkout em `src/pages/delivery/`), mais `style={{` residual convivendo com o CSS em 44 arquivos que já migraram — a limpeza é por tela, não em massa |

## Features em Avaliação

> _Features ainda sendo avaliadas quanto a valor, viabilidade e prioridade._
