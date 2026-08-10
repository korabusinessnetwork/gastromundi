# Quadro Pré-Venda — Caminho para vender (meta: próxima semana)

> Decisões que definem este quadro (2026-07-10):
> - **Fiscal (NFC-e): exigido já** pelo primeiro cliente.
> - **Acesso: mesmo app, login separa o tenant** (um único deploy Vercel).
> - **Cobrança: manual** (Pix/dinheiro → marca assinatura como paga; sem gateway pago agora).

## Estado atual (o que JÁ está pronto)

Núcleo operacional (PDV, Caixa, Produtos, Estoque+alertas, Pedidos, Cozinha/KDS), gestão
(Financeiro, Clientes/Fiado, Relatórios), Jarvas (IA), camada de comercialização (planos +
gating por módulo, add-ons scaffolding, billing + enforcement de assinatura no RLS, theming/
white-label por `tenants.tema`), impressão adaptável (F015/F020), fix crítico de RLS (chave
JWT), e o app inteiro tokenizado/responsivo (F018, finalizando cleanup de `colors.js`).

**Atualizado em 2026-08-02:** o parágrafo acima descrevia o quadro de 2026-07-10, quando tudo
isso rodava para **um único estabelecimento**. Não é mais verdade. O isolamento multi-tenant
entrou nas levas `20260723` (hook de JWT), `20260724` (isolamento das operacionais), `20260725`
(wrappers que leem o tenant do JWT) e `20260726` (billing), mais `20260738` (PK composta por
tenant), `20260739` (RLS de `users`), `20260743` (grupos de categoria) e `20260813` (unidades de
medida) — **49 tabelas** isoladas por `tenant_id`, com política `AS RESTRICTIVE` por tenant. O que
bloqueia a venda hoje
é só o **S1-4 (fiscal NFC-e)**, que depende de certificado e provedor pagos.

---

## 🚩 SPRINT 1 — Bloqueadores duros (sem isto NÃO dá pra vender)

| # | Item | Por que trava a venda | Esforço |
|---|------|----------------------|---------|
| S1-1 | **Isolamento multi-tenant**: adicionar `tenant_id` a TODAS as tabelas operacionais (vendas, venda_itens, venda_pagamentos, sales, pending, products, estoque, clientes, lancamentos, mesas, fechamentos, config, jarvas_*, notas_fiscais...) + RLS que filtra pelo tenant do usuário logado (via `users`/JWT). Ajustar as funções de gating/assinatura que hoje resolvem "o único tenant" para resolver o tenant do usuário.<br>**Entregue** em quatro levas — `20260723` (hook de JWT em `users`), `20260724` (isolamento das operacionais), `20260725` (wrappers que leem o tenant do JWT) e `20260726` (billing) — mais `20260738` (PK composta por tenant), `20260739` (RLS de `users`), `20260743` (grupos de categoria) e `20260813` (unidades de medida). O `supabase/schema.sql` foi refeito em 2026-08-02 (TD016) e agora descreve as 54 tabelas e o `tenant_id` de cada uma; `src/lib/seguranca/schemaSqlGuard.test.js` quebra a suíte se ele voltar a atrasar. | Sem isso, no modelo "mesmo app", **um cliente vê os dados do outro**. Era o bloqueador nº 1 — deixou de ser. | ✅ Entregue |
| S1-2 | **Console da plataforma (super-admin — VOCÊ)** — F022, decisão 027: página com **login próprio** e papel cross-tenant. Cria estabelecimentos (onboarding: tenant + 1º admin + base limpa), define plano/add-ons por tenant, **concede/estende tempo de assinatura**, configura fiscal por tenant (decisão 026), vê billing de todos. É por AQUI que você coloca um cliente novo no ar e gerencia a conta dele.<br>**Entregue**: login próprio, criar estabelecimento com o 1º admin (RPC `provisionar_tenant` `20260727` + Edge Function que cria a credencial em `auth.users`), plano, mensalidade, layout, add-ons (`20260915`), renovação, estorno, histórico e analytics da plataforma. A parte fiscal citada aqui **não é do Console**: quem preenche `tenant_fiscal_config` é o próprio estabelecimento, no `PainelFiscal`. | Sem isto não há como criar/gerenciar clientes nem controlar assinatura. Superfície mais sensível (cross-tenant) — desenhar junto do S1-1. | ✅ Entregue |
| S1-3 | **Configurações do estabelecimento (admin do TENANT — o dono do restaurante)** — fim do "só por SQL", escopado ao próprio tenant: identidade/tema (logo, cores, nome), usuários, config de impressão/perfil, e visualização do próprio plano/assinatura. (A concessão de tempo de assinatura fica no console da plataforma, S1-2, não aqui.)<br>**Entregue (2026-08-01)**, em quatro abas de Configurações: **Usuários** (CRUD completo), **Impressão** (perfil e config), **Minha assinatura** (situação, plano, o que inclui e histórico de pagamentos, somente leitura — decisão 027) e **Identidade** (nome de exibição e logo do próprio estabelecimento, só admin, gravados por `atualizar_identidade_tenant` — migration `20260914`). O logo **não** esbarrava em Storage × RLS: as policies da `20260826` casam pela primeira pasta do caminho, então `{tenant_id}/identidade/logo.png` no bucket `delivery-fotos` já nasce isolado e autorizado.<br>Fora daqui de propósito: **paleta e layout** (`accent`, `tema.layout`) continuam sendo escolha da plataforma pelo Console (`alterar_layout_tenant`, `20260801`) — a troca de layout apaga overrides de paleta, e duas pontas escrevendo o mesmo jsonb se sobrescreveriam sem ninguém perceber. | Não dá pra entregar um sistema que o cliente só configura por SQL. Reaproveita telas já tokenizadas (F018). | ✅ Entregue |
| S1-4 | **Fiscal NFC-e** (exigido pelo cliente): escolher provedor + certificado digital, e ligar no hook fiscal nativo (F019) do fluxo de pagamento. Ver "Decisão de custo" abaixo. | Cliente exige NFC-e desde o dia 1. | 🔴 Alto + custo |

