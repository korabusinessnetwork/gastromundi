# Refatoração 3.5: o Console em gancho e aba própria

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

`ConsolePage.jsx` tinha 1.551 linhas e 28 `useState` num componente só.

1. As funções de formatação e as constantes do módulo (`formatarData`, `rotularPlano`,
   `BLOCO_LISTA`...) vão para `src/pages/console/apoio.js`.
2. O estado, a carga, os recortes da lista e as ações vão para
   `src/features/console/hooks/useConsole.js` (10 `useState`), com o estado agrupado em
   `useEstadoJanelasConsole` (qual janela está aberta, a fila de pedidos, 10) e
   `useEstadoCadastroConsole` (add-ons, cartão de primeiro acesso, cópia e busca, 8).
3. A aba Estabelecimentos, o último ramo do ternário das abas, vira
   `AbaEstabelecimentos.jsx`. O JSX foi copiado sem mudança.
4. **Regra de lint nova, `react/jsx-no-undef`.** Na primeira passada o import da aba
   ficou de fora; o lint não acusou e a tela só quebrava ao desenhar, pegos pelos testes
   e pelas fotos. A regra passa a pegar componente sem origem antes de qualquer teste.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum arquivo do Console passa de 600 linhas nem de 15 `useState` | `wc -l`, contagem |
| 2 | Os 152 testes do Console passam sem alteração | suíte |
| 3 | Componente JSX sem import é erro de lint | `react/jsx-no-undef` em `eslint.config.js` |
| 4 | Telas idênticas no roteiro de fotos | `screenshots-refatoracao.mjs comparar` |
| 5 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. Tela com 313 linhas, aba com 586, gancho com 597. O gancho
ficou rente ao limite; se crescer, os recortes da lista (`tenantsVisiveis` e vizinhos)
são o próximo corte natural.
