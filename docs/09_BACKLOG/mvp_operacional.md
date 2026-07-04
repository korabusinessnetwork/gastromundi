# MVP Operacional — Comandas e Pedidos

## Objetivo

Definir o escopo mínimo do MVP operacional do GastroMundi para suportar a operação de restaurantes e varejo com foco em: comandas, pedido, PDV, caixa, cozinha e passagem de eventos entre módulos.

O MVP operacional deve permitir que a equipe registre uma venda de forma rápida, acompanhe o pedido na cozinha e conclua a operação garantindo que a venda propague os eventos necessários para caixa, estoque, financeiro, relatórios e Jarvas.

## Fluxo de Comandas

1. Atendente/caixa acessa a **Tela de Comandas**.
2. Usuário escolhe entre:
   - **Mesa** / comanda aberta
   - **Balcão** (venda imediata)
   - **Delivery** / retirada
3. Para mesa/comanda:
   - Criar ou selecionar comanda existente.
   - Abrir o cardápio ou buscar produtos.
   - Adicionar itens à comanda.
   - Visualizar total parcial e itens em aberto.
4. Para balcão:
   - Abrir rápido fluxo de venda.
   - Adicionar itens e finalizar imediatamente.
5. Para delivery:
   - Selecionar cliente ou cadastro rápido.
   - Informar endereço quando necessário.
   - Adicionar itens e finalizar pedido.
6. Finalizar comanda/pedido com forma(s) de pagamento.
7. Após finalização, retornar automaticamente para a lista de comandas para novo atendimento.

## Fluxo de Pedido

1. A **venda finalizada** no PDV dispara o evento `venda.finalizada`.
2. O módulo **Pedidos** cria um pedido correspondente.
3. O pedido recebe origem:
   - `mesa` / `comanda`
   - `balcao`
   - `delivery`
   - `retirada`
4. Se o pedido tem itens produzíveis, ele é enviado ao módulo **Cozinha** / KDS.
5. A Cozinha exibe a comanda no painel em tempo real e permite:
   - iniciar preparo (`pedido.em_preparo`)
   - marcar pronto (`pedido.pronto`)
6. Quando o pedido está pronto, a equipe marca como entregue.
7. Eventos de ciclo de vida do pedido alimentam relatórios e Jarvas:
   - `pedido.criado`
   - `pedido.em_preparo`
   - `pedido.pronto`
   - `pedido.entregue`
   - `pedido.cancelado`
   - `pedido.atrasado`

## Telas mínimas

### 1. Tela de Comandas / Atendimento

- Lista de comandas abertas e modos de venda.
- Botão para nova comanda de mesa.
- Atalho para venda de balcão rápido.
- Filtros por tipo: mesa, balcão, delivery.
- Acesso rápido a indicadores de tempo e status.

### 2. Tela de Venda / Comanda Aberta

- Seletor de comanda/mode de atendimento.
- Cardápio com busca por produto.
- Carrinho de itens com edição de quantidade e exclusão.
- Resumo de valores: subtotal, descontos, acréscimos, total.
- Seleção de forma de pagamento (dinheiro, cartão, Pix, fiado).
- Botão de finalizar venda.
- Aviso de caixa fechado quando há pagamento em dinheiro.

### 3. Tela de Pedido / Cozinha

- Painel de pedidos em aberto com colunas por status.
- Cada cartão de pedido mostra: número/comanda, itens, observações, tempo decorrido.
- Ações de avanço: iniciar preparo e marcar pronto.
- Destaque visual para atrasados/SLA estourado.

### 4. Tela de Detalhes do Pedido

- Informações de origem e cliente.
- Itens do pedido com status de preparo.
- Histórico de transições de status.
- Ação para marcar entregue ou cancelar (quando permitido).

## Entidades mínimas

### `tenants` / `estabelecimentos`

- `id`
- `nome`
- `segmento`
- `created_at`
- `updated_at`

### `usuarios` / `perfis`

- `id`
- `nome`
- `papel`
- `tenant_id`
- `created_at`
- `updated_at`

### `produtos`

- `id`
- `tenant_id`
- `nome`
- `preco_unitario`
- `categoria`
- `tipo` (produzivel, pronto)
- `estoque_disponivel`
- `created_at`
- `updated_at`

### `vendas`

- `id`
- `tenant_id`
- `comanda_id` (opcional)
- `origem` (`balcao`, `mesa`, `delivery`, `retirada`)
- `status` (`aberta`, `finalizada`, `cancelada`, `estornada`)
- `total`
- `desconto`
- `acrescimo`
- `troco`
- `cliente_id` (opcional)
- `created_at`
- `updated_at`

### `venda_itens`

- `id`
- `venda_id`
- `produto_id`
- `quantidade`
- `preco_unitario`
- `observacao`
- `created_at`
- `updated_at`

### `pagamentos`

- `id`
- `venda_id`
- `forma` (`dinheiro`, `cartao`, `pix`, `fiado`)
- `valor`
- `status` (`aprovado`, `pendente`, `recusado`)
- `created_at`
- `updated_at`

### `pedidos`

- `id`
- `tenant_id`
- `venda_id`
- `origem` (`balcao`, `mesa`, `delivery`, `retirada`)
- `status` (`criado`, `em_preparo`, `pronto`, `entregue`, `cancelado`)
- `sla_minutos`
- `created_at`
- `updated_at`

### `pedido_itens`

- `id`
- `pedido_id`
- `produto_id`
- `quantidade`
- `status` (`pendente`, `em_preparo`, `pronto`)
- `observacao`
- `created_at`
- `updated_at`

### `comandas`

- `id`
- `tenant_id`
- `numero`
- `mesa` (opcional)
- `status` (`aberta`, `fechada`, `cancelada`)
- `venda_id` (quando comanda convertida em venda)
- `created_at`
- `updated_at`

## Critérios de aceite

- [ ] Tela de comandas mostra todas as comandas abertas e permite criar/selecionar uma comanda.
- [ ] Venta de balcão funciona com adição de itens, total correto e finalização imediata.
- [ ] Finalização de venda cria `pedido` com origem correta e emite `venda.finalizada`.
- [ ] Pagamento em dinheiro exige caixa aberto antes de finalizar.
- [ ] Pedido com itens produzíveis aparece no painel de cozinha/KDS.
- [ ] Cozinha pode avançar o pedido para `em_preparo` e `pronto`.
- [ ] Pedido pronto pode ser marcado como entregue e atualiza o status.
- [ ] `venda.finalizada` propaga os dados para caixa, pedidos, estoque, financeiro, relatórios e Jarvas conforme o projeto.
- [ ] Telas mínimas são operacionais e retornam ao fluxo de comandas após finalização.
- [ ] A modelagem mínima cobre `vendas`, `venda_itens`, `pagamentos`, `pedidos`, `pedido_itens`, `comandas` e `produtos`.

## Observações

- O MVP deve priorizar a operação real antes de refinamentos visuais ou integrações externas.
- O foco é que a venda seja a transação-fonte e que o pedido seja o elo entre PDV e cozinha.
- Qualquer extensão (divisão de conta, emissão fiscal, delivery externo) fica para fases seguintes.
