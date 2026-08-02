# Prévia do cardápio: abrir o estabelecimento logado, não o do fallback

## 0. O que já estava feito (levantamento antes do escopo)

O item nº 1 da fila do dono é "preview clicável do cardápio do cliente", e o ledger da Rodada 3
recomendou-o dizendo que "hoje não existe jeito de ver o cardápio como o cliente vê". **Essa premissa
está errada** — o botão existe desde o commit `f9fc34f` (2026-07-26), em
`src/components/desktop/views/DeliveryView.jsx:302`:

```jsx
onClick={() => window.open("/cardapio", "_blank", "noopener,noreferrer")}
```

O que está aberto é outra coisa, e é pior do que a ausência do botão: **ele abre o cardápio do
estabelecimento errado.**

A cadeia:

1. `CardapioPage.jsx:56` resolve o estabelecimento por
   `slugDoSubdominio() ?? resolverSlugTenant()` — **não existe caminho por query**.
2. `slugDoSubdominio()` devolve `null` em `localhost`, em IP e em qualquer host
   `*.vercel.app` (`tenantSlug.js:89-91`).
3. `resolverSlugTenant()` então cai em `SLUG_FALLBACK` = `gastromundi`
   (`tenantSlug.js:26` e `:58`).
4. Hoje **não há subdomínio de tenant em produção**: `VITE_ROOT_DOMAIN` não está no `.env.local`, o
   item "DNS wildcard `*.kora.codes`" segue desmarcado em `docs/05_FLUXOS/golive-casacoffee.md:12`, e
   a compra do domínio foi **adiada pelo dono em 2026-07-26** por custo
   (`memory/fila-proximas-features.md`, item 2).

Resultado: o dono da Casa Coffee clica em "Ver cardápio do cliente" e vê a vitrine, a marca, as
categorias e os **preços da GastroMundi**. É violação direta da decisão 017 (white-label
multi-estabelecimento) numa tela que o dono usa justamente para conferir o próprio cadastro antes de
publicar. E o botão **não tem teste nenhum** no repositório.

O slug do tenant existe no banco desde a migration `20260740` (`tenants.slug`, UNIQUE NOT NULL), mas
`buscarTenantAtual` seleciona `id, nome, tema, plano_codigo, created_at` (`tenant.js:41`) — **sem
`slug`**. Ou seja: o front hoje não tem como saber qual é o slug do estabelecimento logado.

## 1. Escopo

Fazer a prévia do cardápio abrir **o cardápio do estabelecimento logado**, levando o slug do tenant
na própria URL da prévia (`/cardapio?loja=<slug>`), e fazer a vitrine resolver o estabelecimento na
ordem **subdomínio > query > fallback** — o endereço publicado sempre ganha da query.

## 2. Fora de escopo

- **Ativar subdomínio por tenant.** É o item 2 da fila, adiado pelo dono por custo (comprar domínio +
  DNS wildcard). Esta rodada **não substitui nem antecipa** aquilo: é o caminho que funciona no
  domínio atual, de graça, e continua valendo depois — com subdomínio no ar, o subdomínio manda.
- **Marcar a prévia como prévia** (faixa "modo prévia", tarja, etc.). A graça do botão é ver
  exatamente o que o cliente vê; qualquer enfeite na tela quebra isso. A URL com `?loja=` já
  diferencia para quem precisa.
- **Outros pontos de entrada da prévia** (Console do dev, Configurações, tela de produtos). Só o
  botão que já existe no painel de Delivery.
- **Compartilhar o link com o cliente final.** O `?loja=` é um caminho de conferência, não o endereço
  comercial da loja — botão de "copiar link" é decisão de produto que depende do domínio (item 2).
- **Mudar o que a vitrine mostra.** Nenhuma alteração em cardápio, sacola, checkout ou pedido.
- **SQL.** Nenhuma migration criada ou alterada — `tenants.slug` já existe (`20260740`).

## 3. Origem e decisões que este item honra

- **Fila do dono, item nº 1** (`memory/fila-proximas-features.md`) — "preview clicável do cardápio do
  cliente", registrado como entregue e que esta rodada corrige.
- **Decisão 017 (white-label multi-estabelecimento)**: nenhuma tela pode mostrar a marca/os dados de
  um estabelecimento para o dono de outro. É o defeito que esta rodada fecha.
- **ADR-009 (login por subdomínio)**: o slug identifica o estabelecimento; o RLS **não** muda por
  causa dele — o tenant efetivo continua vindo do JWT (`app_metadata.tenant_id`). A query é só
  endereçamento de uma superfície que **já é anônima e já é endereçável por slug** (as RPCs
  `branding_por_slug`, `carregar_cardapio` e `enviar_pedido` recebem o slug como parâmetro).
- **Princípio nº 1 (intuitividade)**: "ver minha loja" tem que mostrar a minha loja. Um botão que
  mostra a loja de outro é o oposto de intuitivo — e o erro é silencioso, porque a tela do outro
  estabelecimento parece perfeitamente normal.
- **Custo (bootstrap)**: solução 100% gratuita, sem domínio, sem serviço novo.

## 4. Arquivos afetados

- `src/lib/tenantSlug.js` — duas funções puras novas: `slugDaQuery(search)` (lê e **valida** o
  `?loja=`) e `slugDaVitrine(hostname, search)` (a precedência subdomínio > query > fallback,
  devolvendo também de onde veio).
- `src/lib/tenantSlug.test.js` — testes das duas.
- `src/lib/tenant.js` — `slug` entra no `select` de `buscarTenantAtual` (colunas explícitas, nunca
  `select *`) e no objeto devolvido por `buscarBootstrapTenant`.
- `src/lib/tenant.test.js` — o `select` inclui `slug`; o bootstrap propaga o slug.
- `src/pages/delivery/CardapioPage.jsx` — passa a usar `slugDaVitrine()`; quando o slug veio da
  query, **não grava** o cache de marca (ver §6).
- `src/pages/delivery/CardapioPage.test.jsx` — o mock de `@/lib/tenantSlug` ganha as exportações
  novas (senão o arquivo quebra ao importar).
- `src/pages/delivery/CardapioPage.previa.test.jsx` — novo: a vitrine aberta com `?loja=` carrega o
  estabelecimento da query e não suja o cache de marca da origem.
- `src/components/desktop/views/DeliveryView.jsx` — o botão leva o slug do tenant logado.
- `src/components/desktop/views/DeliveryView.test.jsx` — o botão abre a loja certa (e continua
  funcionando quando o slug não veio).
- `src/test/mockApp.jsx` — o `tenant` padrão dos testes ganha `slug`, como o real passa a ter.
- `specs/previa-do-cardapio-abre-o-estabelecimento-logado.md` — este spec.
- `specs/_loop.md` — ledger, passo 8.

Reuso obrigatório (não reescrever): `slugValido` e `slugDoSubdominio` do próprio `tenantSlug.js`,
`lerBrandingCache`/`salvarBrandingCache` de `@/lib/brandingCache`, e o botão/CSS que já existem
(`.delivery-view__ver-cardapio` em `DeliveryView.css:56`).

## 5. Critérios de aceite

1. `slugDaQuery(search)` devolve o valor de `loja` **em minúsculas e sem espaços nas pontas**, e
   `null` quando o parâmetro não existe, está vazio ou **não passa em `slugValido`** (só
   `a-z0-9` e hífen no meio). Entrada do usuário validada antes de virar parâmetro de RPC.
2. `slugDaQuery` nunca lança: `search` ausente, `null`, lixo ou `URLSearchParams` indisponível viram
   `null`.
3. `slugDaVitrine(hostname, search)` devolve `{ slug, origem }` com **`origem: "subdominio"` quando
   há subdomínio** — mesmo que exista `?loja=` na URL apontando para outro estabelecimento. Endereço
   publicado ganha da query, sempre; ninguém sequestra a vitrine de uma loja real por query string.
4. Sem subdomínio e com `?loja=` válido, `slugDaVitrine` devolve esse slug com `origem: "query"`.
5. Sem subdomínio e sem query válida, devolve o fallback com `origem: "fallback"` — exatamente o
   comportamento de hoje, byte a byte.
6. `buscarTenantAtual` seleciona colunas explícitas incluindo `slug` (nunca `select *`), e
   `buscarBootstrapTenant` devolve `slug` no objeto do tenant.
7. O botão "Ver cardápio do cliente" abre `/cardapio?loja=<slug do tenant logado>` quando o tenant
   tem slug; abre `/cardapio` (comportamento atual) quando não tem — o botão **nunca** deixa de
   funcionar, e nunca some da tela.
8. O slug vai na URL **codificado** (`encodeURIComponent`) — a URL montada é sempre válida, mesmo com
   um slug fora do padrão vindo do banco.
9. `CardapioPage` aberta com `?loja=<outro slug>` carrega branding e cardápio **desse** slug: as
   chamadas a `buscarBrandingPorSlug` e `carregarCardapio` recebem o slug da query.
10. Prévia por query **não grava** o cache de marca da origem (`salvarBrandingCache`) e não pinta a
    tela inicial com o cache da origem — senão a marca de um estabelecimento vaza para a tela de
    login do outro, que divide a mesma origem (ver §6).
11. A sacola continua isolada por estabelecimento: `useCarrinho` recebe o slug resolvido, então a
    chave de `sessionStorage` muda junto com a loja.
12. Nenhum segredo hardcodado, nenhum `select *`, nenhum `console.log` novo, nenhum `TODO` sem
    justificativa, nenhuma cor ou marca de cliente específico no código.
13. Nenhum arquivo tocado fora do §4; nenhuma migration criada ou alterada.
14. `npm test` verde, com os testes novos — incluindo o primeiro teste que o botão da prévia já
    devia ter.

## 6. Edge cases conhecidos

- **Cache de marca por origem (o furo silencioso).** `salvarBrandingCache` carimba o cache com
  `resolverSlugTenant()` (`brandingCache.js:91`), que no domínio compartilhado é **sempre**
  `gastromundi`. Se a prévia da Casa Coffee gravasse o cache, o carimbo diria "gastromundi" e a tela
  de login daquela origem passaria a pintar a marca da Casa Coffee para todo mundo. Por isso prévia
  por query não escreve — e nem lê — o cache.
- **Tenant sem slug** (bootstrap falhou, RLS negou, migration `20260740` não aplicada): o botão cai
  no `/cardapio` de hoje. Degradação, não regressão.
- **Slug com caractere estranho vindo do banco:** `encodeURIComponent` na saída e `slugValido` na
  entrada — a URL é válida e a vitrine recusa o que não é slug.
- **`?loja=` de estabelecimento inexistente:** `carregarCardapio` devolve `NULL` e a vitrine já mostra
  "🏪 Este endereço ainda não tem delivery disponível" — o mesmo estado de hoje, sem tela nova.
- **`?loja=` de estabelecimento sem delivery no plano:** a RPC já recusa (migration `20260906`); a
  tela cai no mesmo estado acima. Não é caminho para espiar cliente alheio — a vitrine é pública por
  desenho e só expõe nome, tema e cardápio, exatamente o que o cliente final veria.
- **Subdomínio no ar + `?loja=` na URL:** o subdomínio ganha (critério 3). Quando o domínio for
  comprado (item 2 da fila), esta rodada continua correta sem tocar em nada.
- **Bloqueador de pop-up:** `window.open` pode ser barrado. Não muda nesta rodada — o clique é do
  usuário, o navegador libera.

## 7. Definição de "aprovado sem ressalvas"

Todos os catorze critérios em sim, `npm test` verde, sem `TODO` pendente, sem `console.log`
esquecido, nenhuma migration criada ou alterada, e nenhuma regressão em `tenantSlug.test.js`,
`tenant.test.js`, `CardapioPage.test.jsx`, `DeliveryView.test.jsx` e `brandingCache.test.js`.

## 8. Resultado da review (2026-08-01)

✅ **Aprovado sem ressalvas — 14 de 14 critérios em sim, sem nenhuma rodada de correção.**

Suíte: `npm test` (`vitest run`) — **182 de 182 arquivos, 2817 de 2817 testes**, verde.

| # | Critério | Evidência |
|---|---|---|
| 1–2 | `slugDaQuery` lê e valida o `?loja=` | `src/lib/tenantSlug.js:122-131`; testes de normalização, formato inválido, injeção (`' OR 1=1 --`, `%3Cscript%3E`, `../../etc/passwd`) e argumento de outro tipo em `tenantSlug.test.js:92-122` |
| 3–5 | Precedência subdomínio > query > fallback, devolvendo a origem | `src/lib/tenantSlug.js:151-159`; `tenantSlug.test.js:124-157`, incluindo subdomínio digitado errado que continua reivindicando |
| 6 | `slug` no `select` (colunas explícitas) e no bootstrap | `src/lib/tenant.js:46` e `:169`; `tenant.test.js:48`, `:166` e `:194` (ausente vira `null`, não `undefined`) |
| 7–8 | O botão leva o slug do tenant logado, com `encodeURIComponent` | `src/components/desktop/views/DeliveryView.jsx:157-159` e `:314-322`; três testes em `DeliveryView.test.jsx:162-215` (slug normal, slug nulo, slug fora do padrão) |
| 9–10 | A vitrine carrega o slug da query e a prévia não toca no cache de marca | `src/pages/delivery/CardapioPage.jsx:62` e `:109`; `CardapioPage.previa.test.jsx` — quatro testes de prévia mais um de controle provando que o caminho normal continua lendo e gravando |
| 11 | Sacola isolada por estabelecimento | `useCarrinho(slug)`; teste de `sessionStorage` com a chave `kora.delivery.sacola.casacoffee` em `CardapioPage.previa.test.jsx:113` |
| 12 | Sem segredo, `select *`, `console.log` ou `TODO` novo | busca por `console.log|TODO|FIXME|select("*")` nos arquivos tocados: nenhuma ocorrência |
| 13 | Nada fora do §4, nenhuma migration | `git status --short` só lista os arquivos do §4 mais os dois novos |
| 14 | Suíte verde com os testes novos | 10 arquivos alterados, 268 inserções, 14 remoções |

## 9. Aprendido (passo 5 do ciclo)

- `memory/learnings.md` — Aprendizados Técnicos: cache carimbado pela **origem** não pode ser escrito
  por tela que mostra outro estabelecimento. Aprendizados de Processo: item marcado "✅ ENTREGUE" na
  fila do dono escondeu o furo — o levantamento pergunta **o que a coisa faz**, não se existe.
- `memory/patterns.md` → Padrões de Código: padrão novo "Superfície pública endereçada por slug:
  precedência e cache por origem".
- `memory/bugs.md` → seção "Ciclo do loop — 2026-08-01": os dois defeitos, com causa e conserto.
- `memory/fila-proximas-features.md` (memória do assistente): o item 1 deixou de dizer só "entregue"
  e passou a descrever o comportamento real, que é o que faltava para o defeito ter sido visto antes.
