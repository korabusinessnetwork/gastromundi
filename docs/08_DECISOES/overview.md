# Decisões Arquiteturais (ADRs) — GastroMundi

## Objetivo
Documentar todas as decisões arquiteturais relevantes do GastroMundi usando o formato ADR (Architecture Decision Record), garantindo rastreabilidade e contexto para decisões futuras.

## Contexto
ADRs capturam o "porquê" por trás de decisões técnicas e de produto significativas. Quando a equipe muda ou o contexto evolui, ADRs evitam que a mesma discussão seja reaberta sem o conhecimento do que foi considerado anteriormente.

## Regras Gerais
- Toda decisão com impacto duradouro na arquitetura, stack ou produto deve ter um ADR
- ADRs são imutáveis — se a decisão mudar, cria-se um novo ADR que supersede o anterior
- ADRs têm status: `Proposto` → `Aceito` → `Supersedido` | `Deprecado`
- O número do ADR é sequencial e permanente — nunca reutilizar um número

## Validações
- ADR deve ser revisado por pelo menos um membro sênior antes de ser aceito
- ADRs que afetam segurança ou privacidade exigem revisão adicional

## Permissões
- Qualquer membro pode propor um ADR
- Aceitação de ADR exige aprovação do tech lead (decisões técnicas) ou product owner (decisões de produto)

## Exceções
- Decisões emergenciais podem ser documentadas retroativamente em até 48h

## Auditoria
- Data de proposta e aceitação de cada ADR devem ser registradas
- Revisão de ADRs aceitos: anual ou quando o contexto mudar significativamente

## Eventos
- `adr.proposed` — novo ADR proposto
- `adr.accepted` — ADR aceito pela equipe
- `adr.superseded` — ADR substituído por decisão mais recente

## Configurações Futuras
- Automatizar geração de índice de ADRs
- Integrar ADRs ao processo de onboarding técnico

## Casos de Uso
- Onboarding técnico de novos membros
- Revisão de arquitetura
- Avaliação de migração ou mudança de tecnologia
- Auditoria de decisões passadas

## Critérios de Aceite
- [ ] Todos os ADRs seguem o template padrão
- [ ] Índice está atualizado
- [ ] Status de cada ADR está correto

---

## Índice de ADRs

| # | Título | Status | Data |
|---|--------|--------|------|
| [ADR-001](./adr-001.md) | Stack tecnológica inicial: React + Vite + Tailwind + Supabase | Revisado (parcialmente supersedido pelo ADR-002) | 2026-06-15 |
| [ADR-002](./adr-002.md) | Revisão da stack: API Express (contract-first) + Drizzle + Clerk; Supabase como Postgres gerenciado | Supersedido pelo ADR-004 (mantido como roadmap) | 2026-06-16 |
| [ADR-003](./adr-003.md) | Rebrand do produto: Kora → GastroMundi | Aceito | 2026-07-03 |
| [ADR-004](./adr-004.md) | Junção da fundação com o app em produção: stack real (Supabase direto) prevalece; ADR-002 vira roadmap | Aceito | 2026-07-03 |
| [ADR-005](./adr-005.md) | Planos, gating por módulo e add-ons pagos (F013) — registro central `planos`/`planos_modulos`, gating em 3 camadas, tabela `tenants` mínima | Proposto (documentação — implementação não iniciada) | 2026-07-06 |
| [ADR-006](./adr-006.md) | Billing e enforcement de assinatura (F016) — vigência, carência, bloqueio real via RLS/RPC | Proposto (documentação — implementação não iniciada) | 2026-07-06 |
| [ADR-007](./adr-007.md) | Theming e white-label por estabelecimento — CSS Custom Properties + padrão `.css` co-localizado | Proposto (documentação — implementação não iniciada) | 2026-07-06 |

---

## Template de ADR

```markdown
# ADR-XXX: [Título da Decisão]

**Status:** Proposto | Aceito | Supersedido | Deprecado  
**Data:** YYYY-MM-DD  
**Decisores:** [nomes]  
**Supersede:** ADR-XXX (se aplicável)  
**Supersedido por:** ADR-XXX (se aplicável)

## Contexto
[O problema ou situação que