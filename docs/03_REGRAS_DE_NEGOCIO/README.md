# 03 — Regras de Negócio

Documentação das regras de negócio por módulo. Cada módulo terá seu próprio arquivo, seguindo um **template padrão** (Objetivo, Contexto, Regras Gerais, Validações, Permissões, Exceções, Auditoria, Eventos Disparados, Configurações Futuras, Casos de Uso, Critérios de Aceite).

Princípio central: **a venda no PDV é a transação-fonte** — ela se propaga (via Event Bus) para Caixa, Estoque, Financeiro, Relatórios e Jarvas. A consistência entre módulos é parte da regra de cada um.

## Módulos

| Módulo | Arquivo | Descrição | Status |
|--------|---------|-----------|--------|
| PDV | [`PDV.md`](./PDV.md) | Ponto de venda (balcão, mesa, delivery) — transação-fonte | Documentado |
| Caixa | [`CAIXA.md`](./CAIXA.md) | Abertura/fechamento, sangrias, conferência | Documentado |
| Pedidos | [`PEDIDOS.md`](./PEDIDOS.md) | Ciclo de vida do pedido | Documentado |
| Cozinha | [`COZINHA.md`](./COZINHA.md) | Painel de produção (KDS) | Documentado |
| Estoque | [`ESTOQUE.md`](./ESTOQUE.md) | Insumos, baixa automática, alertas | Documentado |
| Financeiro | [`FINANCEIRO.md`](./FINANCEIRO.md) | Contas a pagar/receber, fluxo de caixa | Documentado |
| Clientes | [`CLIENTES.md`](./CLIENTES.md) | Cadastro, histórico, fidelidade | Documentado |
| Relatórios | [`RELATORIOS.md`](./RELATORIOS.md) | Vendas, margem, desempenho | Documentado |
| Jarvas | [`JARVAS.md`](./JARVAS.md) | Camada transversal de IA | Documentado |

## Taxonomia de eventos (Event Bus) — matriz única

Esta é a **matriz única** de eventos — a fonte de verdade dos contratos; os 9 módulos seguem esta tabela (cada evento tem **um único dono/emissor**). A consistência entre módulos é garantida pelo Event Bus (decisão 004). Evento-fonte: **`venda.finalizada`**.

| Evento | Emitido por (owner) | Consumido por |
|--------|---------------------|---------------|
| `venda.finalizada` | PDV | Pedidos, Estoque, Financeiro, Relatórios, Jarvas |
| `venda.finalizada` (forma **fiado**) | PDV | Financeiro (cria conta a receber) |
| `pagamento.aprovado` (dinheiro/cartão/Pix) | PDV | Caixa (se dinheiro), Financeiro, Jarvas |
| `venda.estornada` | PDV | Caixa, Estoque, Financeiro |
| `pedido.criado` | Pedidos | Cozinha, Relatórios |
| `pedido.entregue` / `pedido.cancelado` / `pedido.atrasado` | Pedidos | Relatórios, Jarvas |
| `pedido.em_preparo` / `pedido.pronto` | **Cozinha** | Pedidos, Relatórios, Jarvas |
| `caixa.aberto` / `caixa.fechado` / `caixa.divergencia` | Caixa | Relatórios, Jarvas |
| `estoque.baixa` / `estoque.entrada` / `estoque.ajuste` | Estoque | Relatórios, Jarvas |
| `estoque.baixo` / `estoque.ruptura` | Estoque | Jarvas |
| `financeiro.lancamento.criado` / `financeiro.conta.baixada` / `financeiro.conta.vencida` | Financeiro | Relatórios, Jarvas |
| `cliente.*` | Clientes | Jarvas |
| `jarvas.insight.gerado` / `jarvas.alerta.gerado` / `jarvas.sugestao.gerada` | Jarvas | (UI / notificações) |
