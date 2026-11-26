# Refatoração 5.26: Cozinha sem estilo inline

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T05.

## A mudança

- `CozinhaView.jsx` (13) para 0.
- A cor de cada coluna saiu de `COLUNAS` para `cozinha-view__coluna--<status>`, que define
  `--coluna-cor` (azul, âmbar de atenção e verde, todos `--gm-*`). O cartão atrasado virou
  `pedido-card--atrasado`, que pinta a borda, a sombra e o tempo de vermelho. Os botões
  "Iniciar Preparo" e "Marcar Pronto" usam `:disabled` enquanto gravam.
- O espaço do `sz` chega por `--cozinha-pad` e `--cozinha-gap` na raiz.
- Sem emoji (decisão 037): a cadeira "🪑" da mesa no cartão virou `LuArmchair`.

Antes da conversão o roteiro ganhou a tela da Cozinha com um pedido em cada etapa
(aguardando, em preparo atrasado, em preparo no prazo, pronto). A consulta própria da Cozinha
recebe esses pedidos fictícios só nessa tela; até aqui só a coluna "Aguardando" tinha foto.

## Diferenças

Contra o código de antes da conversão, 198 telas: 0 com diferença e 3 leves. As duas da
Cozinha são a cadeira emoji virando ícone (vista ampliada); a terceira é o ruído de fonte de
sempre na aba Reservas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | `CozinhaView` sem estilo inline e sem emoji | os dois guards |
| 2 | A única mudança de tela é o emoji trocado por ícone | `comparar`, vista |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. O TD024 (falha ao mudar o status do pedido só vai
  para o console) continua aberto; não é desta rodada.
