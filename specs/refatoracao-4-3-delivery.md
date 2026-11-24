# Refatoração 4.3: o Delivery do computador e do celular com as mesmas ações

> Pedido do dono (2026-11-24): *"continue"*.

## O que estava escrito duas vezes

Avançar e cancelar pedido. A aba de pedidos do computador e o módulo de delivery do
celular montavam cada um a mesma chamada: o próximo status do fluxo e os dados que vão
para a guarda de transição e para a auditoria (status de origem, operador e número).
Agora são `avancarPedido` e `cancelarPedido` em `lib/deliveryPedidos.js`, com teste. A
mensagem para o operador continua de cada tela.

## O que parece igual e não é, e por isso ficou

O agrupamento dos pedidos por status. O computador mostra também a coluna de cancelados e
não reordena; o celular tem quatro abas, põe status desconhecido em "recebido" e ordena
(o mais antigo primeiro na fila, o mais recente primeiro nos entregues). Juntar mudaria o
que uma das telas mostra. O resto do módulo do celular já usava as regras de
`lib/deliveryPedidos.js` e o mesmo gancho de lista do computador.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Só a biblioteca chama `atualizarStatusPedido` | busca |
| 2 | As ações novas nascem com teste (avançar, pedido final sem próximo, cancelar, cancelar pedido entregue barrado) | `deliveryPedidos.test.js` |
| 3 | As duas telas ganham teste de avançar e de cancelar com confirmação, provados por sabotagem | `DeliveryView.test.jsx`, `DeliveryModulo.test.jsx` |
| 4 | Testes existentes passam; telas idênticas no roteiro de fotos | suíte; `screenshots-refatoracao.mjs comparar` |
| 5 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Resultado

5 de 5 critérios em sim. Achado: nenhum teste de tela, nem do computador nem do celular,
passava por avançar ou cancelar pedido; uma sabotagem que impedia avançar passou em todos.
O teste do celular ainda substituía `atualizarStatusPedido`, que as ações novas chamam por
dentro do módulo, fora do alcance do mock; o alvo passou a ser as próprias ações.
