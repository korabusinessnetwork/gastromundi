# Refatoração 6.2: o domínio delivery passa a morar em `src/features/delivery/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T13.

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **`dados/`**: `pedido.js` (o antigo `lib/delivery/pedido.js`), `admin.js` (o antigo
  `lib/deliveryAdmin/dados.js`), `deliveryFotos.js` e `deliveryPedidos.js`.
- **`regras/`**: `carrinho.js`, `enderecos.js`, `admin.js` (o antigo `lib/deliveryAdmin/regras.js`),
  `deliveryAlertas.js` e `deliveryHorario.js`, ao lado do `edicaoHorario.js` que já estava lá.
- **Raiz da feature**: as duas fachadas, `delivery.js` (vitrine pública) e `deliveryAdmin.js`
  (painel), que só reexportam e mantêm um ponto de entrada para quem importa.
- **`desktop/`**: a tela de Delivery do computador (`DeliveryView` e a antiga pasta
  `views/delivery/`, com as abas, os cartões e o mapa do raio de entrega).
- 35 arquivos movidos, 73 com import reescrito, testes junto de cada arquivo.

Ficam fora, de propósito, e registrado em `.full-auto/DECISOES.md`:
- a aba Delivery das Configurações (`configuracoes/DeliveryTab.jsx`): o estilo dela mora no CSS
  das Configurações, e tirá-la de lá separaria a marcação do CSS. Vai com as Configurações;
- os guardas de SQL (`deliveryComboSqlGuard` e afins): testam as migrations, não o domínio, e ficam
  com os outros guardas de SQL em `src/lib/`;
- as telas que já moram em `pages/` (cardápio público e módulo Delivery do celular): as rodadas
  de domínio esvaziam `src/lib/` e `components/desktop/views/`, que é o "pronto quando" do plano.

## Diferenças

6 telas do domínio (Delivery do computador, Configurações de Delivery, cardápio público e o
módulo Delivery do celular) contra a 6.1: nenhuma diferença. As abas internas do Delivery não têm
foto no roteiro; os testes de componente delas passam no lugar novo.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Domínio delivery em `src/features/delivery/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import aponta para o caminho antigo | busca no repositório |
| 3 | Nenhuma tela muda | `comparar` |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 269 arquivos e 4446 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: 106 para 77.
- Qualidade: nenhum crítico ou importante. Menor: `regras/deliveryAlertas.js` importa
  `formatarReais` de `dados/deliveryPedidos.js`; é só formatação, mas é uma regra dependendo da
  camada de dados. Fica anotado para a auditoria da fase F.
