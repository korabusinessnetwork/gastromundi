# Regras de Negócio — Delivery

> **Status:** estrutura aprovada, **ainda não implementado**. Este documento é a
> fonte de verdade da aba de Delivery e deve ser revisado/atualizado antes e
> durante a implementação. Nenhum código foi escrito até a data desta spec.

## Objetivo
Oferecer uma **vitrine pública de pedidos** (cardápio online) por estabelecimento,
onde o cliente final monta o pedido sem precisar de login, calcula a taxa de
entrega pelo CEP e escolhe a forma de pagamento **na entrega**. O pedido entra no
fluxo operacional do estabelecimento como uma venda normal.

## Contexto
- **Produto = SaaS multi-estabelecimento white-label** (decisão 017): a vitrine é
  servida no subdomínio do tenant (ex.: `casacoffeecolab.kora.codes/cardapio`) e
  usa **exclusivamente** a identidade do tenant (marca, cor, logo). Nada de marca
  de um cliente hardcodada.
- **Encaixa no sistema de planos (F013):** "Delivery" é um **módulo liberado pelo
  plano**. O comportamento se ajusta automaticamente conforme os módulos do plano
  (ver "Modos de operação").
- **Anon travado (Leva 16):** a superfície pública **não acessa tabela direto**.
  Todo acesso público passa por RPCs `SECURITY DEFINER` com preço/taxa
  **recalculados no servidor**.
- **Custo (bootstrap):** pagamento é **na entrega** (sem gateway/TEF) e o cálculo
  de taxa usa **faixas manuais + ViaCEP (grátis)** — zero custo recorrente.

## Modos de operação (definido pelo plano — F013)
O mesmo motor de dados atende os dois modos; a diferença é **de onde vem o
catálogo** e **para onde o pedido vai**. O modo é **derivado automaticamente dos
módulos que o plano do tenant libera** — não há toggle manual.

| | **Addon** (plano inclui PDV) | **Standalone** (plano só com Delivery) |
|---|---|---|
| Catálogo | **Sincroniza** com os `products`/`combos` existentes; Delivery só adiciona foto, descrição e complementos por cima | O **próprio admin do Delivery** vira o cadastro de produtos (grava no mesmo `products`) |
| Pedido cai em | `pending` → **Cozinha** existente → vira `venda` | `pending` → **mini-painel próprio do Delivery** (mini-KDS) |
| Apresentação | Módulo dentro do sistema | "Estabelecimento" completo, só com a face de Delivery |

> **Regra:** um tenant delivery-only é apenas um tenant cujo plano **não inclui o
> módulo PDV** mas **inclui o módulo Delivery**. Nenhuma tela de PDV é pressuposta
> no modo standalone.

## Superfície pública (segurança — inegociável)
O cliente anônimo **nunca** toca tabela diretamente. Três RPCs `SECURITY DEFINER`,
todas com preço/taxa **revalidados no servidor** (o front nunca envia valor
confiável):

| RPC | Entra | Sai |
|---|---|---|
| `cardapio_publico(slug)` | slug do tenant | categorias, produtos ativos disponíveis p/ delivery (foto, descrição, preço), grupos de complemento, combos "monte seu", status aberto/fechado |
| `calcular_taxa_entrega(slug, cep)` | slug + CEP | bairro (ViaCEP), taxa da faixa, tempo estimado — ou "fora da área de entrega" |
| `criar_pedido_delivery(slug, payload)` | carrinho + endereço + pagamento | nº do pedido + status; **revalida cada preço e a taxa server-side** antes de gravar |

- As RPCs são `SECURITY DEFINER`, com `REVOKE FROM PUBLIC/anon` no que for tabela e
  `GRANT EXECUTE` só nas próprias funções.
- Preço, disponibilidade e taxa vêm **sempre** do servidor no momento do pedido;
  qualquer valor vindo do cliente é ignorado (previne adulteração).

## Fluxo do cliente (vitrine — login NÃO obrigatório)
1. **Cardápio** — categorias + cards de produto (foto, descrição, preço).
2. **Produto** — complementos (add-ons) e/ou **"monte seu"** (combo montável).
3. **Sacola** — revisão dos itens, subtotal.
4. **Entrega** — informa CEP → ViaCEP traz o bairro → taxa calculada; endereço.
5. **Pagamento na entrega** — escolhe a forma pro motoboy levar (ver abaixo).
6. **Confirmação / status** — nº do pedido e acompanhamento.
7. **Login (opcional)** — só para salvar endereço/histórico; nunca obrigatório.

## Pagamento na entrega (grátis — sem gateway)
O cliente **seleciona a forma pro motoboy levar**:
- **Dinheiro** — com campo **"troco para quanto"** (calcula o troco a levar).
- **Pix** — na entrega.
- **Cartão** — com flag **"levar maquininha"** (crédito/débito na porta).

Nenhuma cobrança online é feita. Alinhado à regra de custo (bootstrap): nenhum
gateway/TEF é necessário.

## Taxa de entrega por distância (faixas manuais — grátis)
- O dono cadastra **faixas de taxa** no painel: **bairro → R$X** e/ou **faixa de
  CEP (início–fim) → R$X**.
- No pedido, ViaCEP (grátis) resolve o **bairro** a partir do CEP; o sistema casa
  com a faixa cadastrada e aplica a taxa.
- Sem correspondência em nenhuma faixa → **"fora da área de entrega"** (bloqueia o
  checkout com mensagem clara — prevenção de erro > mensagem de erro).
- Sem API paga de distância/rota nesta fase (decisão de custo do dono para evoluir).

## Modelo de dados
**Reusa (não duplica):**
- `products`, `combos` / `subprodutos` / `combo_subprodutos` — catálogo e motor do
  "monte seu" + baixa de estoque.
- `clientes` — quando o cliente opta por se identificar.
- `pending` — **o pedido de delivery cai aqui** (tabela com Realtime): aparece na
  Cozinha (addon) ou no mini-painel (standalone) e depois vira `venda` normal.

**Tabelas novas (todas com `tenant_id` desde o nascimento — multi-tenant/RLS):**
- `produto_delivery` — `foto_url`, `descricao`, `disponivel_delivery` (a tabela
  `products` hoje só tem `emoji`, sem foto/descrição). **Fotos no Supabase
  Storage** (bucket `delivery-fotos`): grátis no free tier (1 GB storage + 5 GB
  egress/mês cobrem milhares de aberturas de cardápio). Otimização obrigatória p/
  manter no grátis: **WebP no upload + thumbnail no grid** (foto cheia só ao abrir
  o produto) + `Cache-Control` agressivo. Egress é somado entre todos os tenants
  do projeto → migrar pro Pro (US$ 25/mês, 250 GB egress) só quando o volume real
  pedir (decisão de custo do dono, com número na mão).
- `grupos_complemento` + `complementos` — add-ons por produto (ex.: "Ponto da
  carne", "Adicionais": +bacon R$4), com `min`/`max` de escolha por grupo.
- `config_delivery` — 1 linha por tenant: aberto/fechado, horário de
  funcionamento, pedido mínimo, tempo de preparo, e as **faixas de taxa**
  (jsonb: `[{ tipo: 'bairro'|'cep', ...valor, taxa }]`).
- `delivery_pedidos` + `delivery_pedido_itens` — histórico próprio do delivery
  (cliente, endereço, taxa aplicada, forma de pagamento, troco, flag maquininha),
  espelhado no `pending` para o fluxo operacional.

> **RLS:** ao criar as tabelas/funções no Supabase, a RLS precisa ser configurada
> no painel. As RPCs públicas são a **única** porta do anon; tabelas ficam fechadas.

## Permissões
| Ação | dono | gerente | operador (caixa/atendente) | cozinha | cliente (anon) |
|------|------|---------|----------------------------|---------|----------------|
| Ver cardápio público / pedir | — | — | — | — | ✓ (sem login) |
| Configurar cardápio delivery (foto, descrição, complementos) | ✓ | (parcial) | — | — | — |
| Configurar faixas de taxa / config | ✓ | (parcial) | — | — | — |
| Ver/gerenciar pedidos que chegam | ✓ | ✓ | ✓ (addon) | ✓ | — |
| Mini-painel de pedidos (standalone) | ✓ | ✓ | — | — | — |

## Validações
- Preço e taxa **sempre** recalculados no servidor no momento do pedido.
- Pedido abaixo do **mínimo** configurado é bloqueado no checkout (mensagem clara).
- CEP fora de qualquer faixa → bloqueia com "fora da área de entrega".
- Estabelecimento **fechado** (config/horário) → cardápio visível mas checkout
  desabilitado, com aviso humano.
- Complementos respeitam `min`/`max` por grupo antes de permitir avançar.
- Inputs do cliente (CEP, endereço, observações) validados antes de qualquer
  operação no Supabase.

## Notificação de pedido novo (merchant)
Dois níveis, **ambos grátis** (sem serviço pago):
- **Nível 1 (MVP):** app aberto ou em segundo plano com tela ligada → Realtime (já
  existe) + **som** + `Notification API`. Zero infra nova.
- **Nível 2 (camada seguinte):** navegador/PWA **fechado** → **Web Push** (service
  worker da Leva 11 + chaves VAPID grátis + disparo via Supabase Edge Function,
  free: 500 mil execuções/mês). Android: funciona 100%. iPhone: só com o **PWA
  instalado na tela inicial** (limitação do iOS, sem custo).

## Endereço e troco (UX)
Sem tabela extra: resolvidos no **desenho da tela de entrega/comanda** — endereço
com CEP+ViaCEP e complemento manual; troco como campo "troco para quanto" quando a
forma é dinheiro (calcula o troco a levar).

## Exceções
- Falha do ViaCEP → permitir cadastro manual do bairro/endereço; nunca travar o
  pedido por indisponibilidade de terceiro (degradação graciosa).
- Realtime indisponível → o pedido ainda é gravado; a tela de pedidos reconcilia
  ao reconectar.

## Auditoria
- Registrar em `activity_log` (fire-and-forget) a criação de cada pedido de
  delivery e as transições de status (aceito → em preparo → saiu → entregue).
- Nunca logar dados sensíveis do cliente com `console.log`.

## Eventos Disparados
- `delivery.pedido.criado` · `delivery.pedido.aceito` · `delivery.pedido.em_preparo`
- `delivery.pedido.saiu_entrega` · `delivery.pedido.entregue` · `delivery.pedido.cancelado`

## Fases de build (quando o código for liberado)
1. **DB** — tabelas novas + RLS + as 3 RPCs `SECURITY DEFINER` (peça crítica).
2. **Painel do dono** — cadastro de foto/descrição/complementos + faixas de taxa +
   config; no modo standalone, também o cadastro base de produtos.
3. **Vitrine pública** — as 7 telas do fluxo do cliente + integração ViaCEP.
4. **Operação** — pedido → `pending` → Cozinha (addon) **ou** mini-painel
   (standalone) → vira `venda`; testes de ponta a ponta.

## Por que é intuitivo (Princípio nº 1)
- Cliente pede em poucos toques, sem login e sem manual; próxima ação sempre a mais
  visível (cardápio → sacola → entrega → pagar).
- Estados sempre visíveis: aberto/fechado, "fora de área", pedido mínimo,
  carregando/erro/vazio/sucesso com feedback humano.
- Prevenção de erro: checkout desabilitado quando fechado ou fora de área, em vez
  de deixar o cliente errar.
- Alvos grandes e legíveis (uso majoritário em celular).
