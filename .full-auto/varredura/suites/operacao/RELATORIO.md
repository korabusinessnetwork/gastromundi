# Suíte operação

Fluxos: F046, F047, F051, F056, F058, F059, F064, F067, F095, F099. Executada no
Chromium com conferência no banco a cada passo.

| Caso | Fluxo | Status | Observado |
|---|---|---|---|
| OP01 | F046 | PASSOU | com `caixa_aberto = false` o PDV mostra "Caixa Fechado" e nenhuma grade |
| OP02 | F047 | PASSOU | abrir o caixa pela tela grava `caixa_aberto = true` e `fundo_atual = 100` |
| OP03 | F051, F056, F058 | PASSOU | comanda por slot vazio, 2 unidades no carrinho, lançar grava `pending.total = 15` e o checkout abre com 2 itens e R$ 15,00 |
| OP04 | F059 | **FALHOU**, bug B01 | fechar a conta direto do carrinho abre o pagamento com 0 itens e R$ 0,00, com a comanda íntegra no banco |
| OP05 | F067, F064, F095, F099, F126 | PASSOU | venda completa: `vendas.total = 15`, 2 unidades em `venda_itens`, `dinheiro 15` em `venda_pagamentos`, comanda removida, estoque de 496 para 494 e 1 lançamento de receita ligado à venda |

Quatro de cinco. O que falhou virou o bug B01.

Achados desta suíte: **B01** (S1, intermitente, 12 de 15) e **B04** (S3, layout do card com
nome longo). A nota N01 (modal abrindo com erro antes de digitar) também saiu daqui.

Não deu para testar: troco e valor recebido menor que o devido (parte de F064), impressão
(F069), TEF offline (F068), transferência e cancelamento de comanda (F070 a F072), saldo do
dia (F073), trava de comanda entre aparelhos (F074, precisa de realtime).

Precisei de: nada em arquivo compartilhado. A ponte de QA ganhou suporte a filtro `or=`
durante a suíte, porque sem ele a trava de comanda mudava de comportamento e gerava falso
positivo. Está descrito em DECISOES.md.
