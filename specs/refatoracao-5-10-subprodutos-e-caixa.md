# Refatoração 5.10: Subprodutos e janela de dinheiro do caixa sem estilo inline

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `SubprodutosView.jsx`: 31 atributos `style` para 0 (sobra a atribuição de variáveis de
  espaçamento na raiz). O interruptor ligado ou desligado, a categoria ativa, o subproduto
  inativo, o estoque baixo e o selo de situação viraram modificadores. A confirmação de
  exclusão tem dois tons (azul quando está bloqueada porque o subproduto está num combo,
  vermelho quando é para valer), que viraram `--sub-tom`. Hover da linha em CSS; `:disabled`
  em Salvar e Excluir, onde a condição era a mesma.
- `modals/MovimentoCaixaModal.jsx`: 28 para 0. O tom da janela (vermelho para retirar, verde
  para colocar) virou `--mov-tom`, definido pelo tipo escolhido; cada botão de tipo carrega o
  seu. A senha do gerente com erro ganhou `aria-invalid`. O botão de registrar usa
  `:disabled`, a mesma condição de antes.

Antes da conversão o Supabase falso ganhou três subprodutos (um com estoque baixo, um
inativo, um usado num combo) e o roteiro ganhou nove telas: a lista, o cadastro, a edição
com estoque, a exclusão bloqueada, a exclusão para valer, e a janela de dinheiro vazia, com
retirada preenchida, com valor acima do caixa e com entrada.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os dois arquivos sem estilo inline fora de variável CSS | guard: os dois saem da linha de base |
| 2 | Subprodutos e janela de dinheiro idênticos em todos os estados fotografados | `comparar` contra `--ref HEAD`: 96 telas, 0 diferença |
| 3 | Testes existentes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: a autorização de gerente na retirada acima
  do limite não é fotografada, porque o dono autoriza sozinho e o roteiro não tem perfil de
  caixa; as regras copiam os valores de antes.
