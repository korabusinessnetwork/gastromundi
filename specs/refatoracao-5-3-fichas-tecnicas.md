# Refatoração 5.3: Fichas Técnicas sem estilo inline

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

`admin/FichasTecnicasTab.jsx` tinha 74 atributos `style`; agora tem 0. As regras foram para
`admin/FichasTecnicasTab.css`, co-localizado (o resto das regras da aba continua em
`AdminView.css`). Onde uma propriedade nova também existe no `AdminView.css` para a mesma
classe, a regra usa duas classes e vence pela especificidade, não pela ordem dos arquivos.

- Cor do saldo do ingrediente: o valor calculado em JavaScript (`corEstq`) virou modificador
  por situação (`--zerado`, `--suficiente`, `--insuficiente`).
- Divisória "em todas as linhas menos a última": `border-bottom` + `:last-child`.
- Tela estreita (menos de 640px): modificador `--estreito` nos cinco elementos que mudavam,
  ligado ao mesmo `isNarrow`.
- Hover feito em JavaScript (dropdown de produto, item do estoque) virou `:hover`.
- `.admin__secao-label` tinha o mesmo estilo inline nos três usos (dois aqui, um nas Compras):
  foi para a classe compartilhada, e as Compras perderam esse inline também (22 para 21).

Antes da conversão o roteiro ganhou dado (uma ficha com ingrediente ligado e manual) e três
telas: a lista de fichas, o editor e a confirmação de excluir. Linha de base refeita com o
código sem conversão.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Fichas Técnicas sem estilo inline | guard: arquivo sai da linha de base |
| 2 | Lista, editor e confirmação de excluir idênticos | `screenshots-refatoracao.mjs comparar`: 51 telas, 0 diferença |
| 3 | Testes existentes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: a versão estreita do editor não é
  fotografada (no celular a Área Admin não existe como tela); as regras `--estreito` copiam
  as medidas de hoje, sem prova por imagem. Menor: campos de busca seguem a regra global de
  foco, como no carrinho.
