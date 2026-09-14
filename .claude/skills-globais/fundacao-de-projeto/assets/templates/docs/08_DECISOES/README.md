# 08 — DECISÕES · {{PRODUTO}}

> ADRs (Architecture Decision Records): por que escolhemos X em vez de Y.

## O que vive aqui

- **ADRs**: decisões técnicas formalizadas (status, contexto, alternativas, consequências)
- **Ciclo de vida**: Proposto → Aceito → Supersedido
- **Arquivo**: um ADR por arquivo (`adr-NNN-titulo.md`)
- **Histórico**: decisões antigas/supersedidas ficam, marcadas como "Supersedido por"
- **Rastreabilidade**: quando foi decidido, quem decidiu, qual código implementa

## O que NÃO vive aqui

- Implementação da decisão → `src/`
- Especificações de API → `07_APIS/`
- Regras de negócio → `03_REGRAS_DE_NEGOCIO/`
- Fluxos → `05_FLUXOS/`

## Arquivos sugeridos

- `adr-000-template.md` — TEMPLATE: copie e preencha para novo ADR
- `adr-001-escolher-database.md` — por que Supabase vs. Firebase vs. RDS
- `adr-002-autenticacao.md` — por que Clerk vs. Auth0 vs. custom
- `adr-003-frontend-framework.md` — por que React vs. Vue vs. Svelte
- `adr-004-...` — continue numerando sequencialmente

## Como preencher

1. **Copie `adr-000-template.md`**: renomeie para `adr-NNN-titulo.md`
2. **Preencha todas as seções**: Contexto, Decisão, Alternativas, Consequências
3. **Status começa "Proposto"**: aprovação → "Aceito", depois → "Supersedido"
4. **Não delete ADRs antigos**: marque como "Supersedido por adr-NNN", arquivo fica no histórico
5. **Atualize quando decisão muda**: novo ADR que supersede, link bidirecional

## Ligações

- `adr-000-template.md` — comece aqui, clone para novo ADR
- `01_ARQUITETURA/` — ADRs justificam as escolhas técnicas
- `03_REGRAS_DE_NEGOCIO/` — se regra é decisão técnica, document em ADR
