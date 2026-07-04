# Fluxo de Faturamento — GastroMundi

## Objetivo
Documentar os fluxos de faturamento do GastroMundi: upgrade de plano, cancelamento, falha de pagamento e reativação de conta.

## Contexto
Faturamento é um dos fluxos mais críticos do SaaS — impacta diretamente receita e experiência do usuário. Erros neste fluxo geram atrito, churn e perda de confiança.

> **Atenção:** este fluxo trata da **assinatura do GastroMundi** (planos free/pro/enterprise do estabelecimento — decisão 008). Não confundir com o módulo **Financeiro** (`docs/03_REGRAS_DE_NEGOCIO/FINANCEIRO.md`), que cuida das finanças do negócio do cliente (vendas, despesas, contas a pagar/receber).

## Regras Gerais
- Todo fluxo de pagamento deve ter confirmação explícita do usuário antes de processar
- Usuário deve receber confirmação por e-mail para toda transação
- Downgrade não é imediato — entra em vigor no próximo ciclo
- Dados de pagamento nunca são armazenados no banco do GastroMundi (responsabilidade do gateway)

## Validações
- Cartão de crédito deve ser validado antes de confirmar upgrade
- Valor cobrado deve ser exibido claramente antes de qualquer cobrança
- Confirmação de cancelamento deve exigir ação explícita (não acidental)

## Permissões
- Apenas o `dono` do estabelecimento pode alterar plano ou método de pagamento
- `gerente` pode visualizar o status de faturamento, mas não alterar

## Exceções
- Período de graça de 3 dias em caso de falha de pagamento
- Reembolsos manuais requerem aprovação fora do sistema

## Auditoria
- Toda transação (sucesso ou falha) deve ser registrada
- Eventos de mudança de plano devem ser logados com motivo

## Eventos
- `billing.checkout.initiated` — usuário iniciou fluxo de upgrade
- `billing.payment.success` — pagamento aprovado
- `billing.payment.failed` — pagamento recusado
- `billing.subscription.cancelled` — cancelamento confirmado
- `billing.grace-period.started` — período de graça iniciado
- `billing.access.restricted` — acesso restrito por inadimplência
- `billing.reactivated` — conta reativada após pagamento

## Configurações Futuras
- Integrar gateway de pagamento (Stripe, PagSeguro, ou similar)
- Suporte a planos anuais com desconto
- Notificações proativas de renovação (3 dias antes)
- Portal de faturamento self-service

## Casos de Uso
- UC01: Usuário no plano Free faz upgrade para Pro
- UC02: Usuário cancela assinatura Pro
- UC03: Pagamento falha e sistema entra em modo de graça
- UC04: Usuário reativa conta após resolver inadimplência

## Critérios de Aceite
- [ ] Upgrade exige confirmação e mostra valor antes de cobrar
- [ ] Downgrade agenda para próximo ciclo (não imediato)
- [ ] Cancelamento mostra consequências antes de confirmar
- [ ] Falha de pagamento aciona período de graça de 3 dias
- [ ] Usuário recebe e-mail em toda transação relevante

---

## Fluxo: Upgrade de Plano

```
[Painel / Settings / Billing]
    │
    ├── Seleciona plano Pro
    │
    ├── Exibe resumo: plano, valor, data de cobrança
    │
    ├── Informa/confirma método de pagamento
    │
    ├── [Confirmar]
    │       │
    │       ├── Sucesso → plano atualizado imediatamente
    │       │          → e-mail de confirmação
    │       │          → proration calculada
    │       │
    │       └── Falha → exibe erro do gateway
    │                 → solicita novo método de pagamento
```

## Fluxo: Cancelamento

```
[Settings / Billing]
    │
    ├── "Cancelar assinatura"
    │
    ├── Modal: consequências do cancelamento
    │       → perda de acesso a features Pro no fim do ciclo
    │       → dados preservados
    │
    ├── Confirmação explícita ("Entendo e quero cancelar")
    │
    └── Cancelamento agendado para fim do ciclo atual
            → e-mail de confirmação
            → banner de aviso até o fim do período
```

## Fluxo: Falha de Pagamento

```
[Ciclo de renovação]
    │
    ├── Pagamento falha
    │
    ├── E-mail de notificação ao usuário
    │
    ├── Período de graça: 3 dias
    │       │
    │       ├── Usuário regulariza → renovação processada
    │       │
    │       └── Não regulariza → acesso restrito
    │                         → dados preservados por 30 dias
    │
    └── Reativação: usuário atualiza pagamento → acesso restaurado
```
