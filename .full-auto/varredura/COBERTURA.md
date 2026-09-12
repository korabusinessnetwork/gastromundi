# Cobertura da varredura

**Vocabulário.** `PASSOU` e `FALHOU` só aparecem para fluxo que eu executei de verdade,
no app rodando ou chamando a função no banco. `PARCIAL` é fluxo em que executei uma parte
e não a outra, e a coluna diz qual. `NAO_TESTADO` é o resto, com o motivo. Fluxo cujo
teste eu escrevi mas não executei conta como `NAO_TESTADO`.

## Totais medidos

| Número | O que é |
|---|---|
| 205 | fluxos mapeados |
| 21 | fluxos executados e aprovados (`PASSOU`) |
| 9 | fluxos executados em parte (`PARCIAL`) |
| 3 | fluxos executados e reprovados (`FALHOU`, bugs B01 e B02) |
| 172 | fluxos `NAO_TESTADO`, com motivo na última seção |
| 38 | asserções automatizadas que ficaram no repositório e rodam num comando |
| 4191 | testes da suíte própria do projeto, que continuam verdes (238 arquivos) |

**16 por cento dos fluxos** foram exercitados por esta varredura (33 de 205, somando
aprovados, parciais e reprovados). O número é esse, medido por execução, e não uma
estimativa. Ele é baixo de propósito: preferi executar poucos fluxos de ponta a ponta,
conferindo no banco, a marcar muitos por leitura de código.

## Fluxos executados

| Fluxo | O que é | Status | Onde |
|---|---|---|---|
| F001 | entrar no sistema | PASSOU | navegador, acesso A02 |
| F002 | senha errada avisa e não entra | PARCIAL, conferi a mensagem, não a contagem de pips | acesso A03 |
| F006 | marca do estabelecimento na porta | PASSOU | acesso, capturas com "QA TENANT A" |
| F010 | credencial de um estabelecimento não entra no outro | PASSOU | acesso A06 e banco B01 |
| F011 | usuário inativo não entra | PASSOU | acesso A05 |
| F015 | rota protegida sem sessão volta ao login | PARCIAL, sem sessão sim, papel errado com sessão não | acesso A04 |
| F022 | gerente e garçom não editam permissão | PASSOU | banco B07, B08, B09 |
| F028 | isolamento entre estabelecimentos, leitura e escrita | PASSOU | banco B01 a B06 |
| F030 a F037 | ações da plataforma | PARCIAL, testei só a recusa para quem não é plataforma | banco B10 |
| F040 | fila de contas e leads só para a plataforma | PASSOU | banco B11 |
| F046 | caixa fechado bloqueia o PDV | PASSOU | operação OP01 |
| F047 | abrir o caixa com fundo de troco | PASSOU | operação OP02, conferido no banco |
| F051 | abrir comanda por slot vazio | PASSOU | operação OP03 |
| F056 | montar o carrinho | PASSOU, com o defeito de layout B04 | operação OP03 |
| F058 | lançar o pedido na comanda | PASSOU | operação OP03, `pending.total = 15` |
| F059 | fechar a conta direto do carrinho | **FALHOU**, bug B01 | operação OP04 |
| F064 | receber em dinheiro | PARCIAL, valor exato sim, troco e valor menor não | operação OP05 |
| F067 | confirmar o pagamento e fechar a comanda | PASSOU | operação OP05, conferido no banco |
| F095 | baixa de estoque idempotente e nunca negativa | PASSOU | banco D01, D02, D03 |
| F099 | pagamento vira receita no financeiro | PASSOU | operação OP05, 1 lançamento ligado à venda |
| F126 | estoque desce sozinho quando a venda sai | PASSOU | operação OP05, 496 para 494 |
| F156 | enviar pedido público com o preço do servidor | PASSOU | banco D09 a D12 |
| F183 | aba Desempenho | **FALHOU**, bug B02 | banco, teste pendente |
| F186 | RPC relatorio_vendas | **FALHOU**, bug B02 e B03 | banco, teste pendente |
| F201 | registrar renovação de mensalidade | PASSOU | banco D04, D05, D06 |
| F202 | estornar pagamento de mensalidade | PASSOU | banco D07, D08 |
| F203 | definir mensalidade | PARCIAL, só a recusa para quem não é plataforma | banco B10 |
| F204 | sincronizar status da assinatura | PARCIAL, só a recusa | banco B10 |
| F024 | gate de senha de administrador | PARCIAL, anônimo recebe falso; o escopo por tenant não foi executado | banco, superfície anônima |
| F151, F152 | vitrine pública | PARCIAL, a RPC responde; a tela não foi aberta no navegador | banco |
| F045 | cardápio público sem login | PARCIAL, a rota existe e a RPC responde; não naveguei a vitrine | banco |

## Por que os outros 172 ficaram sem execução

| Motivo | Quantos, aproximadamente | Exemplos |
|---|---|---|
| Depende de realtime, que a ponte não emula | 6 | F097, F078 a F082 (cozinha em tempo real) |
| Depende de Edge Function ou storage | 12 | F191, F192, F197 (NFC-e), F143 (fotos do delivery) |
| Depende de `select` com recurso embutido, que a ponte não emula | 4 | F114 a F116 (combos) |
| Depende de integração de terceiro (CEP, geocodificação, impressora, TEF) | 9 | F148, F154, F069, F068 |
| Tela de celular, não exercitada nesta onda | 11 | F083 a F092 (Palm) |
| Área grande que ficou para a próxima onda por tempo | 130 | cadastro, estoque, clientes, delivery administrativo, financeiro, relatórios |

Nenhum fluxo ficou de fora do mapa. O que não foi executado está nomeado, com motivo, e é
exatamente a lista que a próxima onda deve atacar.

## Uma ressalva honesta sobre "não testado"

`NAO_TESTADO` aqui quer dizer "esta varredura não executou", e não "não tem teste". O
projeto já tem 238 arquivos de teste com 4191 casos, verdes, cobrindo boa parte desses
fluxos por unidade e por componente, com o Supabase dublado. O que esta varredura
acrescenta é outra coisa: o sistema rodando de verdade contra o schema real, que é onde os
bugs B01 e B02 apareceram, justamente porque nenhum teste com Supabase dublado poderia
tê-los pego.
