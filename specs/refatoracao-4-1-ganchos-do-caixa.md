# Refatoração 4.1: os ganchos do caixa na pasta da funcionalidade

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

1. `useFinalizarPagamento` e `useCancelarComanda`, com os testes, saem de
   `components/desktop/views/PDVView/` para `src/features/pdv/hooks/`. O celular usa o
   primeiro para a venda de balcão; agora nem o gancho do celular depende da pasta do
   computador.
2. **Guard do dinheiro reapontado.** `consolePagamentoGuard` cobra que nenhum erro vá
   cru para o `console` no caminho do pagamento, mas lia `PDVView/index.jsx`, e desde a
   fase 3 a lógica do caixa mora nos ganchos. Como ele só cobra ausência, continuava
   passando sem ver nada. Agora lê também `usePdv`, `useCheckout`, `usePdvCelular` e
   `useFinalizarPagamento` no endereço novo. Os outros guards que leem arquivos pelo
   caminho foram conferidos; nenhum outro lia arquivo dividido na fase 3.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os dois ganchos e seus testes moram em `features/pdv/hooks/`, sem cópia na pasta antiga | `git mv`; busca pelo caminho antigo vazia |
| 2 | O guard do dinheiro cobre os ganchos onde a lógica mora, provado por sabotagem | `console.error(err)` no gancho do celular faz o guard falhar |
| 3 | Testes passam sem alteração de asserção | suíte |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. Imports de `features/` para a pasta do computador: 13 para 10
(arquivos: 11 para 10). Avisos de lint: 38 para 35.
