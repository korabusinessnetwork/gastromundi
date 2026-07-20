# Restrições Permanentes — {{PRODUTO}}

## Objetivo
- Documentar limites e restrições que guiam decisões
- Evitar caminhos bloqueados (custo, legal, ético, técnico)
- Força atualizações de restrições vencidas

## Contexto
- Restrição = barreira de entrada; exceção exige ADR
- Revisão: {{PERIODICIDADE_REVISAO}} (trimestral recomendado)

## Regras Gerais
- Nenhuma restrição ignorada sem ADR formal de exceção
- Restrições legais/compliance têm prioridade máxima
- Restrição vencida é removida; não acumula dívida técnica

## Validações
- Restrição tem justificativa concreta?
- Data de revisão planejada está clara?

## Permissões
- Dono/compliance: aprova exceção de restrição legal
- Tech lead: aprova exceção técnica

## Exceções
- Restrição legal pode ser violada por decisão explícita do dono com ADR (raro)

## Auditoria
- Revisar todas as restrições contra realidade trimestralmente
- Exceções aprovadas vira ADR público

## Eventos
- `restriction.added`, `restriction.excepted`, `restriction.lifted`

## Casos de Uso
- "Posso usar biblioteca paga?"
- "Posso armazenar dados de PII sem encriptação?"
- "Temos limite de infraestrutura?"

## Critérios de Aceite
- [ ] Cada categoria tem mínimo 1 restrição preenchida
- [ ] Restrições com data de revisão clara
- [ ] Exceções aprovadas linkadas a ADR

---

## Restrições Técnicas

| Restrição | Detalhes | Revisão | Exceção |
|---|---|---|---|
| {{RESTRICAO}} | {{DETALHES}} | {{DATA}} | {{COMO_EXCETAR}} |
| Sem Redis pago (bootstrap) | Use Supabase cache, não terceiros | 2024-06-01 | Exceção por ADR se crescer 10x |
| Sem webhook pago | Use Supabase functions (grátis), Zapier premium recusado | 2024-06-01 | Reavalia se LTV > R$ 100k |

## Restrições Legais / Compliance

| Restrição | Detalhes | Prioridade | Revisão |
|---|---|---|---|
| {{RESTRICAO}} | {{DETALHES}} | {{PRIORIDADE}} | {{DATA}} |
| LGPD: consentimento explícito | Antes de coletar email/telefone, obter opt-in | CRÍTICA | 2024-03-01 (anual) |
| Dados de menores | Proibido coletar qualquer dado PII de <18 sem consentimento dos pais | CRÍTICA | 2024-03-01 (anual) |
| Retenção de dados | 90 dias máx logs, 2 anos máx operacionais, usuário pode deletar sempre | CRÍTICA | 2024-03-01 (anual) |

## Restrições de Custo (Fase Bootstrap)

**Diretriz Geral**: Priorizar meios **gratuitos**. Toda implementação com custo relevante é **ADIADA por padrão**, salvo decisão explícita do dono.

### Implementações Pagas Encontradas
Ao esbarrar em algo pago, seguir este checklist:

- [ ] **Custo aproximado**: R$ X/mês ou Y% do MRR
- [ ] **Alternativa gratuita**: Qual? Por que não usável agora?
- [ ] **Importância/Impacto**: Crítica / Alta / Média / Baixa para produto
- [ ] **Recomendação**: Investir AGORA ou MAIS PRA FRENTE?
- [ ] **Decisão do dono**: [Reter até decisão explícita]

### Exemplos de Itens Pagos (Restringidos)

| Item | Custo Aprox | Alt Grátis | Impacto | Status |
|---|---|---|---|---|
| {{ITEM}} | {{R$}} | {{SIM/NAO}} | {{IMPACTO}} | [ADIADO] |
| Stripe (gateway) | 2.99% + R$ 0.30/tx | PIX/TED manual | CRÍTICA | [ADIADO até MRR >10k] |
| SMS de notificação | R$ 0.15/SMS | E-mail via Resend (grátis) | MÉDIA | [ADIADO, usar e-mail] |
| TEF (maquinha) | Assinatura + % | Manual/PIX | ALTA | [ADIADO, fase 2] |
| NFC-e gerador pago | ~R$ 100/mês | Sistema público SEFAZ (grátis) | ALTA | [ADIADO] |
| Analytics pago (Mixpanel) | R$ 200+/mês | PostHog open-source, Plausible | MÉDIA | [ADIADO, usar Plausible grátis] |

**Processo**: Dono revisa lista trimestralmente, aprova investimentos conforme receita cresce.

## Restrições de Produto

| Restrição | Detalhes | Por quê | Exceção |
|---|---|---|---|
| {{RESTRICAO}} | {{DETALHES}} | {{RAZAO}} | {{COMO_EXCETAR}} |
| Sem lock-in | Usuário pode exportar dados 100% em CSV/JSON anytime | Diferencial + confiança | Nunca. Prioridade máxima |
| Multi-tenancy obrigatório | Novo código assume N estabelecimentos, não hardcoda marca/cores | Roadmap escala | Refatorar antes de merge (ADR-017) |
| Sem hardcode de identidade | Tema, cores, logo, regras vêm do tenant config | White-label | Usar ConfigContext, nunca CSS constante |

## Restrições Éticas

| Restrição | Detalhes | Revisão |
|---|---|---|
| {{RESTRICAO}} | {{DETALHES}} | {{DATA}} |
| Transparência de IA | Se usar IA (Jarvas, recomendação), informar ao usuário que é automático | 2024-06-01 |
| Sem dark patterns | Nada de default sneaky (auto-renovação, confirmação dupla para cancelar) | Contínuo |

---

## Plano de Revisão

- **Próxima revisão legal/compliance**: {{DATA_PROXIMA}}
- **Próxima revisão técnica**: {{DATA_PROXIMA}}
- **Próxima revisão de custo**: {{DATA_PROXIMA}}
- **Proprietário de cada seção**: {{NOME_RESPONSAVEL}}

## Exceções Aprovadas (ADRs)

| Restrição | ADR | Data Exceção | Contexto |
|---|---|---|---|
| {{RESTRICAO}} | ADR-NNN | {{DATA}} | {{MOTIVO_BREVE}} |