---

## 🟠 SPRINT 2 — Necessário para cliente real operando em dados reais

| # | Item | Motivo |
|---|------|--------|
| S2-1 | ✅ **Feito (2026-08-01)** — **TD012 — baixa de estoque visível**: parar de engolir erro e mostrar estimativa local; falha de baixa precisa alertar/logar. A falha agora vira alerta no painel do Jarvas (`gerarAlertaBaixaFalhou`), e a estimativa local saiu do retorno de erro. Fica de fora: agregar a falha sistêmica num alerta só, e avisar o operador na tela do PDV. | Com estoque real, uma baixa que falha silenciosamente corrompe o inventário. |
| S2-2 | **QA dos fluxos críticos** (PDV → caixa → fiscal → impressão) num tenant de teste + **teste físico de impressora térmica** (corte/densidade, pendente do F020). | Antes de por dinheiro real e nota fiscal em jogo. |
| S2-3 | **Backfill/limpeza de dados** por tenant (garantir que o novo cliente começa zerado e que relatórios batem). | Higiene de dados no onboarding. |

---

## ✅ Em andamento / finalização (não bloqueia)

- **Cleanup do `colors.js`** (fecha o F018 100% — fonte única de cor). Contagem de 2026-08-02:
  **121 dos 156** `.jsx` não-teste já importam o `.css` co-localizado; faltam 4 arquivos com
  `style={{` e nenhum `.css` próprio (`src/components/ui/marca/KLogo.jsx` e as três telas de
  checkout em `src/pages/delivery/`) e `style={{` residual em 44 arquivos já migrados.

## ⏸️ Adiado — NÃO bloqueia a venda desta semana

- **F021 — PDV offline-first (PWA)**: ~~fica para depois do lançamento~~ — **parcialmente entregue
  na Leva 11, sem o ADR que o item exigia**: `src/lib/offline/fila.js` + `rede.js` + `snapshot.js`,
  drenados por `drenarFila`/`executarOpOffline` em `src/context/AppContext.jsx`, com `VitePWA` no
  `vite.config.js` e baixa de estoque idempotente (`20260830_idempotencia_baixa_estoque.sql`).
  Continua faltando: IndexedDB (hoje é `localStorage`), conflito multi-dispositivo, realtime,
  contingência fiscal/TEF — e o ADR.
- **Gateway de pagamento automático**: cobrança manual cobre o lançamento (regra de custo).
- **Subdomínio por tenant / deploy dedicado**: o modelo "mesmo app + login" dispensa por ora.

---

## ⚠️ Riscos de prazo (honestidade)

1. **Dois "tent poles" grandes na mesma semana**: o isolamento multi-tenant (S1-1) e o fiscal NFC-e (S1-4) são, cada um, esforço alto. Fazer os dois + onboarding + tela admin em 1 semana é **agressivo**. Se algo escorregar, o candidato natural a empurrar é o fiscal (mais dependência externa) — mas o cliente disse que precisa dele. Vale alinhar expectativa: talvez a semana entregue o core multi-tenant vendável e o fiscal entre poucos dias depois, em contingência.
2. **Fiscal depende de terceiros** (certificado + homologação SEFAZ do estado): pode ter prazo fora do nosso controle (emissão de certificado, credenciamento). Começar por aqui **hoje** reduz risco.
3. **Cobertura de teste fina** em várias telas — o QA manual (S2-2) vira a rede de segurança.

---

## 💰 Decisão de custo — Fiscal NFC-e (regra de custo: exige sua decisão)

NFC-e **não tem caminho 100% gratuito** — é imposição legal/técnica, não escolha nossa:

- **Certificado digital A1** (obrigatório para assinar a nota): custo anual recorrente. Item inevitável.
- **Como emitir**, duas rotas:
  - **Via provedor/API fiscal** (ex.: Focus NFe, PlugNotas, WebmaniaBR, NFe.io): mensalidade e/ou por nota. **Rápido de integrar** (dias), cobre contingência e vários estados.
  - **Integração direta com a SEFAZ** (sem provedor): sem taxa de provedor, mas **semanas** de desenvolvimento por estado + manutenção contínua das mudanças de layout. Inviável para a semana.

**Recomendação:** usar um **provedor** para bater o prazo. E o mais importante — pela decisão 019, **o fiscal é um add-on PAGO cobrado do cliente**. Ou seja, o custo do provedor/certificado é **repassável e ligado a receita**, não um gasto afundado. Isso justifica o investimento agora dentro da regra de custo.

**Ação pendente (você decide):** escolher o provedor. Posso pesquisar preços atuais e cobertura (NFC-e no estado do cliente, sandbox de homologação, custo por nota vs mensal) e trazer uma recomendação com números antes de fechar.

---

## Ordem sugerida de execução (Sprint 1)

1. **Começar HOJE o fiscal (S1-4)** pela parte de terceiros (certificado + escolha de provedor + acesso ao sandbox) — é o que tem prazo externo.
2. Em paralelo, **S1-1 (isolamento multi-tenant)** — é o maior de engenharia e destrava tudo.
3. **S1-2 (onboarding)** logo após o isolamento (depende dele).
4. **S1-3 (tela admin)** — pode andar em paralelo, reaproveitando as telas já tokenizadas (F018).
5. Sprint 2 (QA, TD012, impressora) na reta final.
