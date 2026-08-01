# D14-GUARD — o guard do número do delivery proíbe o `lpad` errado, não o `lpad`

## 1. Escopo

Corrigir `src/lib/deliveryHorarioSqlGuard.test.js` para que ele proíba a **forma que trunca**
(`lpad(x, 3, '0')`) e a forma que estoura (`to_char(n,'FM000')`) em código ativo das migrations
de delivery, em vez de proibir o token `lpad(` e **exigir** `'FM000'` — que é o bug D14 ao contrário.

## 2. Fora de escopo

- Mexer no SQL das migrations `20260903`, `20260907` e `20260909`: elas já estão corrigidas no disco
  e já foram aplicadas em produção. Esta rodada conserta o guard, não o banco.
- Criar guard novo para migration que ainda não tem, ou estender o guard a outras funções.
- Refatorar as partes do arquivo que já funcionam (extração dos casos do autoteste, comparação com
  `deliveryDeveEstarAberto`/`paraMinutos`, ordem das migrations).
- Qualquer mudança em `src/` fora do arquivo de teste.

## 3. Origem e decisões que este item honra

Não existe no backlog escrito — é sinal de código (`vitest run` vermelho), a fonte 4 do `/proximo`.
O `/aprender` desta rodada cadastra o item em `docs/09_BACKLOG/tech-debt.md`.

Honra o defeito **D14** documentado no cabeçalho do próprio arquivo de teste e a regra do `CLAUDE.md`:
"Rodar `npm test` antes de commitar". O guard existe para impedir que o bug do número do pedido volte;
hoje ele obriga a volta dele.

## 4. Arquivos afetados

- `src/lib/deliveryHorarioSqlGuard.test.js` — modificado (único arquivo de código da rodada).
- `specs/d14-guard-lpad-que-trunca.md` — este spec.
- `specs/_loop.md` — ledger, criado no passo 8 do ciclo.

## 5. Critérios de aceite

1. `npx vitest run src/lib/deliveryHorarioSqlGuard.test.js` fecha verde, e a suíte inteira
   (`npm test`) fecha com **180 de 180 arquivos** — nenhum outro teste quebrado de tabela.
2. O guard reprova a forma que trunca: existe um teste que roda a regex de proibição contra a amostra
   `lpad(numero, 3, '0')` e exige que ela case.
3. O guard aprova a forma correta: o mesmo teste roda a regex contra
   `lpad(v_seq::text, greatest(3, length(v_seq::text)), '0')` e exige que ela **não** case.
4. `FM000` passa a ser proibido em linha ativa das migrations de delivery, no lugar de exigido.
5. `blocosDaFuncao` devolve o corpo da função **sem comentários**, e existe um teste que prova isso:
   uma âncora presente só dentro de um comentário não satisfaz a âncora.
6. A âncora de `criar_pedido_delivery` passa a exigir a fórmula nova
   (`greatest(3, length(...))`) e a migration posterior `20260907` a satisfaz pelo **código**, não
   pelo comentário.
7. As três formas defeituosas antigas continuam proibidas em linha ativa da corretiva:
   `created_at::date = now()::date`, `count(*) + 1` e agora `lpad(x, 3, '0')` / `FM000`.
8. Nenhum arquivo fora dos listados em §4 é modificado.

Critérios obrigatórios do `CLAUDE.md` aplicáveis a esta rodada: nenhum segredo hardcodado (o arquivo
não toca em rede nem em env), nenhum `console.log` esquecido, nenhum `TODO` sem justificativa.
Multi-tenant, RLS, dinheiro, CSS e tela nova **não se aplicam** — a rodada mexe só em teste.

## 6. Edge cases conhecidos

- **Regex ingênua casaria a forma certa.** `lpad(v_seq::text, greatest(3, length(v_seq::text)), '0')`
  contém o texto `(3,`. A proibição precisa exigir **vírgula** antes do `3` (`, 3, '0')`), senão o
  conserto é acusado como se fosse o bug.
