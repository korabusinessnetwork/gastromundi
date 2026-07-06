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
| F013 | Assinatura/planos do GastroMundi (5 tiers: Básico/Simples/Médio/Alto/Avançado, decisão 020) — gating por módulo, registro central | 🟠 High | Planejado (ADR pronto, código não iniciado) | [billing-flow.md](../05_FLUXOS/billing-flow.md) · [ADR-005](../08_DECISOES/adr-005.md) · [plano_tecnico_comercializacao.md](./plano_tecnico_comercializacao.md) | Transversal — fase inicial não depende de gateway (renovação manual, ver ADR-006) |
| F014 | Escala — multi-loja, fiscal, integrações (delivery/pagamentos) | 🟢 Low | Backlog | — | 5 — Escala |
| F015 | Layouts de impressão (nota fiscal, produção/cozinha, comprovante de pagamento) — templates configuráveis por estabelecimento (white-label, decisão 017) | 🟠 High | Backlog | [ADR-007](../08_DECISOES/adr-007.md) | Transversal — usa infra de impressão já existente (`views/impressao/`); hook de branding descrito no ADR-007 §4 |
| F016 | Enforcement de assinatura (billing counter) — vigência por ciclo pago (ex.: 30 dias); ao vencer sem renovação, **bloquear o sistema** com mensagem "Sua mensalidade está atrasada". Inclui período de carência/grace e aviso pré-vencimento. Complementa/estende F013 | 🔴 Critical | Planejado (ADR pronto, código não iniciado) | [billing-flow.md](../05_FLUXOS/billing-flow.md) · [ADR-006](../08_DECISOES/adr-006.md) · [plano_tecnico_comercializacao.md](./plano_tecnico_comercializacao.md) | Transversal — depende de F013; gateway de pagamento adiado por custo, renovação manual na fase inicial |
| F017 | Integração TEF (pagamento por maquininha/terminal — cartão débito/crédito integrado ao PDV) | 🟠 High | Backlog | [PDV.md](../03_REGRAS_DE_NEGOCIO/PDV.md) · [ADR-005](../08_DECISOES/adr-005.md) | **Add-on pago transversal** (decisão 019): disponível em TODOS os planos por valor adicional, não é recurso de tier. Código **nativo** (hook no PDV) desde já; provedor TEF pago (SiTef/PayGo) é o que se adia por custo |
| F019 | Emissão de nota fiscal no pagamento (NFC-e/NF-e) — **add-on pago transversal** (decisão 019): opção em TODOS os planos por valor adicional. Hook nativo no fluxo de pagamento; layouts em F015 | 🟠 High | Backlog | [PDV.md](../03_REGRAS_DE_NEGOCIO/PDV.md) · [FINANCEIRO.md](../03_REGRAS_DE_NEGOCIO/FINANCEIRO.md) · [ADR-005](../08_DECISOES/adr-005.md) | Código nativo desde já; provedor fiscal pago é o que se adia por custo (ver Restrições de Custo) |
| F018 | Revisão completa da estrutura de CSS — layout totalmente intuitivo e **responsivo**, com separação CSS/JSX (decisão 018) e base para theming/white-label por tenant (decisão 017) | 🟠 High | Planejado (padrão fixado, migração de telas não iniciada) | [02_DESIGN_SYSTEM/](../02_DESIGN_SYSTEM/) · [ADR-007](../08_DECISOES/adr-007.md) | Transversal — padrão fixado em ADR-007 (`.css` co-localizado + CSS Custom Properties); aplicar tela a tela |

## Features em Avaliação

> _Features ainda sendo avaliadas quanto a valor, viabilidade e prioridade._
