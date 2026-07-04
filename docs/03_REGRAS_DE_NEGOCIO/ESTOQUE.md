# Regras de Negócio — Estoque

## Objetivo
Controlar insumos e produtos: saldo atual, baixa automática por venda, entradas (compras), ajustes e alertas de nível — evitando ruptura sem travar a operação.

## Contexto
O Estoque é alimentado automaticamente pela venda (decisão 009): ao finalizar a venda no PDV, a GastroMundi baixa os itens vendidos (e, quando há ficha técnica, os insumos correspondentes). "Dado único, verdade única": ninguém atualiza estoque em planilha à parte.

## Regras Gerais
- Cada produto/insumo tem **saldo atual**, **unidade de medida** e níveis de **estoque mínimo** e (opcional) **ponto de reposição**.
- **Baixa automática** ocorre em `venda.finalizada`. Produtos com **ficha técnica** baixam seus insumos (ex.: 1 hambúrguer = 1 pão + 1 carne).
- **Entradas** por compra/recebimento aumentam o saldo; **ajustes** (perda, quebra, inventário) corrigem o saldo com motivo.
- Níveis de status (ver `02_DESIGN_SYSTEM/CORES.md`): **ok** (≥ mínimo), **baixo** (≤ mínimo), **ruptura** (= 0).
- Estoque baixo/zerado **alerta**, mas por padrão **não bloqueia** a venda (configurável por estabelecimento) — o balcão não para.

## Validações
- Saldo nunca fica negativo sem registro explícito (venda a descoberto configurada).
- Toda saída/entrada/ajuste referencia origem (venda, compra, inventário) e autor.
- Ficha técnica com insumos válidos antes de habilitar baixa composta.

## Permissões
| Ação | dono | gerente | caixa | atendente | cozinha |
|------|------|---------|-------|-----------|---------|
| Ver estoque | ✓ | ✓ | ✓ | ✓ | ✓ |
| Registrar entrada/compra | ✓ | ✓ | — | — | — |
| Ajuste de inventário/perda | ✓ | ✓ | — | — | — |
| Definir mínimos/ficha técnica | ✓ | ✓ | — | — | — |

## Exceções
- Venda a descoberto (saldo negativo) só quando habilitada; gera alerta.
- Estorno de venda (`venda.estornada`) **devolve** os itens ao estoque.

## Auditoria
- Registrar todo movimento (entrada, saída, ajuste) com tipo, quantidade, origem, autor e data; trilha completa por item.

## Eventos Disparados
- `estoque.baixa` · `estoque.entrada` · `estoque.ajuste`
- `estoque.baixo` (atingiu o mínimo) · `estoque.ruptura` (zerou)

## Consome
- `venda.finalizada` → baixa · `venda.estornada` → devolução.

## Configurações Futuras
- Sugestão de compra pelo Jarvas, controle por lote/validade, múltiplos depósitos, transferência entre lojas, custo médio para margem.

## Casos de Uso
- Vender um combo baixa automaticamente os insumos da ficha técnica.
- Receber uma compra e dar entrada no estoque.
- Ser alertado quando um insumo atinge o mínimo.

## Critérios de Aceite
- [ ] `venda.finalizada` baixa produtos e insumos (ficha técnica)
- [ ] Estorno devolve itens ao saldo
- [ ] Alertas de baixo/ruptura disparados nos limites corretos
- [ ] Venda não é bloqueada por falta de estoque (salvo config)
