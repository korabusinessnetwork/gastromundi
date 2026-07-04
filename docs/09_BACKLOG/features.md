# Features — Backlog — GastroMundi

## Objetivo
Registrar todas as features planejadas para o GastroMundi, com descrição, prioridade, status e referência às regras de negócio correspondentes.

## Contexto
Features são novas capacidades do produto. Toda feature deve ter suas regras de negócio documentadas antes de entrar em desenvolvimento. Este arquivo é o inventário de features — não substitui ferramentas de gestão de projeto.

## Regras Gerais
- Feature sem regras de negócio documentadas não pode entrar em sprint
- Features devem ter critérios de aceite claros antes do desenvolvimento
- Features grandes devem ser quebradas em incrementos entregáveis menores
- Features canceladas devem ser marcadas como `Cancelado` com motivo

## Validações
- Critérios de aceite devem ser verificáveis e mensuráveis
- Dependências entre features devem ser documentadas

## Permissões
- Qualquer membro pode propor features
- Product owner define prioridade e aprova entrada em sprint

## Exceções
- Features de segurança crítica podem ser priorizadas sem processo padrão

## Auditoria
- Status de cada feature deve ser mantido atualizado
- Features concluídas devem ser marcadas com data de entrega

## Eventos
- `feature.proposed` — feature proposta
- `feature.approved` — feature aprovada para desenvolvimento
- `feature.shipped` — feature entregue em produção
- `feature.cancelled` — feature cancelada

## Configurações Futuras
- Vincular features a métricas de negócio (OKRs)
- Criar roadmap visual a partir deste backlog

## Casos de Uso
- Planejamento de sprint
- Comunicação de roadmap para stakeholders
- Priorização de desenvolvimento

## Critérios de Aceite
- [ ] Todas as features têm prioridade e status
- [ ] Features com status "Em desenvolvimento" têm critérios de aceite definidos
- [ ] Features concluídas têm data de entrega registrada

---

> Roadmap de produto direcional em `memory/identity.md`. As fases abaixo refletem esse roadmap.

## MVP — Núcleo operacional (Fase 1)

| # | Feature | Prioridade | Status | Regras | Notas |
|---|---------|-----------|--------|--------|-------|
| F001 | Autenticação + multi-tenant (estabelecimento, papéis) | 🔴 Critical | Planejado | [auth-flow.md](../05_FLUXOS/auth-flow.md) · decisões 002/008 | Base; isolamento por tenant (RLS) |
| F002 | Onboarding (criar estabelecimento, produtos) | 🟠 High | Planejado | [onboarding-flow.md](../05_FLUXOS/onboarding-flow.md) | — |
| F003 | Cadastro de produtos / cardápio | 🔴 Critical | Planejado | [ESTOQUE.md](../03_REGRAS_DE_NEGOCIO/ESTOQUE.md) | Pré-requisito do PDV |
| F004 | **PDV — venda (transação-fonte)** | 🔴 Critical | Planejado | [PDV.md](../03_REGRAS_DE_NEGOCIO/PDV.md) | Coração da operação |
| F005 | Caixa — abertura/fechamento/sangria | 🔴 Critical | Planejado | [CAIXA.md](../03_REGRAS_DE_NEGOCIO/CAIXA.md) | — |
| F006 | Pedidos — ciclo de vida | 🟠 High | Planejado | [PEDIDOS.md](../03_REGRAS_DE_NEGOCIO/PEDIDOS.md) | — |

## Backlog — Roadmap por fase

| # | Feature | Prioridade | Status | Regras | Fase |
|---|---------|-----------|--------|--------|------|
| F007 | Cozinha (KDS) | 🟠 High | Backlog | [COZINHA.md](../03_REGRAS_DE_NEGOCIO/COZINHA.md) | 2 — Produção |
| F008 | Estoque — baixa automática + alertas | 🟠 High | Backlog | [ESTOQUE.md](../03_REGRAS_DE_NEGOCIO/ESTOQUE.md) | 2 — Produção |
| F009 | Financeiro — contas, fluxo de caixa | 🟡 Medium | Backlog | [FINANCEIRO.md](../03_REGRAS_DE_NEGOCIO/FINANCEIRO.md) | 3 — Gestão |
| F010 | Clientes — cadastro, histórico, fiado | 🟡 Medium | Backlog | [CLIENTES.md](../03_REGRAS_DE_NEGOCIO/CLIENTES.md) | 3 — Gestão |
| F011 | Relatórios — vendas, margem, desempenho | 🟡 Medium | Backlog | [RELATORIOS.md](../03_REGRAS_DE_NEGOCIO/RELATORIOS.md) | 3 — Gestão |
| F012 | Jarvas — IA transversal (insights/alertas) | 🟡 Medium | Backlog | [JARVAS.md](../03_REGRAS_DE_NEGOCIO/JARVAS.md) | 4 — Inteligência |
| F013 | Assinatura/planos do GastroMundi (free/pro/enterprise) | 🟠 High | Backlog | [billing-flow.md](../05_FLUXOS/billing-flow.md) | Transversal — depende de gateway |
| F014 | Escala — multi-loja, fiscal, integrações (delivery/pagamentos) | 🟢 Low | Backlog | — | 5 — Escala |

## Features em Avaliação

> _Features ainda sendo avaliadas quanto a valor, viabilidade e prioridade._
