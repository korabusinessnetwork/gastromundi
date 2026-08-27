# TD012 (resto) — falha sistêmica de baixa vira UM alerta, não um por produto

## 1. O problema

O alerta de "Estoque não descontado" (rodada anterior) é por item. Isso está certo
quando um produto falha sozinho — produto apagado, saldo inconsistente. Mas a causa
mais comum de baixa recusada **não é** de um item: é RLS quebrada, sessão expirada
ou migration faltando. Quando isso acontece, **toda** baixa da venda falha.

Uma comanda com dez itens gera dez cartões no painel do Jarvas dizendo exatamente a
mesma coisa. O gestor lê o primeiro, entende "problema no Chopp", e ignora os outros
nove. O alerta desaparece por excesso — que dá no mesmo que não existir. Pior: a
mensagem individual manda "confira a contagem deste item", conselho errado quando o
sistema inteiro está impedido de mexer no estoque.

## 2. Escopo

- `src/lib/estoque.js`: função pura de decisão + coletor de lote + o alerta agregado.
- `src/components/desktop/views/PDVView/useFinalizarPagamento.js`: abre o lote antes
  das baixas da venda e fecha depois (em `finally`).
- `src/context/AppContext.jsx`: mesmo par em volta do laço de falhas do
  `drenarPendenciasOffline` — um drain que descarta várias baixas de uma vez é
  exatamente a mesma situação.

## 3. Fora de escopo

- **Aviso na tela do PDV para o operador.** Continua sendo decisão de produto não
  escrita (interromper a fila do caixa com um erro de estoque tem custo próprio).
  O Jarvas é para o gestor; a tela do operador é outro assunto.
- Mudar a assinatura de `baixarEstoque`/`baixarEstoqueSubproduto` para carregar
  contexto de lote. É por isso que o lote é estado de módulo (§6).
- Retry, rollback da venda, ou qualquer mudança no comportamento da baixa em si.
  A baixa nunca bloqueou a venda e continua não bloqueando.

## 4. Regra

`decidirAlertaDeLote(itens, limiar = 3)` → `{ modo, itens }`:

| falhas na mesma operação | modo         | o que sai                          |
|--------------------------|--------------|------------------------------------|
| 0                        | `nenhum`     | nada                               |
| 1 a 2                    | `individual` | um alerta por item (comportamento antigo) |
| 3 ou mais                | `sistemica`  | um único alerta agregado           |

**Por que 3:** é o menor número que não confunde azar com padrão. Uma ou duas falhas
ainda cabem em causa própria do item; da terceira em diante, numa venda só, a causa é
comum. Função pura e exportada justamente para que esse número seja discutível sem
abrir o AppContext.

## 5. O alerta agregado

- **Chave fixa** `estoque:baixa-falhou:sistemica` — sem id de item. É o que faz uma
  queda de RLS inteira colapsar num único alerta aberto, em vez de um por venda até
  alguém resolver. O dedupe que já existia (`buscarInsights` por `origem.chave`) faz
  o resto sem código novo.
- Título e descrição dizem o que é: **não é problema de um produto, é o sistema que
  não está conseguindo descontar**, e todos os saldos na tela estão maiores que o
  real. Sem jargão de banco — o erro cru fica em `origem.dados.erro`, como nos irmãos.
- A descrição nomeia até 5 itens e resume o resto como "e mais N", para não virar um
  paredão de texto num cartão.
- `acao.params` leva `produto_ids` e `subproduto_ids` juntos (a ação só roteia para
  `/app/estoque`; os ids são diagnóstico).

## 6. Por que o lote é estado de módulo

Quem chama `gerarAlertaBaixaFalhou` é o `AppContext`, item a item, e não sabe que faz
parte de uma venda maior. Passar o lote por parâmetro obrigaria a mudar a assinatura
de `baixarEstoque` e `baixarEstoqueSubproduto` — duas funções públicas do contexto —
só para carregar contexto que só interessa ao alerta.

Duas garantias sustentam a escolha:

1. **O acúmulo é síncrono.** O `push` no lote acontece antes de qualquer `await`
   dentro de `gerarAlertaBaixaFalhou`. Todos os pontos de uso chamam com `void`
   (fire-and-forget), então a falha já está no lote quando `baixarEstoque` retorna —
   o `fecharLoteDeBaixas` depois do laço nunca perde um item.
2. **`profundidade` protege aninhamento.** Um lote aberto dentro de outro só publica
   no fechamento mais externo, então nenhum fechamento interno rouba os itens do
   externo.

Abrir e fechar sempre em `try/finally`: um lote deixado aberto por uma exceção
engoliria os alertas de todas as vendas seguintes — o oposto do que este spec quer.

## 7. Critérios de aceite

1. Três ou mais baixas recusadas na mesma venda produzem **um** `registrarInsight`.
2. Uma ou duas continuam produzindo um alerta por item, com as chaves de sempre.
3. Zero falhas não chama `buscarInsights` nem `registrarInsight`.
4. Alerta sistêmico já aberto não é reemitido na venda seguinte.
5. Depois de fechado o lote, uma falha avulsa volta a alertar na hora.
6. Falha do próprio Jarvas ao publicar o lote não lança nem quebra a venda.
7. `decidirAlertaDeLote` é pura, exportada e testada isoladamente.
8. Suíte inteira verde.

## 8. Resultado

`207 arquivos / 3627 testes` verdes (+15 testes novos).
