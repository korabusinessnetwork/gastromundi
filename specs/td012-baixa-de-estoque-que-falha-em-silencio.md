# TD012 — baixa de estoque que falha precisa alertar quem pode agir

## 0. O que já estava feito (levantamento antes do escopo)

O título do TD012 está desatualizado. A parte "engole a exceção e mostra estimativa local como se
fosse sucesso" **já foi corrigida no `AppContext`**: `baixarEstoque` desfaz o desconto otimista
(`AppContext.jsx:1334`), chama `reportarFalha` (Sentry), emite `estoque.baixa.falhou` em
`jarvas_eventos` e o `useFinalizarPagamento` registra `comanda:finalizar:estoque_falhou` no log de
atividade. O comentário em `AppContext.jsx:1333` cita o próprio TD012.

O que **não** foi feito é a outra metade da frase — "falha de baixa precisa ser visível
(alerta/log)". Hoje ela é visível só para quem lê Sentry, a tabela `jarvas_eventos` ou o
`activity_log` — ou seja, para o desenvolvedor. **Nenhuma das três chega ao gestor**, cuja superfície
é o painel do Jarvas (`jarvas_insights`), o mesmo lugar onde ele já recebe "estoque baixo" e "venda
sem estoque". Um furo de inventário continua invisível para quem pode consertá-lo.

Sobram também dois defeitos reais na biblioteca, na mesma função:

- `processarBaixaEstoque` devolve `quantidade: quantidadeAnterior - qty` **junto com o erro**
  (`estoque.js:148`) — um saldo que nunca existiu no banco. O `AppContext` ignora esse número e
  desfaz o otimista, então hoje não há bug visível; mas a biblioteca continua entregando um número
  fabricado, e o teste `estoque.test.js:194` chega a afirmá-lo (`// fallback calculado localmente`).
  É o TD012 literal, vivo, um andar abaixo de onde foi corrigido.
- `chamarRpc` é chamada sem `try/catch` (`estoque.js:145`), diferente das duas irmãs
  (`entradaEstoque` em `AppContext.jsx:1369` e `baixarEstoqueSubproduto` em `AppContext.jsx:1426`,
  que embrulham). Se a RPC **lançar** em vez de devolver `{ error }`, a exceção sobe até o
  `useFinalizarPagamento`, que faz `await baixarEstoque(...)` sem proteção (`:210`) — depois da
  venda já gravada.

## 1. Escopo

Fazer a falha de baixa de estoque virar **alerta do Jarvas** para o gestor, e tirar da
`processarBaixaEstoque` o saldo fabricado e a exceção que escapa.

## 2. Fora de escopo

- **Bloquear a venda.** Baixa de estoque nunca trava o pagamento — regra já escrita em
  `useFinalizarPagamento.js:216` e `AppContext.jsx:1421`. Esta rodada não muda isso.
- **Avisar o operador na tela do PDV.** Onde e como avisar sem atrapalhar o caixa no meio do
  atendimento é decisão de produto que não está escrita em lugar nenhum. O TD012 pede
  "alerta/log", e o painel do Jarvas é o alerta que o projeto já tem.
- **Alerta agregado para falha sistêmica.** Se a RLS quebrar, cada produto distinto vendido gera seu
  próprio alerta (o dedupe evita a repetição por produto, não a multiplicação entre produtos). Somar
  isso num único alerta é regra nova de agregação — fica registrado no §6, não construído aqui.
- **Regra periódica no `jarvasEngine`.** O alerta é imediato, no instante da falha, como o de
  oversell. Não se cria varredura nova.
- **`entradaEstoque`.** Também só reporta para o Sentry, mas o TD012 fala de **baixa**; entrada é
  outra fatia e o erro dela já aparece na tela de quem está lançando a nota.
- **SQL.** Nenhuma migration criada ou alterada.

## 3. Origem e decisões que este item honra

- **TD012** (`docs/09_BACKLOG/tech-debt.md:81`) e **S2-1** (`docs/09_BACKLOG/sprint_pre_venda.md:36`):
  "com estoque real, uma baixa que falha silenciosamente corrompe o inventário".
