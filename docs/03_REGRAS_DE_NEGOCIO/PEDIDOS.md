# Regras de Negócio — Pedidos

## Objetivo
Gerenciar o ciclo de vida do pedido — da criação (a partir da venda) até a entrega — servindo de elo entre o PDV e a Cozinha e dando visibilidade do andamento.

## Contexto
Todo pedido nasce de uma venda (decisão 009): ao finalizar no PDV, a GastroMundi cria o pedido correspondente. O pedido é a unidade que a Cozinha produz e que o cliente recebe.

## Regras Gerais
- **Ciclo de vida:** `criado` → `em preparo` → `pronto` → `entregue`. Estado terminal alternativo: `cancelado`.
- Transições são **unidirecionais** no fluxo feliz; retrocessos (ex.: `pronto`→`em preparo`) exigem papel gerente e ficam registrados.
- Cada pedido carrega: itens, origem (balcão/mesa/delivery/retirada), horário de criação e marcos de cada transição.
- Itens produzíveis são enviados à **Cozinha** (ver `COZINHA.md`); itens prontos para entrega (ex.: bebida) podem pular o preparo conforme configuração.
- **Tempo de preparo** é medido entre `em preparo` e `pronto`; usado para SLA e alertas de atraso.

## Validações
- Pedido só é criado a partir de uma `venda.finalizada` (ou venda de mesa em aberto, conforme modo).
- Transição respeita a ordem do ciclo; pular etapas exige autorização.
- Cancelar pedido já entregue não é permitido (usar estorno no PDV).

## Permissões
| Ação | dono | gerente | caixa | atendente | cozinha |
|------|------|---------|-------|-----------|---------|
| Ver pedidos | ✓ | ✓ | ✓ | ✓ | ✓ |
| Avançar status de produção | ✓ | ✓ | — | — | ✓ |
| Marcar entregue | ✓ | ✓ | ✓ | ✓ | — |
| Cancelar pedido | ✓ | ✓ | (autorização) | — | — |
| Retroceder status | ✓ | ✓ | — | — | — |

## Exceções
- Pedido cancelado após início de produção gera alerta (desperdício) ao gerente e ao Jarvas.
- Pedidos de delivery podem ter status adicional de logística (roadmap).

## Auditoria
- Registrar: origem, autor de cada transição, horários dos marcos, cancelamentos e retrocessos com justificativa.

## Eventos Disparados
- `pedido.criado` — consumido pela Cozinha e Relatórios
- `pedido.entregue`
- `pedido.cancelado` · `pedido.atrasado` (SLA estourado)

> `pedido.em_preparo` e `pedido.pronto` são emitidos pela **Cozinha** (ver `COZINHA.md`) e atualizam o estado do pedido — Pedidos os **consome**, não os emite.

## Consome
- `venda.finalizada` → cria o pedido.
- `pedido.em_preparo` · `pedido.pronto` (emitidos pela Cozinha) → atualizam o estado.

## Configurações Futuras
- Status de logística para delivery, agrupamento de pedidos por mesa, prioridade manual, integração com plataformas de delivery.

## Casos de Uso
- Venda de balcão vira pedido e segue para a cozinha.
- Acompanhar pedidos em aberto e marcar como entregues.
- Cancelar um pedido criado por engano antes do preparo.

## Critérios de Aceite
- [ ] `venda.finalizada` cria pedido com itens e origem corretos
- [ ] Transições respeitam o ciclo e emitem os eventos correspondentes
- [ ] Tempo de preparo medido e atraso sinalizado
- [ ] Cores de status seguem `02_DESIGN_SYSTEM/CORES.md`
