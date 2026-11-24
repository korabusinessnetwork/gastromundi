# Refatoração 5.2a: a prova visual cobre o carrinho e a finalização

> Pedido do dono (2026-11-24): *"continue"*, e no meio *"revise as skills que utilizamos"*.

## Por que antes de converter estilo

A fase 5 tira estilo inline arquivo por arquivo, e a prova de que nada mudou na tela é o
roteiro de fotos, porque a suíte de testes não enxerga CSS. O roteiro não mostrava o carrinho
do PDV nem a finalização: converter o `CartPanel` e o `CheckoutView` seria às cegas.

## A mudança

1. **Dado falso novo:** a comanda 15, com item com emoji, item com observação e item cancelado
   com motivo (`scripts/telas/supabaseFalso.mjs`). A comanda 12 de sempre não muda.
2. **Duas telas novas no roteiro:** o PDV com a comanda 15 aberta e um produto novo no carrinho
   (`app-pdv-comanda`), e a finalização da comanda 15 (`app-pdv-finalizar`). O roteiro tem 46 telas.
3. **Defeito do Supabase falso corrigido, pela causa raiz.** A comanda não abria: a mensagem
   na tela era "Comanda 15 está em uso por outra pessoa". O PDV pede a trava com um UPDATE que
   devolve a linha (`Prefer: return=representation`), e o falso respondia toda escrita com lista
   vazia, que o app lê como trava alheia. Agora o UPDATE que pede a representação recebe as linhas
   com a mudança aplicada, sem gravar nada. Duas hipóteses antes dessa foram descartadas por
   evidência (o seletor do cartão estava certo; o cliente não pede objeto, pede lista).
4. **Linha de base das fotos refeita** com o código atual, antes de qualquer conversão.

## Skills (pedido no meio da rodada)

As três skills atualizadas hoje no Claude desktop foram lidas: `engenharia-com-evidencia` (nova),
`loop-spec-build-review` e `full-automatico`. As Regras v2 do loop (prova por critério, TDD,
revisão em duas etapas com crítico, importante e menor, evidência na própria rodada) foram
acrescentadas a `.claude/commands/spec.md`, `build.md`, `review.md` e à cópia da skill no projeto,
que mantém a entrevista inicial que a versão da conta deixou de ter.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | O roteiro fotografa o carrinho com observação, item cancelado e item novo, e a finalização | as duas fotos novas, conferidas |
| 2 | Todos os passos do roteiro concluem | saída do `capturar`: "46 telas fotografadas", sem passo falho |
| 3 | Os comandos do loop têm as Regras v2 | `grep "Regras v2" .claude/commands/*.md` |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: menor, anotado: o nome do item cancelado ("Coxinha") sai cortado com reticências
  porque a caixa do motivo aperta a coluna. Comportamento de hoje, a ver na conversão do carrinho.
