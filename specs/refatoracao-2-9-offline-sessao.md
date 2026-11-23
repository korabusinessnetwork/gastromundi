# Refatoração 2.9, últimas fatias: offline e sessão donos do próprio estado

> Pedido do dono (2026-11-23): *"faça"*.

## A mudança

- `OfflineProvider`, por fora dos assuntos: rede, aviso de abertura sem internet,
  contador da fila, notas pendentes, `enfileirarOffline` e o aviso de reconexão. A
  DRENAGEM fica na coordenação, porque reenvia operações de todos os assuntos.
- `SessaoProvider`, o mais de fora: usuário logado, equipe, estabelecimento, tema,
  permissões, login, logout, inatividade, teto de 8 horas, cadastro de usuário e o aviso
  de inatividade na tela. Login e restauração disparam a carga por `carregarRef`.
- Com os dois por fora, a ponte provisória (`pontesRef`) acabou: catálogo, comandas e
  caixa leem o usuário por `useSessao()` e a fila por `useOffline()`.
- Os `import` foram separados por script: o contexto perdeu 54 nomes que eram só da
  sessão, e o `SessaoProvider` descartou 40 que eram só da carga.

## O que fica no `AppContext.jsx`

A coordenação: a carga do estabelecimento (`bootstrap`), o dreno da fila offline, a
análise do Jarvas, as pontes de impressão e a fachada `useApp()` usada pelos testes do
contexto. São 724 linhas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum estado da sessão nem do offline mora mais no `AppContext.jsx` | `grep`; lint sem nome sobrando |
| 2 | `pontesRef` não existe mais | `grep` |
| 3 | Os 119 testes do contexto passam sem alteração, inclusive sessão, login, bloqueio, Ponte e a fila de ponta a ponta | suíte; diff |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |
