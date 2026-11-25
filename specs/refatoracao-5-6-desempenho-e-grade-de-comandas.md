# Refatoração 5.6: Desempenho e grade de comandas sem estilo inline

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `relatorio/DesempenhoReport.jsx`: 47 atributos `style` para 0. Sobram três atribuições
  de variável, permitidas: a cor de cada indicador (`--kpi-cor`), a altura da barra do
  gráfico por dia e a largura e cor da barra por forma de pagamento. Regras acrescentadas a
  `DesempenhoReport.css`. Período e comparação escolhidos por modificador `--ativo`; data
  preenchida por `--preenchida`; variação positiva ou negativa por `--sobe` e `--desce`;
  seta do botão de comparação por `--aberta`.
- `PDVView/ComandaGrid.jsx`: 46 para 0. O cabeçalho do CSS dizia que mover as cores
  condicionais para classe "exigiria uma explosão de seletores". Não exigiu: o destaque da
  comanda é um estado só (selecionada, lançada, com itens ou vazia, nesta ordem de
  prioridade), calculado por `estadoDaComanda`; o hover do cartão continua vindo do mesmo
  `useState` (ele também troca o texto "Disponível" por "Clique para abrir") e virou o
  modificador `--hover`; o tempo decorrido devolve um tom (`agora`, `normal`, `alerta`,
  `atraso`) em vez de uma cor. Hover da lista e do "Abrir comanda" em CSS. Espaçamento de `sz`
  chega por variável no contêiner.

Antes da conversão o roteiro ganhou:
- no Supabase falso, quatro comandas (esquecida há 10h, em uso por outra pessoa há 45 min,
  com apelido há 10 min, aberta agora) e a resposta da RPC `relatorio_vendas`, com um período
  anterior que dá variação positiva no faturamento e negativa nas vendas;
- nove telas: hover num número livre e numa comanda, aba "Comandas abertas", busca de um
  número livre, busca sem resultado, comanda lançada (âmbar), Desempenho com dados, com a
  comparação por período aberta e com o período personalizado pela metade.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os dois arquivos sem estilo inline fora de variável CSS | guard: os dois saem da linha de base |
| 2 | Grade, lista, Desempenho e seus estados idênticos | `comparar`: 71 telas, 0 diferença |
| 3 | Testes existentes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: a comanda selecionada não aparece na grade
  do computador (abrir a comanda troca a grade pelo cardápio), então o estado `--selecionada`
  não tem foto; as regras copiam os valores de antes. Menor: o erro de carregamento do
  Desempenho e a margem negativa também não são fotografados.
