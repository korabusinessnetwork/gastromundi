# Refatoração 2.9, segunda fatia: o catálogo dono do próprio estado

> Pedido do dono (2026-11-23): *"faça"*.

## A mudança

- `CatalogoProvider` passa a ser dono de produtos, saldos, mínimos e grupos de categoria,
  das 11 ações e do tempo real do estoque. O código foi recortado inteiro do
  `AppContext.jsx`, sem reescrita de lógica.
- A abertura do app hidrata pelo canal interno `useCatalogoCarga()` (`definirProdutos`,
  `definirSaldos`, `definirMinimos`, `definirGruposCategoria`, `definirCategoriaGrupos`).
- O usuário logado e a fila offline ainda moram no `AppProvider`: as ações do catálogo os
  leem por `pontesRef`, no momento da chamada, como sempre leram. A ponte sai quando a
  sessão e o offline mudarem de lugar.
- `aplicarNumeroRemoto` se muda com o tempo real do estoque e continua reexportado pelo
  `AppContext`, por causa do teste dele.
- O mapa categoria para grupo deixa de ser recalculado a cada render da fachada: ela lê o
  memorizado do catálogo.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum estado nem ação do catálogo mora mais no `AppContext.jsx` | `grep`; lint sem nome sobrando |
| 2 | Testes do contexto passam sem alteração, inclusive idempotência da baixa, tempo real do estoque e a fila de ponta a ponta | suíte; diff |
| 3 | Os três ajustes do caixa que estavam entre o estoque e os grupos continuam no contexto | `grep` |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |
