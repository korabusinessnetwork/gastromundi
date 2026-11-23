# Refatoração 2.9, terceira fatia: as comandas donas do próprio estado

> Pedido do dono (2026-11-23): *"faça"*.

## A mudança

- `ComandasProvider` passa a ser dono das comandas em aberto, do que o garçom já lançou,
  das sete ações (abrir, editar, fechar, travar, renovar e soltar a trava, marcar lançada)
  e do tempo real entre o garçom e o caixa, recortados inteiros do `AppContext.jsx`.
- A abertura e a drenagem da fila hidratam pelo canal interno `useComandasCarga()`
  (`definirComandas`, que aceita valor ou função, como o `setState`).
- `lockIndisponivelRef` passa a nascer no `AppProvider` externo: a carga descobre se o
  banco tem as colunas da trava, e as travas das comandas obedecem.
- Usuário logado e fila offline chegam pela mesma ponte do catálogo.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum estado nem ação das comandas mora mais no `AppContext.jsx` | `grep`; lint sem nome sobrando |
| 2 | Testes do contexto e do PDV passam sem alteração, inclusive a fila offline de ponta a ponta (a comanda removida sem rede) | suíte; diff |
| 3 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |
