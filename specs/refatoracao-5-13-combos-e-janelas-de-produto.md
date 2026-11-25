# Refatoração 5.13: combos e janelas de produto sem estilo inline, e a regra sem emoji

> Pedidos do dono (2026-11-25): *"Continue"* e *"Bote uma regra, não vamos ter emotes dentro
> do sistema"*.

## A mudança

- Combos: `CombosView.jsx` (16), `combos/ModalCombo.jsx` (22) e `combos/Toggle.jsx` (2) para 0
  (sobra o espaçamento de `sz` como variável na raiz). Combo inativo, modo (combo ou
  substituir), situação, interruptor ligado, comportamento escolhido e item com preço
  personalizado viraram modificadores; hover do dropdown em CSS; `:disabled` em Salvar e
  Excluir. O texto de ajuda tinha `fontSize: 12` cravado e passou para `var(--fs-xs)`, que é
  12px.
- Janelas de produto: `produtos/ModalCategorias.jsx` (13), `ConfirmarExclusaoCategoria.jsx`
  (7), `ConfirmarExclusaoProduto.jsx` (6) e `CategoriasComBusca.jsx` (4) para 0. As duas
  confirmações de exclusão passaram a usar os mesmos modificadores de tom (`--perigo`,
  `--info`). Com isso a área de Cadastro de Produtos inteira (lista, cadastro, categorias,
  exclusões, subprodutos e combos) fica sem estilo inline.

Antes da conversão o Supabase falso ganhou dois combos (um ativo com produto de preço
personalizado e subproduto, um inativo de substituição) e o roteiro ganhou oito telas.

## A regra sem emoji

`CLAUDE.md` ganha a regra, `src/lib/emojiGuard.test.js` a cobra na suíte (emoji em texto JSX,
string e template; comentário fica de fora) contra uma linha de base que só encolhe: 118 em
58 arquivos. `scripts/contarEmoji.mjs` faz a conta para o guard e para as métricas. Os testes
da contagem foram vistos falhando antes da função existir, e o guard com a linha de base vazia
acusou os 58 arquivos. Decisões do dono registradas como decisão 037: os emojis do código saem
junto com a fase 5, e o ícone emoji de cada produto sai numa rodada própria depois dela.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os sete arquivos sem estilo inline fora de variável CSS | guard: os sete saem da linha de base |
| 2 | Combos e janelas de produto idênticos em todos os estados fotografados | `comparar` contra `--ref HEAD`: 114 telas, 0 diferença |
| 3 | A regra sem emoji cobrada pela suíte | `emojiGuard`: 4 testes verdes, vermelho visto antes |
| 4 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: os arquivos desta rodada ainda têm emoji
  (combos, categorias); a conversão foi fotografada antes da regra, e eles saem a partir da
  próxima rodada, junto com o estilo de cada arquivo.
