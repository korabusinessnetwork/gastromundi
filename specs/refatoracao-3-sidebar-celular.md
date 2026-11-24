# Refatoração 3: Sidebar e tela do celular em ganchos

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

| Tela | Antes | Tela depois | Gancho | Componentes novos |
|---|---|---|---|---|
| `components/desktop/Sidebar.jsx` | 815 linhas, 14 `useState` | 247 | `src/app/hooks/useSidebar.js` (14) | janelas da senha do relatório, das comandas fechadas, do cancelamento de venda fechada e do convite a upgrade, em `components/desktop/sidebar/` |
| `pages/MobilePage.jsx` | 795 linhas, 19 `useState` | 431 | `src/pages/mobile/hooks/useMobilePage.js` (14), com o lançamento de comanda em `useEstadoLancamentoComanda` (5) | `pages/mobile/pagina/TelaModulo` |

O gancho da Sidebar fica em `src/app/`, porque a barra lateral é a moldura do app, não
uma funcionalidade. `NavItem`, `LockedByPlanoItem` e `linkStyle`, que a Sidebar define
dentro de si e que são desenho de tela, ficaram na tela. O carregando e o caixa fechado
do celular, retornos antecipados com JSX, também ficaram na tela, junto com os
adaptadores das abas que vêm depois deles.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum arquivo das duas telas passa de 600 linhas nem de 15 `useState` | `wc -l`, contagem |
| 2 | Testes existentes passam sem alteração | suíte |
| 3 | O cancelamento de venda fechada e a senha do relatório ganham teste de tela, provado por sabotagem | `Sidebar.test.jsx` |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. Arquivos acima de 600 linhas: 8 para 6.