- **Comentário na mesma linha do código.** `linhasAtivas` só descarta a linha que *começa* com `--`.
  Um `-- antes era , 3, '0')` no fim de uma linha boa daria falso positivo — o corte precisa remover
  também o comentário de fim de linha.
- **`--` dentro de string SQL.** Cortar em `--` cegamente quebraria uma string que contivesse `--`.
  Conferir que não existe nenhuma no arquivo da corretiva antes de usar o corte, e registrar a
  limitação em comentário.
- **Migration futura que redefina as funções.** O teste de "quem vier depois leva o conserto junto"
  precisa continuar valendo para arquivos com nome maior que `20260903`, agora cobrando a fórmula
  nova.
- **Uma âncora vazia passa em tudo.** O teste das amostras precisa provar os dois lados (casa o
  errado, não casa o certo), senão afrouxar a regex vira o caminho fácil de "fazer passar".

## 7. Definição de "aprovado sem ressalvas"

Todos os oito critérios em sim, suíte `npm test` verde, sem `TODO` pendente, sem `console.log`
esquecido, e nenhuma migration modificada nesta rodada.

---

## Resultado da review (2026-08-01) — aprovado sem ressalvas

`npm test` → **180 de 180 arquivos, 2761 de 2761 testes**. Uma rodada de correção, sem escalada.

| # | Critério | Evidência |
|---|---|---|
| 1 | Suíte verde | `npm test` — 180/180, 2761/2761 |
| 2 | Reprova a forma que trunca | `deliveryHorarioSqlGuard.test.js` → `it("a proibição pega a fórmula que trunca…")`, `LPAD_QUE_TRUNCA.test("lpad(v_seq::text, 3, '0')") === true` |
| 3 | Aprova a forma que cresce | mesmo `it`: `LPAD_QUE_TRUNCA.test(certa) === false` e `LPAD_QUE_CRESCE.test(certa) === true` |
| 4 | `FM000` proibido, não exigido | `TO_CHAR_QUE_ESTOURA` entrou em `ANCORAS_DO_CONSERTO.criar_pedido_delivery.proibidas` e no teste da corretiva |
| 5 | `blocosDaFuncao` sem comentários | `it("a âncora não se satisfaz com a fórmula citada dentro de um comentário")` |
| 6 | `20260907` satisfaz pelo código | conferido fora do teste: no bloco limpo, `LPAD_QUE_CRESCE` = true, `FM000` = **false**; no fonte cru, `FM000` = **true** — era exatamente esse comentário que sustentava a âncora antiga |
| 7 | As quatro formas defeituosas proibidas | `linhasAtivas` filtra `created_at::date = now()::date`, `count(*) + 1`, `LPAD_QUE_TRUNCA` e `TO_CHAR_QUE_ESTOURA` |
| 8 | Nada fora do escopo | `git status`: só `src/lib/deliveryHorarioSqlGuard.test.js` (as três migrations já vinham modificadas de antes da rodada) |

**Acréscimo não previsto no spec:** contador `blocosConferidos` com `expect(...).toBeGreaterThan(0)`.
O laço sobre as migrations posteriores não assertava nada se `blocosDaFuncao` devolvesse vazio — o
teste ficaria verde sem ter conferido nada. Sem ele o critério 6 não teria como ser provado.

## Fora desta rodada, para uma próxima

- `LPAD_QUE_TRUNCA` exige `lpad(` e `, 3, '0')` na **mesma linha**. Uma chamada quebrada em duas
  linhas escaparia. Não acontece hoje em nenhuma migration; se acontecer, a proibição precisa
  passar a olhar o bloco com `s` em vez da linha.
- O corte de comentário quebraria uma string SQL que contivesse `--`. Conferido que não existe
  nenhuma nas migrations de delivery; está anotado no código onde se trata.
