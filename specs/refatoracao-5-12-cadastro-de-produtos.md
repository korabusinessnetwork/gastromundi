# Refatoração 5.12: lista e cadastro de produtos sem estilo inline

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `ProdutosView.jsx`: 21 atributos `style` para 0 (sobra o espaçamento de `sz` como
  variável). Aba ativa por modificador, hover da linha em CSS, colunas por modificador de
  alinhamento.
- `produtos/ModalCadastroProduto.jsx`: 23 para 0. Cada bloco de unidade tem seu tom quando
  escolhido (estoque em destaque, compra em azul, consumo em verde), por modificador de bloco
  mais `--ativa`; fator de conversão preenchido por `--preenchido`; o botão de salvar usa
  `:disabled`, a mesma condição de antes.
- `produtos/Input.jsx`: deixou de aceitar `style`. O único uso repetia uma margem que a
  classe `produtos-view__input` já tem.

A janela de combo ficou para a próxima rodada: ela precisa de combos no Supabase falso.

Antes da conversão as unidades de medida do Supabase falso ganharam o tipo (estoque, compra,
consumo), e o roteiro ganhou cinco telas: hover na lista, novo produto, novo insumo, erro ao
salvar com o aviso de categoria do sistema, e a edição com fornecedor, caixa de 12 e consumo
em copo.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os três arquivos sem estilo inline fora de variável CSS | guard: os três saem da linha de base |
| 2 | Lista e janela de cadastro idênticas em todos os estados fotografados | `comparar` contra `--ref HEAD`: 106 telas, 0 diferença |
| 3 | Testes existentes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: a parte de baixo da janela de cadastro só
  aparece rolando por dentro; a tela de edição rola até o fim, a de novo produto não.
