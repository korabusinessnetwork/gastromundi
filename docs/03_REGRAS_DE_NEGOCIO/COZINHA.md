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
- [x] `pedido.criado` exibe comanda no KDS em tempo real
- [x] Avanço de preparo atualiza o Pedido e emite eventos
- [x] Tempo decorrido visível e atraso destacado
- [x] Tema escuro legível em ambiente de cozinha (ver Design System)

## Estado da Implementação

| Fase | Descrição | Status |
|------|-----------|--------|
| 1 | KDS (`src/components/desktop/views/CozinhaView.jsx`) com 3 colunas por status (`aguardando`/`em_preparo`/`pronto`) — cada card mostra comanda/mesa, itens, observações e tempo decorrido, com destaque visual para atrasados (SLA fixo de 15min nesta fase, `SLA_MINUTOS_PADRAO` em `src/lib/cozinha.js`). Ações `iniciarPreparo`/`marcarPronto` (`src/lib/cozinha.js`) fazem a transição com guard otimista (evita duas estações avançarem a mesma comanda) e emitem `pedido.em_preparo`/`pedido.pronto` + log de auditoria. Realtime via `usePedidosCozinha` (`src/utils/hooks.js`, mesmo padrão de `useMesas`). **Nota de modelagem:** o "pedido" aqui é a própria comanda em `public.pending` (colunas `status_cozinha`/`em_preparo_em`/`pronto_em`, migração `20260711_cozinha_kds.sql`) — não existe tabela `pedidos`/`pedido_itens` separada como `docs/09_BACKLOG/mvp_operacional.md` descreve (modelo-alvo, não o estado atual; ver ADR-004). | ✅ 2026-07-06 |
| 2 | Múltiplas estações de produção, roteamento de itens por estação, SLA configurável por produto/estabelecimento | Pendente |
| 3 | Métricas de tempo médio por item, fallback de impressão, itens não produzíveis configuráveis para não entrar no KDS | Roadmap |
