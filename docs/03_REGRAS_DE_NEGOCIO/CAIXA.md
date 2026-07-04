# Regras de Negócio — Caixa

## Objetivo
Controlar o dinheiro da operação: abertura com fundo de troco, movimentações ao longo do turno, sangrias e suprimentos, e fechamento com conferência — garantindo que "dinheiro não admite erro nem ambiguidade".

## Contexto
O Caixa é alimentado automaticamente pelas vendas (decisão 009): cada pagamento em dinheiro entra na sessão de caixa aberta. O fechamento confronta o valor **esperado** (calculado) com o **contado** (informado pelo operador), expondo divergências.

## Regras Gerais
- Trabalha por **sessão de caixa**: abre com **fundo de troco**, recebe movimentos e fecha com conferência.
- **Movimentos:** entradas (vendas em dinheiro), **sangria** (retirada), **suprimento** (reforço de troco), estornos.
- Pagamentos não-dinheiro (cartão/Pix) são registrados para conciliação, mas não alteram o numerário físico do caixa.
- **Valor esperado** = fundo + entradas em dinheiro + suprimentos − sangrias − estornos.
- **Divergência** = contado − esperado (sobra/falta), registrada no fechamento.
- Só pode haver **uma sessão aberta por caixa/operador** por vez.

## Validações
- Abertura exige fundo de troco ≥ 0 e nenhuma sessão aberta para o mesmo caixa.
- Sangria não pode exceder o numerário disponível.
- Fechamento exige contagem informada; divergência acima do limite tolerado exige justificativa.

## Permissões
| Ação | dono | gerente | caixa | atendente | cozinha |
|------|------|---------|-------|-----------|---------|
| Abrir/fechar a própria sessão | ✓ | ✓ | ✓ | — | — |
| Sangria/suprimento até o limite | ✓ | ✓ | ✓ | — | — |
| Sangria acima do limite | ✓ | ✓ | (autorização) | — | — |
| Ver/fechar sessões de terceiros | ✓ | ✓ | — | — | — |

## Exceções
- Fechamento com divergência é permitido **com justificativa** e gera alerta ao gerente e ao Jarvas.
- Reabertura de sessão fechada exige papel gerente e fica registrada.

## Auditoria
- Registrar: operador, abertura/fechamento (valores e horários), cada sangria/suprimento (autor e motivo), divergência e justificativa.

## Eventos Disparados
- `caixa.aberto` / `caixa.fechado`
- `caixa.sangria` / `caixa.suprimento`
- `caixa.divergencia` — disparado quando há sobra/falta no fechamento

## Consome
- `pagamento.aprovado` (dinheiro) → registra entrada · `venda.estornada` → registra reversão.

## Configurações Futuras
- Conferência cega (operador não vê o esperado), múltiplos caixas simultâneos, conciliação automática de cartão/Pix com adquirente.

## Casos de Uso
- Abrir caixa no início do turno com fundo de troco.
- Fazer sangria quando o dinheiro acumula.
- Fechar o caixa conferindo o valor e registrando diferença.

## Critérios de Aceite
- [ ] Sessão abre com fundo e bloqueia segunda sessão simultânea
- [ ] Vendas em dinheiro entram automaticamente na sessão
- [ ] Sangria/suprimento ajustam o valor esperado
- [ ] Fechamento calcula divergência e exige justificativa acima do limite
- [ ] Cor de status segue `02_DESIGN_SYSTEM/CORES.md` (aberto=info, conferido=success, divergência=danger)
