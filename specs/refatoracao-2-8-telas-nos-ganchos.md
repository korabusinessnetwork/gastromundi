# Refatoração 2.8: telas nos ganchos de cada assunto

> Pedido do dono (2026-11-23): *"pode seguir, sempre arrumei os erros antes de prosseguir"*.

## Escopo

- Codemod: cada `const { ... } = useApp();` das telas vira um ou mais ganchos de fatia,
  mantendo renomeios. Campo sem fatia ou comentário na desestruturação para o codemod em
  vez de adivinhar. Resultado: 60 desestruturações em 54 arquivos, sem nenhum problema.
- `loading` e `isMobile` entram na fatia da sessão (valem para o app inteiro).
- Os seis ganchos são reexportados por `@/context/AppContext`: as telas continuam
  importando de um lugar só, e os testes continuam dublando um módulo só.
- `ganchosDoMock` no `mockApp`: os 39 testes de formato padrão passam a dublar todos os
  ganchos com o mesmo objeto; os 7 de formato próprio foram trocados um a um.
- `RelatorioPage` deixa de repassar o contexto inteiro como propriedades a um componente
  que não recebe propriedade nenhuma.
- `useCorHook` (em `lib/`) também passa a ler pela sessão.

## Fora de escopo

- Remover a fachada `useApp()`, que fica só para os testes do contexto até a 2.9.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum arquivo fora do contexto e dos testes chama `useApp()` | `telasSemUseApp.test.js`, que pega uma regressão criada de propósito |
| 2 | Todos os testes de tela passam sem alteração de asserção | suíte; diff dos testes mexe só nos `vi.mock` |
| 3 | O `it.fails` da 2.1 saiu e a cobertura dele está na tabela de fatias | `AppContext.redesenho.test.jsx` |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |
