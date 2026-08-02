# F022-ANALYTICS — Uso e faturamento por estabelecimento no Console

**Rodada 5 do ciclo · 2026-08-01**

## 1. Escopo

Uma aba nova no Console da Plataforma — **"Uso e faturamento"** — que mostra, por
estabelecimento e num período escolhido (7, 30 ou 90 dias), **quanto ele faturou, quantos
pedidos fechou, o ticket médio e quando foi a última venda**; alimentada por uma RPC
`SECURITY DEFINER` que devolve **apenas números agregados**, nunca a venda de um cliente.

O que isso responde, que hoje nenhuma tela responde: **quem paga está usando?** O Console
mostra a assinatura (quem paga, quando vence, quanto) e não mostra a operação (quem vende).
Um estabelecimento que paga e não fez uma venda em 30 dias é churn a caminho, e hoje isso é
invisível até o cancelamento chegar.

## 2. Fora de escopo

- **Impersonation.** A ADR-008 prevê "uma RPC que emite um contexto escopado àquele
  `tenant_id`" para o super-admin ver a operação bruta de um tenant. Não é esta rodada:
  aqui só entram agregados. Entrar no dado bruto de um cliente é decisão de produto e de
  privacidade que ainda não está escrita.
- **Detalhe dentro do estabelecimento** — produto mais vendido, curva por hora, comparação
  entre períodos, gráfico. Esta rodada entrega número, não análise.
- **Exportar (CSV/PDF)** e agendamento de relatório.
- **Delivery separado do salão.** `delivery_pedidos` vira `vendas` ao ser faturado; separar
  os canais é outra pergunta e outra rodada.
- **Qualquer coisa paga** — nada de BI externo, data warehouse ou serviço de métrica.
- Mexer no dashboard de Planos e assinaturas, nas RPCs de billing ou no isolamento das 24
  tabelas operacionais.

## 3. Origem e decisões que este item honra

- **Backlog:** `docs/09_BACKLOG/features.md` → **F022** (Console da Plataforma), linha
  "**Falta:** … analytics de plataforma". Sprint `S1-2`.
- **Fila do dono** (`memory/fila-proximas-features.md`, item 3): "PRÓXIMAS fatias possíveis:
  **analytics operacional (faturamento/pedidos/ticket por tenant)**".
- **ADR-008 §5 e §7 + Decisão Fechada v2 nº 2** — e é aqui que o desenho se decide:

  > "as policies **operacionais** usam `USING (tenant_id = auth.tenant_id())` **SEM** o
  > `OR auth.is_super_admin()` global — o super-admin **não** vê o dado operacional bruto de
  > todos os tenants o tempo todo. Para ver a operação de um tenant específico, o super-admin
  > usa **impersonation / escopo explícito** (uma RPC que emite um contexto escopado àquele
  > `tenant_id`). O ramo `OR auth.is_super_admin()` fica **apenas** nas tabelas que o Console
  > (S1-2) precisa ler de forma agregada — billing e listagem de tenants."

  **Este item NÃO contradiz a decisão — ele é construído para caber nela.** O caminho óbvio
  (adicionar `OR is_super_admin()` na policy de `vendas`) está **proibido**: daria ao token de
  plataforma a base de vendas inteira de todos os clientes, que é exatamente o raio de
  exposição que a decisão v2 nº 2 fechou. O caminho usado é o outro braço da mesma decisão —
  **escopo explícito por RPC** — com um limite a mais que a ADR não precisava escrever porque
  não existia caso: **a RPC não devolve linha de venda, devolve contagem e soma.** O que sai
  dela sobre um cliente é o que a plataforma já sabe para cobrar (que ele existe e opera),
  não o que ele vendeu, para quem, nem por quanto cada coisa.
- **ADR-006 §4 / decisão 024** (billing da plataforma) — mesma família das RPCs
  `definir_mensalidade_tenant` (20260911) e `confirmar_renovacao_assinatura` (20260909):
  guarda `is_super_admin()`, `SET search_path`, `REVOKE` antes do `GRANT`.
- **Decisão 017** (SaaS white-label): a tela é por tenant e sem nome de cliente cravado.
- **CLAUDE.md** — Princípio nº 1 (intuitividade), custo zero, segurança, CSS fora do JSX
  (decisão 018).

## 4. Arquivos afetados

**Criados**
- `supabase/migrations/20260912_analytics_plataforma.sql` — RPC
  `public.analytics_plataforma(p_dias integer)`, `SECURITY DEFINER`, `SET search_path = public`,
  guarda `is_super_admin()`, `REVOKE`/`GRANT`, mais o bloco `DO $conf$` de autoteste no padrão
  das irmãs (existe, é DEFINER, tem `search_path`, tem a guarda, `anon` não executa,
  `authenticated` executa).
- `src/components/console/AnalyticsDashboard.jsx`
- `src/components/console/AnalyticsDashboard.css`
- `src/components/console/AnalyticsDashboard.test.jsx`
- `src/lib/analyticsSqlGuard.test.js` — **acrescentado durante o build**, não estava previsto
  aqui. Motivo: o bloco `DO $conf$` da migration só protege o banco onde a migration já rodou,
  e some no primeiro `CREATE OR REPLACE`. O que este item tem de frágil é justamente textual —
  a assinatura de retorno não pode ganhar coluna que identifique venda, a guarda tem que ser a
  primeira instrução, e a função não pode virar `OR is_super_admin()` numa policy. Isso só se
  garante lendo o SQL, que é o padrão já usado no projeto em outros 8 `*SqlGuard.test.js`.

**Modificados**
- `src/lib/console.js` — `listarAnalitico(dias)` (chamada da RPC, `{data, error}`, não lança)
  e a função **pura** `resumirUso(tenants, assinaturas, analitico)` (KPIs da base, linhas por
  estabelecimento, lista "pagando e sem uso").
- `src/lib/console.test.js` — testes da função pura nova.
- `src/pages/console/ConsolePage.jsx` — terceira aba, no mesmo padrão das duas existentes.
- `src/pages/console/ConsolePage.css` — só o que a aba nova exigir.
- `docs/09_BACKLOG/features.md` — F022 perde "analytics de plataforma" da lista do que falta
  (no passo `/aprender`).

## 5. Critérios de aceite

**Autorização e isolamento (o coração desta rodada)**

1. A migration **não** altera policy nenhuma de `vendas`, `venda_itens`, `sales` ou qualquer
   uma das 24 tabelas operacionais da `20260724` — verificável por leitura do arquivo: nenhum
   `CREATE POLICY`, `ALTER POLICY` ou `DROP POLICY` sobre elas.
2. A RPC recusa quem não é super-admin com `IF public.is_super_admin() IS NOT TRUE THEN RAISE
   EXCEPTION … USING ERRCODE = 'insufficient_privilege'` — `NULL` e `false` barram igual
   (padrão da 20260730).
3. A RPC é `SECURITY DEFINER` **com** `SET search_path = public`, e o autoteste `DO $conf$`
   falha alto se qualquer um dos dois se perder num `CREATE OR REPLACE` futuro.
4. `REVOKE EXECUTE … FROM PUBLIC, anon` vem **antes** do `GRANT … TO authenticated`, e o
   autoteste confere `has_function_privilege('anon', …) = false`.
5. **A RPC devolve apenas agregados.** O `RETURNS TABLE` não tem nenhuma coluna que carregue
   dado de uma venda individual: sem `id` de venda, sem `comanda`, sem `mesa`, sem `cashier`,
   sem `cliente_id`, sem item, sem valor de venda unitária. As colunas são
   `tenant_id uuid, faturamento_centavos bigint, pedidos integer, ultima_venda timestamptz`.

**Dinheiro**

6. O dinheiro atravessa a fronteira banco→JS **em centavos inteiros**:
   `round(sum(v.total) * 100)::bigint`. Nenhuma aritmética de dinheiro em JS usa float — soma,
   ticket médio e KPIs operam sobre inteiros, e a divisão por 100 acontece **só** na hora de
   formatar para a tela.
7. Ticket médio = `faturamento_centavos / pedidos` em inteiro arredondado, e é `null` (tela
   mostra "—") quando `pedidos = 0`. Nenhuma divisão por zero, nenhum `NaN` na tela.

**Consulta e entrada**

8. Nenhum `select *`: a RPC nomeia as colunas que lê de `vendas`, e `listarAnalitico` recebe
   as colunas nomeadas da RPC.
9. `p_dias` é validado dentro do banco: só `7`, `30` ou `90` são aceitos; qualquer outro valor
   (incluindo `NULL`, `0`, negativo e `100000`) é recusado com `check_violation`. O front
   também só oferece os três — mas quem valida de verdade é o banco, porque a RPC é chamável
   direto pelo PostgREST com qualquer token `authenticated`.

**Tela**

10. Os quatro estados aparecem: **carregando**, **erro** (com "Tentar de novo", e a tela diz
    que não sabe em vez de mostrar zero), **vazio** ("nenhuma venda no período") e sucesso.
11. Estabelecimento com assinatura ativa e **zero** pedidos no período aparece num bloco de
    atenção próprio ("Pagando e sem uso"), com o nome e há quanto tempo foi a última venda —
    ou "nunca vendeu".
12. Nenhuma cor, tamanho ou espaçamento no JSX: todo estilo em `AnalyticsDashboard.css`, com
    os tokens de tema já usados em `PlanosDashboard.css` (decisão 018).
13. Nenhuma marca, nome de cliente, cor ou regra de um estabelecimento específico no código
    (decisão 017) — inclusive a GastroMundi, que na tela é só mais uma linha.
14. Nada de jargão na tela: "faturamento", "pedidos", "ticket médio", "última venda",
    "sem uso" — nada de "MRR", "GMV", "churn", "tenant" ou "RPC".

**Testes**

15. `resumirUso` é função pura e nasce com teste cobrindo: base vazia, estabelecimento sem
    venda no período, `pedidos = 0` (ticket médio nulo), ordenação, e a lista "pagando e sem
    uso" ignorando quem está cancelado.
16. `npm test` (`vitest run`) verde, sem regressão em `console.test.js`,
    `PlanosDashboard.test.jsx` e `ConsolePage.test.jsx`.

## 6. Edge cases conhecidos

- **Migration não aplicada** — a RPC não existe e o PostgREST devolve `PGRST202` /
  "function does not exist". A aba tem que dizer que não conseguiu carregar e oferecer tentar
  de novo, **não** mostrar zeros como se fossem verdade. (Vale lembrar: as `20260903`,
  `20260907`, `20260909`, `20260911` e agora a `20260912` precisam ser rodadas no SQL Editor.)
- **Estabelecimento recém-criado** — existe em `tenants`, não tem uma venda. Não pode sumir da
  tabela: aparece com zeros e "nunca vendeu".
- **Estabelecimento sem assinatura** (dado legado anterior à `20260908`) — entra na tabela de
  uso, fica fora do bloco "pagando e sem uso" (não paga).
- **Assinatura cancelada** — fica fora do bloco de atenção; não é churn a caminho, já foi.
- **Tenant que aparece na RPC e não na lista de `tenants`** (removido entre as duas leituras) —
  a linha é ignorada em vez de renderizar "undefined".
- **`vendas.total` nulo ou negativo** — a coluna é `NOT NULL`, mas estorno futuro pode chegar
  negativo; a soma respeita o sinal e o ticket médio pode dar menor que zero sem quebrar a
  formatação.
- **Fuso** — o corte do período é `at >= now() - (p_dias || ' days')::interval`, em UTC no
  banco; "últimos 30 dias" é janela móvel, não mês-calendário, e a tela diz isso.
- **Base grande** — a agregação roda no banco com o índice `vendas_tenant_id_idx` da
  `20260724`; o front nunca traz linha de venda para somar no navegador.
- **Usuário `authenticated` comum chamando a RPC direto** — barrado pelo critério 2. Este é o
  caso que a rodada precisa provar, não supor.

## 7. Definição de "aprovado sem ressalvas"

Todos os 16 critérios em **sim** com evidência de arquivo e linha, `npm test` verde, sem `TODO`
pendente, sem `console.log` esquecido, nenhum arquivo tocado fora do §4, nenhuma policy de
tabela operacional alterada, e nenhuma regressão nas abas existentes do Console.

---

## 8. Resultado da review (2026-08-01)

**Aprovado sem ressalvas** — 16 de 16 critérios em *sim*. `npm test` (`vitest run`):
184 arquivos, **2863 testes verdes**.

| # | Evidência |
|---|---|
| 1 | `20260912_analytics_plataforma.sql` não tem `CREATE/ALTER/DROP POLICY` nem `ALTER TABLE`; travado em `analyticsSqlGuard.test.js` ("não altera policy nenhuma"), que também proíbe a forma `OR is_super_admin()` e qualquer `USING (`. |
| 2 | `20260912…sql:88-90` — `IF public.is_super_admin() IS NOT TRUE THEN RAISE EXCEPTION … USING ERRCODE = 'insufficient_privilege'`; o guard prova que o índice dessa linha vem **antes** do `p_dias NOT IN` e do `FROM public.vendas`. |
| 3 | `20260912…sql:81-82` (`SECURITY DEFINER`, `SET search_path = public`) + o `DO $conf$` conferindo `prosecdef` e `proconfig LIKE 'search_path=%'`. |
| 4 | `REVOKE EXECUTE … FROM PUBLIC, anon` antes do `GRANT … TO authenticated`; o guard compara os índices e o `DO $conf$` confere `has_function_privilege('anon', …) = false`. |
| 5 | `RETURNS TABLE (tenant_id uuid, faturamento_centavos bigint, pedidos integer, ultima_venda timestamptz)` — o guard fixa a lista inteira e varre `comanda`, `cashier`, `cliente_id`, `mesa`, `venda_itens` no corpo da função. |
| 6 | `round(coalesce(sum(vd.total) FILTER …, 0) * 100)::bigint` no banco; em JS, `resumirUso` (`src/lib/console.js:274-341`) só soma e divide inteiros — a única divisão por 100 é `emReais` (`AnalyticsDashboard.jsx:206-208`), na formatação. |
| 7 | `src/lib/console.js:301` e `:335` — `pedidos > 0 ? Math.round(…) : null`; a tela mostra `—` (`AnalyticsDashboard.jsx:131` e `:180`). Testado em `console.test.js` e em `AnalyticsDashboard.test.jsx` ("nunca NaN"). |
| 8 | A RPC nomeia `vd.tenant_id`, `vd.total`, `vd.at`; o guard proíbe `SELECT *`. |
| 9 | `20260912…sql:96-98` — `p_dias IS NULL OR p_dias NOT IN (7, 30, 90)` → `check_violation`; o guard casa a lista com `PERIODOS_ANALYTICS`. |
| 10 | Carregando (`AnalyticsDashboard.jsx:82-86`), erro com "Tentar de novo" (`:87-95`), base sem estabelecimento (`:152-157`), **base parada no período** (`:136-145`) e sucesso. Os cinco cobertos em `AnalyticsDashboard.test.jsx`. |
| 11 | `AnalyticsDashboard.jsx:99-121` — bloco `role="status"` com nome e "Nunca vendeu" / "Há N dias". |
| 12 | Nenhum `style=` no JSX; tudo em `AnalyticsDashboard.css`, em tokens `--gm-*` (o âmbar `#f59e0b` de status segue o literal já usado no `PlanosDashboard.css` e no `AssinaturaBanner`, onde não existe token). |
| 13 | Nenhum nome de cliente no código; a GastroMundi entra pela lista de tenants como qualquer outra. |
| 14 | Teste "não usa jargão na tela" varre o DOM contra `MRR`, `GMV`, `churn`, `tenant`, `RPC`, `SQL`, `endpoint`. |
| 15 | `console.test.js` — 11 casos de `resumirUso` (base vazia, tenant fora da RPC, ticket nulo, ordenação e desempate, "pagando e sem uso" ignorando cancelado/bloqueado/sem assinatura, carência contando como quem paga, faturamento negativo, listas `null`). |
| 16 | 2863 verdes, incluindo `console.test.js`, `PlanosDashboard.test.jsx` e `ConsolePage.test.jsx`. |

**Corrigido durante a review:** o critério 10 estava *parcial* — uma base inteira sem vender
aparecia só como cartões em R$ 0,00 e uma tabela de zeros, que lê como "não carregou". Passou a
afirmar o zero em texto (`AnalyticsDashboard.jsx:136-145`), com dois testes.

**Acrescentado fora do §4 original:** `src/lib/analyticsSqlGuard.test.js` (motivo registrado no
próprio §4) e a correção da nota do F022 em `docs/09_BACKLOG/features.md`, que afirmava que a RLS
por tenant "precisa de override `OR auth.is_super_admin()`" — contradizendo a ADR-008.

## 9. O que ficou para outra rodada

- **Impersonation / escopo explícito** (o outro braço da decisão v2 nº 2 da ADR-008): ver a
  operação de **um** tenant como ele a vê. Nada disto entrou aqui.
- **Detalhe e gráfico** — por produto, por hora, série temporal, comparação entre períodos.
- **Exportar** (CSV/PDF) o que a aba mostra.
- **Separar delivery de salão** no faturamento — hoje `vendas` é o total do estabelecimento.
- **Alerta ativo**: hoje o dono só vê "paga e não está vendendo" se abrir a aba; virar evento do
  Jarvas ou aviso no topo do Console é rodada própria.
