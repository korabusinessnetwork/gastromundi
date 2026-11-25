# Refatoração 5.8: Estoque e janela de desconto e acréscimo sem estilo inline

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `EstoqueView.jsx`: 36 atributos `style` para 0 (sobra a atribuição de variáveis de
  espaçamento na raiz). A cor de cada saldo vinha de `estoqueColor()`; agora a linha e o
  indicador recebem `estoque-tom--<situação>`, com a situação de `situacaoDoSaldo`, a mesma
  regra que o PDV usa, e tudo dentro dela lê `--estoque-tom`. `estoqueColor` saiu de
  `estoque/apoio.js`, que não tinha outro usuário. Hover da linha, do cabeçalho ordenável,
  do cadeado e do botão de liberar em CSS.
- `checkout/PopupAjuste.jsx`: 35 para 0 (sobram as variáveis de espaçamento). As classes
  `checkout-view__modal-*` também servem à janela de remover item, então o que é só desta
  janela tem prefixo `ajuste`. O vermelho do desconto e o verde do acréscimo viraram o tom
  `--ajuste-tom`. A senha com erro ganhou `aria-invalid`. `:disabled` em Remover e Aplicar,
  onde a condição de aparência era a mesma do `disabled`.
- Dois testes do Estoque liam a cor no `style` do elemento. Passaram a conferir o tom da
  linha (`estoque-tom--nao_controlado`, `estoque-tom--sem_estoque`), que é onde a decisão
  mora agora.

Antes da conversão o roteiro ganhou dados (água zerada, coxinha abaixo do mínimo, brigadeiro
sem controle de estoque, suco com compra em caixa de 12) e a RPC `verificar_senha_admin`
aceitando "1234", e seis telas: desconto com senha, acréscimo em valor fixo, desconto acima
de 100%, Estoque com hover, Estoque liberado ordenado pelo saldo e a entrada em caixa com a
conversão.

## Duas diferenças, e por quê

Nas telas de acréscimo e de desconto acima de 100% o campo de valor está com foco. A borda
dele era pintada por `onFocus` com o destaque a 60%; agora quem pinta é a regra global de
foco, com o destaque cheio, como nos outros campos convertidos. Só essa borda mudou.

## Achado registrado

TD026: as janelas do pagamento abertas por portal aparecem em fonte serifada (o overlay não
declara `font-family`), e o título "Desconto / Acréscimo" é `#fff` cravado. A rodada manteve
as duas coisas como estavam.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os dois arquivos sem estilo inline fora de variável CSS | guard: os dois saem da linha de base |
| 2 | Telas idênticas, fora o foco dos campos de valor | `comparar` contra `--ref HEAD`: 81 telas, 2 diferenças, só a borda focada |
| 3 | Testes passam, com os dois do Estoque reescritos para o tom | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: o erro de senha errada no desconto não é
  fotografado (a regra é `aria-invalid` com borda vermelha). Menor: a regra de cor por
  situação não tem teste (o jsdom não lê CSS); a classificação tem.
