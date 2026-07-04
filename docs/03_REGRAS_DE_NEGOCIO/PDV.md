# Regras de Negócio — PDV (Ponto de Venda)

## Objetivo
Registrar vendas de forma rápida e confiável no balcão, na mesa ou no delivery. O PDV é a **transação-fonte** da GastroMundi: toda venda finalizada se propaga automaticamente para Pedidos, Caixa, Estoque, Financeiro, Relatórios e Jarvas (decisão 009).

## Contexto
É o módulo mais sensível à operação — não pode travar a fila (princípio "o balcão não pode parar"). Uma venda registrada uma vez alimenta todos os demais módulos via Event Bus (decisão 004); ninguém redigita a mesma informação.

## Regras Gerais
- **Modos de venda:** balcão, mesa/comanda, retirada e delivery.
- Uma venda contém: itens (produto, quantidade, preço unitário), descontos/acréscimos, forma(s) de pagamento e, opcionalmente, um cliente vinculado.
- **Formas de pagamento:** dinheiro, cartão (débito/crédito), Pix e fiado (a receber). Permite **pagamento dividido** (múltiplas formas numa mesma venda).
- **Fiado não gera `pagamento.aprovado`** (não há recebimento imediato): a `venda.finalizada` com forma fiado faz o Financeiro criar uma **conta a receber** (ver `FINANCEIRO.md`).
- Para finalizar venda com movimentação de **dinheiro**, o **caixa deve estar aberto** (ver `CAIXA.md`).
- Desconto e acréscimo respeitam limites por papel (ver Permissões).
- Toda venda finalizada gera um **pedido** (ver `PEDIDOS.md`) e, quando há item produzido, alimenta a **Cozinha** (ver `COZINHA.md`).
- A baixa de estoque ocorre na **finalização** da venda (ver `ESTOQUE.md`).

## Validações
- Caixa aberto para pagamentos em dinheiro; senão, bloquear e orientar abertura.
- Quantidade > 0 e preço unitário ≥ 0; total da venda = soma dos itens − descontos + acréscimos.
- Soma dos pagamentos = total da venda (incluindo troco em dinheiro).
- Desconto dentro do limite do papel; acima disso, exigir autorização de gerente.
- Estoque: por padrão, alertar item sem saldo; **vender mesmo assim** é configurável por estabelecimento (não bloqueia a operação por padrão).

## Permissões
| Ação | dono | gerente | caixa | atendente | cozinha |
|------|------|---------|-------|-----------|---------|
| Registrar venda | ✓ | ✓ | ✓ | ✓ | — |
| Desconto até o limite padrão | ✓ | ✓ | ✓ | ✓ | — |
| Desconto acima do limite | ✓ | ✓ | (autorização) | (autorização) | — |
| Cancelar venda | ✓ | ✓ | (autorização) | — | — |

## Exceções
- **Modo offline/resiliência** (roadmap): venda registrada localmente e sincronizada depois — não pode parar o balcão.
- Venda sem estoque permitida quando o estabelecimento habilita "venda a descoberto".
- Estorno/cancelamento após pagamento gera lançamento de reversão no Financeiro e Caixa.

## Auditoria
- Registrar: operador, data/hora, itens, descontos/acréscimos (com autorizador, quando houver), formas de pagamento, cliente e cancelamentos/estornos.

## Eventos Disparados
- `venda.iniciada` — venda aberta (ex.: comanda de mesa)
- `venda.item.adicionado` / `venda.item.removido`
- `pagamento.aprovado` / `pagamento.recusado`
- **`venda.finalizada`** — evento-fonte consumido por Pedidos, Estoque, Financeiro, Relatórios e Jarvas (o **Caixa** reage a `pagamento.aprovado`, não a este evento)
- `venda.cancelada` / `venda.estornada`

## Configurações Futuras
- Emissão fiscal (NFC-e/SAT), modo offline com sincronização, divisão de conta avançada, gorjeta/serviço, integração com adquirentes e delivery.

## Casos de Uso
- Venda rápida de balcão com pagamento em dinheiro e troco.
- Comanda de mesa aberta, itens adicionados ao longo do tempo, fechada no fim.
- Pedido de delivery vinculado a um cliente e endereço.

## Critérios de Aceite
- [ ] Venda finalizada emite `venda.finalizada` e gera pedido correspondente
- [ ] Pagamento em dinheiro exige caixa aberto e registra movimento no Caixa
- [ ] Total, descontos, acréscimos e troco calculados corretamente
- [ ] Limites de desconto por papel respeitados
- [ ] Baixa de estoque ocorre na finalização (conforme `ESTOQUE.md`)
