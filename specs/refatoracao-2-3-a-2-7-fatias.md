# Refatoração 2.3 a 2.7: as outras cinco fatias do contexto

> Pedido do dono (2026-11-23): *"pode seguir, sempre arrumei os erros antes de prosseguir"*.
> Mesma forma da 2.2, descrita no plano.

## Escopo

| Tarefa | Contexto e gancho | Chamadas que saíram do `AppContext.jsx` para |
|---|---|---|
| 2.3 | `OfflineContext`, `useOffline` | nenhuma (a fatia não fala com o banco) |
| 2.4 | `ConfigContext`, `useConfig` | `features/configuracoes/dados/config.js` |
| 2.5 | `CatalogoContext`, `useCatalogo` | `features/cardapio/dados/produtos.js`, `gruposCategoria.js`, `features/estoque/dados/saldos.js` |
| 2.6 | `ComandasContext`, `useComandas` | `features/comandas/dados/comandas.js` |
| 2.7 | `CaixaContext`, `useCaixa` | `features/caixa/dados/vendas.js`, `caixa.js` |

Com a 2.7, o contexto não importa mais o Supabase e a regra de lint passa a cobrir
`src/context/`: a tarefa 1.5 está cumprida.

## Fora de escopo

- `loading` e `isMobile` continuam só na fachada `useApp()`; não são de assunto nenhum e
  ganham lugar na 2.9.
- Telas trocando `useApp()` pelos ganchos (2.8) e o estado mudando de lugar (2.9).

## Critérios de aceite (para cada fatia)

| # | Critério | Como verificar |
|---|---|---|
| 1 | Tela que lê pelo gancho não é redesenhada quando outro assunto muda, e o teste prova que a mudança aconteceu | tabela em `AppContext.redesenho.test.jsx` |
| 2 | As ações da fatia têm a mesma identidade entre renders, e a fachada entrega as mesmas | idem |
| 3 | O gancho fora do provedor dá erro claro | idem |
| 4 | As chamadas daquele assunto saíram do `AppContext.jsx` | `grep`; `npm run metricas` |
| 5 | Os testes do contexto passam sem alteração; guard que lia o contexto segue o código para a camada de dados sem afrouxar | suíte; diff |
| 6 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 7 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |
