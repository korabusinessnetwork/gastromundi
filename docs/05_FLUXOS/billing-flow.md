# Fluxo de Faturamento — GastroMundi

## Objetivo
Documentar os fluxos de faturamento do GastroMundi: upgrade de plano, cancelamento, falha de pagamento e reativação de conta.

## Contexto
Faturamento é um dos fluxos mais críticos do SaaS — impacta diretamente receita e experiência do usuário. Erros neste fluxo geram atrito, churn e perda de confiança.

> **Atenção:** este fluxo trata da **assinatura do GastroMundi** (mensalidade do plano do estabelecimento). Não confundir com o módulo **Financeiro** (`docs/03_REGRAS_DE_NEGOCIO/FINANCEIRO.md`), que cuida das finanças do negócio do cliente (vendas, despesas, contas a pagar/receber).
>
> **Atualizado em 2026-07-06** para bater com [ADR-005](../08_DECISOES/adr-005.md)/[ADR-006](../08_DECISOES/adr-006.md): os planos não são mais `free/pro/enterprise` (decisão 008, revisada) — são cinco tiers superconjunto (**Básico, Simples, Médio, Alto, Avançado**, ver ADR-005). E-mail transacional e gateway de pagamento **não existem hoje** (Restrições de Custo) — o texto abaixo descreve o **fluxo-alvo**; a fase inicial (ver `docs/09_BACKLOG/plano_tecnico_comercializacao.md`) usa **confirmação manual de pagamento** (Pix/transferência fora do sistema, dado baixa por um admin da plataforma) no lugar de checkout/cartão, e o aviso de vencimento é um banner dentro do próprio app, não e-mail. Nada neste arquivo está implementado ainda.

## Regras Gerais
- Todo fluxo de pagamento deve ter confirmação explícita do usuário antes de processar
- Notificação de toda transação relevante — hoje via banner no app; e-mail fica para quando houver provedor configurado (custo, ver `memory/restrictions.md`)
- Downgrade não é imediato — entra em vigor no próximo ciclo
- Dados de pagamento nunca são armazenados no banco do GastroMundi (responsabilidade do gateway, quando existir; na fase manual, não há dado de cartão nenhum a guardar)

## Validações
- Valor cobrado deve ser exibido claramente antes de qualquer cobrança/confirmação de renovação
- Confirmação de cancelamento deve exigir ação explícita (não acidental)
- A checagem de vigência da assinatura **mora no backend** (RLS/RPC) — nunca só no front (ver ADR-006)

## Permissões
- Apenas o `dono` do estabelecimento pode alterar plano
- `gerente` pode visualizar o status de faturamento, mas não alterar
- Confirmar renovação (baixa de pagamento) é ação de administração da **plataforma** GastroMundi, não do estabelecimento cliente, nesta fase manual

## Exceções
- Período de carência configurável (exemplo usado nos ADRs: 5 dias) em caso de vencimento sem renovação — ver questões em aberto no ADR-006 quanto ao valor definitivo
- Add-ons pagos (NF-e, TEF — decisão 019) têm ciclo/cobrança **independentes** da mensalidade do plano: inadimplência de um add-on não bloqueia o sistema, só o add-on

## Auditoria
- Toda confirmação de pagamento (sucesso ou falha) deve ser registrada (`assinaturas_pagamentos`, ver ADR-006)
- Eventos de mudança de plano/status devem ser logados com motivo

## Eventos
- `billing.checkout.initiated` — usuário iniciou fluxo de upgrade
- `billing.payment.success` — pagamento confirmado (manual, nesta fase)
- `billing.payment.failed` — pagamento recusado (quando houver gateway)
- `billing.subscription.cancelled` — cancelamento confirmado
- `billing.grace-period.started` — período de carência iniciado
- `billing.access.restricted` — acesso bloqueado por inadimplência
- `billing.reactivated` — conta reativada após confirmação de pagamento

## Configurações Futuras
- Integrar gateway de pagamento (Pix automático, cartão recorrente) — adiado por custo; ver ADR-006 e `memory/restrictions.md`
- Suporte a planos anuais com desconto
- Notificações por e-mail/SMS de renovação — adiado por custo (sem provedor configurado hoje)
- Portal de faturamento self-service

## Casos de Uso
- UC01: Estabelecimento no plano Básico faz upgrade para Médio
- UC02: Estabelecimento cancela a assinatura
- UC03: Mensalidade vence sem renovação e o sistema entra em carência, depois bloqueio
- UC04: Admin da plataforma confirma pagamento manual e o sistema é reativado

## Critérios de Aceite
- [ ] Upgrade exige confirmação e mostra valor antes de aplicar
- [ ] Downgrade agenda para próximo ciclo (não imediato)
- [ ] Cancelamento mostra consequências antes de confirmar
- [ ] Vencimento sem renovação aciona carência antes do bloqueio (ADR-006)
- [ ] Bloqueio por inadimplência é reforçado no backend (RLS/RPC), não só escondido na UI

---

## Fluxo: Upgrade de Plano

```
[Painel / Settings / Billing]
    │
    ├── Seleciona plano superior (ex.: Médio → Alto)
    │
    ├── Exibe resumo: plano, módulos que passam a estar disponíveis, valor, data de cobrança
    │
    ├── [Confirmar]
    │       │
    │       ├── Fase manual (atual): admin da plataforma registra a mudança de plano
    │       │          → tenants.plano_codigo atualizado
    │       │          → banner de confirmação no app
    │       │
    │       └── Fase futura (gateway): confirma método de pagamento
    │                 → sucesso: plano atualizado + proration calculada
    │                 → falha: exibe erro do gateway, solicita novo método
```

## Fluxo: Cancelamento

```
[Settings / Billing]
    │
    ├── "Cancelar assinatura"
    │
    ├── Modal: consequências do cancelamento
    │       → perda de acesso aos módulos do plano no fim do ciclo pago
    │       → dados preservados
    │
    ├── Confirmação explícita ("Entendo e quero cancelar")
    │
    └── Cancelamento agendado para fim do ciclo atual (assinaturas.status → 'cancelado' na data de vencimento)
            → banner de confirmação
            → banner de aviso até o fim do período
```

## Fluxo: Vencimento sem Renovação (ver ADR-006)

```
[Ciclo de renovação — assinaturas.data_vencimento]
    │
    ├── Vencimento passa sem confirmação de pagamento
    │       → status: ativo → carencia
    │       → banner no app: "mensalidade vencida, X dias para regularizar"
    │
    ├── Período de carência (default configurável, ex.: 5 dias)
    │       │
    │       ├── Admin confirma pagamento (confirmar_renovacao_assinatura) → status volta a 'ativo'
    │       │
    │       └── Carência esgota sem confirmação → status: carencia → bloqueado
    │                         → tela cheia "Sua mensalidade está atrasada"
    │                         → enforcement real via assinatura_ativa(tenant_id) nas políticas RLS de escrita
    │                         → dados preservados (sem exclusão)
    │
    └── Reativação: usuário atualiza pagamento → acesso restaurado
```
