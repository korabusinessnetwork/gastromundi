# Refatoração 5.30: estados vazios, cardápio público e página da Kora sem emoji

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T08, segunda metade.

## A mudança

Decisão 037. O emoji de código que sobrava, fora o campo de emoji do produto:

- **Estados vazios e de carregamento** do Delivery (cardápio, complementos, pedidos), Estoque,
  Cadastro de Produtos e grade de comandas: ⏳, 🛵, 🧩, 📡, 📦, ✅ e 🔍 viraram `LuHourglass`,
  `LuBike`, `LuPuzzle`, `LuWifiOff`, `LuPackage`, `LuCircleCheck` e `LuSearchX`. O ícone entra
  no mesmo elemento e herda o tamanho que a classe já dava ao emoji.
- **Cardápio público:** a loja sem delivery (🏪 para `LuStore`), o erro (😕 para
  `LuCircleAlert`), o carregamento, o cardápio vazio (🍽️ para `LuUtensils`), a sacola vazia
  (🛒 para `LuShoppingBag`) e as formas de pagamento do checkout (💵, 📱 e 💳 para
  `LuBanknote`, `LuZap` e `LuCreditCard`, os mesmos ícones do PDV).
- **Página da Kora:** o ✅ de sucesso do agendamento, da criação de conta e da venda na
  demonstração virou `LuCircleCheck`.
- **Celular:** o 🍽️ da busca sem resultado do pedido virou `LuUtensils`.

O que sobra no `emojiGuard` (40 em 26 arquivos) é, linha por linha, o campo de emoji do
produto e seus reservas ("📦" quando o produto não tem emoji), os dados de exemplo com emoji
de produto e a prévia do cupom. Tudo isso é da T10.

## Diferenças

Contra o código da 5.29, 209 telas: 4 com diferença e 1 leve, vistas lado a lado.
- Cardápio público no computador e no celular: a loja virou ícone.
- Delivery, aba Pedidos vazia: o entregador virou ícone.
- Busca de comanda sem resultado: a lupa virou ícone.
- A leve é o ruído de fonte de sempre em Reservas.

**Lacunas de foto:** a página da Kora (outra superfície), o checkout do cardápio público (o
estabelecimento de demonstração não tem delivery), os estados de carregamento (duram um
instante) e os vazios do Estoque e do Cadastro (os dados falsos têm produtos). Conferidos
linha a linha: em todos o ícone substitui o emoji no mesmo elemento.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum emoji de código fora do campo de emoji do produto | `emojiGuard` (64 para 40) e a lista linha a linha |
| 2 | As mudanças de tela são só os emojis trocados | `comparar`: 4 diferenças, vistas |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante.
