# Fase F, passada 2 e encerramento do plano de refatoração

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T24.

## F.3, fluxos críticos rodando de verdade

Novo `scripts/fluxos-criticos.mjs` (`npm run fluxos`). Cada fluxo abre o app no Chromium, contra o
mesmo Supabase falso do roteiro de fotos, e faz o caminho de quem usa o sistema. O falso não guarda
nada, então a prova é dupla: a tela chega ao fim do caminho e as gravações certas saem para o banco,
com os dados certos (cada fluxo confere o corpo da gravação). Banco de verdade não entra de
propósito: produção não é lugar de teste.

| Fluxo do plano | Fluxos rodados | Largura | O que foi conferido |
|---|---|---|---|
| 1. Login, abrir caixa, vender em dinheiro, fechar caixa | `caixa-abrir`, `caixa-vender-dinheiro`, `caixa-fechar`, `pdv-celular-vender` | computador e celular | fundo de R$ 150 e caixa aberto; venda de R$ 32 da comanda 15 gravada uma vez, com pagamento em dinheiro e receita no financeiro; fechamento com o total conferido e caixa fechado; venda de balcão no PDV do celular com "Pagamento registrado" na tela. O login entra pela sessão do roteiro, como nas fotos |
| 2. Comanda pelo `/palm` e cobrar no PDV | `palm-lancar-na-comanda` e `caixa-vender-dinheiro` | celular e computador | o item vai para a lista de itens da comanda 15; a comanda é cobrada no PDV |
| 3. Venda com NFC-e em homologação | não roda | | depende do certificado A1 e do CSC, adiados por custo (pendência P2-06) |
| 4. Pedido pelo cardápio público e aceite no delivery | `cardapio-publico-pedir`, `delivery-aceitar` | celular e computador | o pedido sai com o endereço e o Pix na entrega, total de R$ 32,50 com a taxa; o aceite grava o status "em preparo" |
| 5. Sem internet, vender, voltar a rede | `offline-vender-e-subir` | computador | a venda sobe uma vez só depois que a rede volta; a baixa de estoque reenviada leva o mesmo identificador de operação, e por isso não duplica |
| 6. Importar nota, salvar combo, excluir unidade | `nota-importar`, `combo-salvar`, `unidade-excluir` | computador | cada um chama a sua função atômica (`importar_nota_fiscal`, `salvar_combo`, `excluir_unidade_medida`) |
| 7. Console, criar estabelecimento e trocar plano | `console-criar-estabelecimento`, `console-trocar-plano` | computador | o cadastro vai para a função de borda com o nome, o endereço e o plano; a troca de plano manda o estabelecimento e o plano novo |

Resultado: **13 fluxos, 0 com falha.** O script mascara campos de senha na saída.

**Comparação com a linha de base da tarefa 0.1:** cada rodada do plano comparou o roteiro de fotos
com a rodada anterior e explicou toda diferença na própria spec; a cadeia de comparações cobre, por
transitividade, toda diferença desde a linha de base. Não foi refeita uma comparação direta contra o
commit de partida, porque o roteiro atual (209 telas) fotografa telas que o código de partida não tem.

## Passada 2, F.1 a F.4 sem achado

- **F.1:** todas as metas da seção 4 do plano em "sim" (a coluna "final" foi preenchida). Maior
  pacote 2.352 kB, abaixo da linha de base de 2.387 kB.
- **F.2:** os critérios que falharam na passada 1 estão corrigidos e conferidos.
- **F.3:** os 13 fluxos acima.
- **F.4:** o código novo desde a passada 1 (`lib/dados/tempoReal.js`, a regra de lint, o script de
  fluxos) não abre superfície nova; nenhuma migration nova.

A fase F sai do laço.

## Encerramento (F.6)

- `docs/09_BACKLOG/tech-debt.md`: caminhos atualizados nos itens abertos, os resíduos do TD018
  resolvidos com o commit, e a seção da refatoração com o antes e depois de cada débito estrutural.
- `docs/09_BACKLOG/plano_refatoracao.md`: coluna "final" da tabela de metas.
- `.full-auto/RELATORIO-FINAL.md`: relatório para o dono.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os fluxos críticos rodam no navegador, nas duas larguras | `npm run fluxos` |
| 2 | Metas da seção 4 todas em "sim" | métricas e tabela |
| 3 | F.1 a F.4 sem achado na mesma passada | esta spec |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim, com o fluxo 3 registrado como impedido por custo, não como aprovado.
  Suíte 273 arquivos e 4465 testes, verde; build limpo; lint 0 erros e 25 avisos.
- Qualidade: nenhum crítico ou importante.
