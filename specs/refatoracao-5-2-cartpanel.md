# Refatoração 5.2: o carrinho do PDV sem estilo inline

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

`PDVView/CartPanel.jsx` tinha 76 atributos `style`, o maior número do sistema. Agora tem um
só, o permitido: a atribuição das variáveis `--cart-largura`, `--cart-pad` e `--cart-pad-sm`
no elemento raiz, a partir de `sz`. Todo o resto foi para `CartPanel.css`:

- tamanhos de `sz` via `calc()` sobre essas variáveis, com os mesmos pixels de antes;
- transparências como o `color-mix` que o `alfa()` gerava, mesma porcentagem;
- estado por item (lançado, cancelado, novo) como modificador no item, com a cor no
  descendente do modificador, porque o nome do item é compartilhado entre lançados e novos;
- `:disabled` só onde a condição era idêntica (setas do seletor de quantidade e o botão de
  cancelar item); o "Lançar Pedido" usa `--pode`, porque o `disabled` dele inclui "salvando";
- hover feito em JavaScript (`onMouseEnter`/`onMouseLeave`) virou `:hover`;
- a senha de autorização com erro ganhou `aria-invalid` (regra da rodada 15).

Antes da conversão, o roteiro de fotos ganhou mais duas telas, a janela de cancelar item e a
confirmação de finalizar, e o campo de nova observação no carrinho, para cada estado que o CSS
novo desenha estar fotografado. A linha de base foi refeita com o código ainda sem conversão.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | O carrinho só tem o `style` de variáveis | guard: o arquivo sai da linha de base |
| 2 | Nenhuma tela muda, inclusive carrinho com item cancelado e observação, janela de cancelar e confirmação de finalizar | `screenshots-refatoracao.mjs comparar`: 48 telas, 0 diferença |
| 3 | Os testes do PDV passam sem alteração | suíte (10 arquivos do PDV, 61 testes) |
| 4 | Suíte verde, build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor, registrado: no foco, os campos de observação
  e de motivo deixam de ter a borda imposta pelo inline e seguem a regra global de foco
  (`src/styles/inputs.css`), como o resto do sistema. A foto do campo de observação não acusou
  diferença, então o efeito real no foco não está confirmado por imagem.
- Menor, anotado na rodada anterior e ainda de pé: o nome do item cancelado aparece cortado
  porque a caixa do motivo aperta a coluna. Não mexi, para não mudar a tela nesta fase.