- **Decisão 010 / `JARVAS.md`**: o Jarvas **alerta**, nunca conserta sozinho. O alerta não repõe
  estoque nem repete a baixa — só mostra o furo e leva o gestor até o estoque.
- **F008** (baixa automática + alertas de mínimo): o alerta novo entra na mesma família de
  `gerarAlertaEstoque` e `gerarAlertaOversell`, com o mesmo dedupe.
- **Princípio nº 1**: o alerta é lido por dono de restaurante, não por programador — mensagem em
  português do dia a dia, com o erro técnico guardado em `origem`, fora do texto.

## 4. Arquivos afetados

- `src/lib/estoque.js` — `gerarAlertaBaixaFalhou` (nova, no molde de `gerarAlertaOversell`); em
  `processarBaixaEstoque`, `try/catch` em volta do `chamarRpc` e retorno honesto no erro.
- `src/lib/estoque.test.js` — testes novos; **o teste de `estoque.test.js:194` muda**, porque ele
  hoje afirma exatamente o comportamento que esta rodada corrige.
- `src/context/AppContext.jsx` — dispara o alerta em `baixarEstoque` e `baixarEstoqueSubproduto`, no
  ramo de falha que já exclui o offline.
- `src/context/AppContext.estoqueIdempotencia.test.jsx` — asserções de que falha real alerta e
  offline não.
- `specs/td012-baixa-de-estoque-que-falha-em-silencio.md` — este spec.
- `specs/_loop.md` — ledger, passo 8.

Para o passo `/aprender` (não é build): `docs/09_BACKLOG/tech-debt.md` — status do TD012 e o **ID
duplicado**, já que a seção `### [TD012] key={i} (índice) em listas React` (linha 224) usa o mesmo
número do item de estoque e não tem linha na tabela ativa.

Reuso obrigatório (não reescrever): `registrarInsight` e `buscarInsights` de `@/lib/jarvas`,
`isErroDeRede` e `reportarFalha` já usados no `AppContext`, e o formato de `origem.chave` das duas
funções de alerta que já existem no arquivo.

## 5. Critérios de aceite

1. `processarBaixaEstoque`, quando a RPC devolve erro, retorna `quantidade` igual a
   `quantidadeAnterior` — o saldo que o banco de fato tem, porque nada foi descontado. Nunca o
   valor estimado `anterior - qty`.
2. `chamarRpc` que **lança** vira `{ error }` normal: `processarBaixaEstoque` não propaga exceção
   em nenhum caminho, igual às duas irmãs do `AppContext`.
3. Baixa que falhou não dispara alerta de mínimo nem de oversell (vale hoje; não pode regredir).
4. `gerarAlertaBaixaFalhou` registra um insight `tipo: "alerta"`, `severidade: "danger"`,
   `visibilidade: "operacional"`, `modulo: "estoque"`, com dedupe por `origem.chave` no mesmo
   formato dos irmãos, e é fire-and-forget — nunca lança, nunca bloqueia, nunca é awaitada no
   caminho da venda.
5. O título e a descrição do alerta não contêm jargão técnico nem o texto cru do erro do Postgres; a
   mensagem do banco vai em `origem.dados.erro`, para o diagnóstico. A descrição diz o que aconteceu
   em termos de operação (o estoque do produto **não** foi descontado e o saldo na tela está maior do
   que a realidade) e a ação leva ao estoque.
6. `baixarEstoque` só alerta no ramo de falha real: quando `isErroDeRede(error)` é verdadeiro, a
   baixa entra na fila offline e **nenhum** alerta é registrado.
7. `baixarEstoqueSubproduto` alerta no mesmo ramo, com chave própria de subproduto, e também não
   alerta quando é offline.
8. A venda continua não sendo bloqueada: os testes de `useFinalizarPagamento` seguem verdes sem
   alteração de comportamento.
9. Sem `console.log` novo, sem segredo hardcodado, sem `select *`, sem `TODO` sem justificativa.
10. Nenhum arquivo tocado fora do §4; nenhuma migration criada ou alterada.
11. `npm test` verde, com os testes novos.

## 6. Edge cases conhecidos

- **Falha sistêmica (RLS quebrada, papel errado).** Todo produto vendido falha. O dedupe evita
  repetir o alerta do mesmo produto, mas serão vários alertas — um por produto distinto. É melhor do
  que o silêncio de hoje, e a agregação fica registrada como próxima fatia.
- **Offline não é falha.** A RPC vai para a fila com o mesmo `opId` e é reaplicada. Alertar aqui
  ensinaria o gestor a ignorar o alerta — o pior resultado possível.
- **`buscarInsights` indisponível.** O alerta é engolido em silêncio, como nos irmãos: alerta do
  Jarvas nunca pode quebrar a venda.
- **Erro sem `message`.** Guardar `code` ou a forma em texto, sem quebrar o insight.
- **Produto ou subproduto sem nome.** O `AppContext` já cai em `Produto ${id}`; o subproduto pode vir
  com `nome` nulo — o alerta precisa continuar legível.
- **Quantidade fracionada** (unidade de estoque com fator de consumo): o texto usa o mesmo
  `fmtNum` do arquivo, que já corta zeros à direita.

## 7. Definição de "aprovado sem ressalvas"

Todos os onze critérios em sim, `npm test` verde, sem `TODO` pendente, sem `console.log` esquecido,
nenhuma migration criada ou alterada, e nenhuma regressão em `estoque.test.js`,
`AppContext.estoqueIdempotencia.test.jsx` e `useFinalizarPagamento.test.jsx`.

## 8. Resultado da review (2026-08-01)

**Aprovado sem ressalvas — 11 de 11 critérios em sim, sem rodada de correção.**
`npm test` (vitest 4.1.9): **181 arquivos, 2801 testes verdes** (eram 2790 na rodada anterior).

| # | Critério | Evidência |
|---|----------|-----------|
| 1 | Erro devolve o saldo anterior, nunca o estimado | `src/lib/estoque.js:219`; teste `estoque.test.js` — `expect(quantidade).toBe(5)` |
| 2 | `chamarRpc` que lança vira `{ error }` | `estoque.js:203-212`; teste "RPC que LANÇA vira erro normal" |
| 3 | Falha não dispara alerta de mínimo nem de oversell | `estoque.js:219` retorna antes das checagens de `:227-234`; `expect(registrarInsight).not.toHaveBeenCalled()` |
| 4 | Alerta com a forma dos irmãos, dedupe e fire-and-forget | `estoque.js:150-180`; `void` em `AppContext.jsx:1345` e `:1455` |
| 5 | Sem jargão no texto; erro cru em `origem.dados.erro` | `estoque.js:165-174`; teste "o texto que o gestor lê não tem jargão do banco" |
| 6 | `baixarEstoque` não alerta offline | `AppContext.jsx:1329-1331` retorna antes; teste "sem internet NÃO alerta" |
| 7 | `baixarEstoqueSubproduto` com chave própria, também sem alertar offline | `AppContext.jsx:1444-1447` e `:1455`; dois testes |
| 8 | Venda segue sem bloqueio | `useFinalizarPagamento.js` não foi tocado; suíte verde |
| 9 | Sem `console.log`, segredo, `select *` ou `TODO` | busca em `estoque.js` sem ocorrência; só `console.error` no `catch`, como nos irmãos |
| 10 | Nada fora do §4, nenhuma migration | `git status`: 4 arquivos modificados + este spec |
| 11 | Suíte verde com os testes novos | 181/2801 |

## 9. O que ficou registrado no `/aprender`

- `docs/09_BACKLOG/tech-debt.md` — TD012 resolvido, com seção de resolução própria; a seção
  `key={i}` que usava o mesmo número virou **TD015** e ganhou a linha na tabela ativa que nunca teve.
- `docs/09_BACKLOG/sprint_pre_venda.md` — S2-1 marcado como feito, com o que ficou de fora.
- `memory/bugs.md` — a linha do `key={i}` aponta para TD015.
- `memory/learnings.md` — duas linhas: "reportar não é alertar" (três destinos invisíveis não fecham
  um item de falha silenciosa) e "um teste pode estar guardando o bug", que foi o caso aqui.
