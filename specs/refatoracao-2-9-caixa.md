# Refatoração 2.9, quarta fatia: o caixa dono do próprio estado

> Pedido do dono (2026-11-23): *"faça"*.

## A mudança

- `CaixaProvider` passa a ser dono das vendas, fechamentos, fundo, abertura e sessão do
  caixa e dos movimentos (sangria e suprimento), das sete ações e do tempo real das vendas,
  recortados inteiros do `AppContext.jsx`.
- A abertura do app hidrata pelo canal interno `useCaixaCarga()`.
- O reenvio da venda pela fila offline continua no `AppContext` (ele é da drenagem, não do
  caixa) e segue usando a gravação normalizada da camada de dados.
- Usuário logado e fila offline chegam pela mesma ponte das outras fatias.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum estado nem ação do caixa mora mais no `AppContext.jsx` | `grep`; lint sem nome sobrando |
| 2 | Testes do contexto passam sem alteração, inclusive venda, cancelamento e a fila offline de ponta a ponta | suíte; diff |
| 3 | O guard de `caixa_movimentos` segue a linha gravada até o `CaixaProvider`, sem afrouxar | suíte; diff |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |
