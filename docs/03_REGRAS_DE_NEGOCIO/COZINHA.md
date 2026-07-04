# Regras de Negócio — Cozinha (KDS)

## Objetivo
Apresentar os pedidos à produção em tempo real (Kitchen Display System), na ordem certa, permitindo marcar avanço de preparo e dando visibilidade de tempos e atrasos — substituindo a comanda em papel.

## Contexto
A Cozinha consome os pedidos criados no fluxo de venda (decisão 009): assim que um pedido com itens produzíveis é criado, ele aparece no KDS. É a persona Bea (cozinha) operando sob pressão, muitas vezes em ambiente de baixa luz — por isso o **tema escuro é prioritário** (ver `02_DESIGN_SYSTEM/`).

## Regras Gerais
- O KDS organiza pedidos em **colunas por status** (`em fila / em preparo / pronto`) ou por estação de produção.
- Cada comanda (`OrderTicket`) mostra itens, observações, horário e **tempo decorrido**.
- A cozinha avança o status: iniciar preparo (`em preparo`) e concluir (`pronto`); isso atualiza o Pedido (ver `PEDIDOS.md`).
- **Priorização** por ordem de chegada (FIFO) por padrão; atraso (SLA estourado) destaca a comanda.
- Itens não produzíveis (ex.: refrigerante) podem ser configurados para não entrar no KDS.

## Validações
- Só exibe pedidos em estados de produção (`criado`/`em preparo`); pedidos `entregue`/`cancelado` saem do painel.
- Marcar `pronto` exige que o pedido esteja `em preparo` (ou config. que permita direto).

## Permissões
| Ação | dono | gerente | caixa | atendente | cozinha |
|------|------|---------|-------|-----------|---------|
| Ver KDS | ✓ | ✓ | ✓ | ✓ | ✓ |
| Iniciar/concluir preparo | ✓ | ✓ | — | — | ✓ |
| Reordenar/priorizar | ✓ | ✓ | — | — | ✓ |

## Exceções
- Comanda atrasada (acima do SLA) recebe destaque visual e alerta ao gerente/Jarvas.
- Falha de exibição (tela offline) não pode impedir a produção — fallback de impressão é roadmap.

## Auditoria
- Registrar: horários de início e conclusão de preparo por pedido/item e quem executou.

## Eventos Disparados
- `pedido.em_preparo` · `pedido.pronto` (refletem no Pedido)
- `cozinha.item.atrasado` (SLA por item/pedido)

## Consome
- `pedido.criado` → exibe nova comanda · `pedido.cancelado` → remove do painel.

## Configurações Futuras
- Múltiplas estações (chapa, montagem, bebidas), roteamento de itens por estação, métricas de tempo médio por item, fallback de impressão.

## Casos de Uso
- Nova comanda surge no painel ao ser vendida no PDV.
- Cozinheiro inicia o preparo e, ao terminar, marca como pronto.
- Comanda que passou do tempo é destacada para priorização.

## Critérios de Aceite
- [ ] `pedido.criado` exibe comanda no KDS em tempo real
- [ ] Avanço de preparo atualiza o Pedido e emite eventos
- [ ] Tempo decorrido visível e atraso destacado
- [ ] Tema escuro legível em ambiente de cozinha (ver Design System)
