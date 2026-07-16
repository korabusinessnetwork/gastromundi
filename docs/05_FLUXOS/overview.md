# Fluxos — Visão Geral — GastroMundi

## Objetivo
Indexar e descrever todos os fluxos de usuário documentados no GastroMundi, fornecendo uma visão navegável de como os usuários transitam pela plataforma.

## Contexto
Fluxos documentam a jornada do usuário em sequências de telas, decisões e estados. São a ponte entre regras de negócio e implementação de UX.

## Regras Gerais
- Todo fluxo crítico (auth, pagamento, exclusão de dados) deve ser documentado antes de implementado
- Fluxos devem incluir estados de erro e casos extremos, não apenas o happy path
- Fluxos são agnósticos de tecnologia — descrevem comportamento, não implementação

## Validações
- Fluxos novos devem ser revisados pelo product owner antes do desenvolvimento
- Casos de erro devem ter tratamento definido em cada etapa

## Permissões
- Qualquer membro pode consultar fluxos
- Criação e alteração de fluxos críticos exige revisão do product owner

## Exceções
- Fluxos de funcionalidades experimentais podem ser documentados de forma mais livre com tag `[EXPERIMENTAL]`

## Auditoria
- Data de criação e última revisão de cada fluxo devem ser registradas

## Eventos
- `flow.documented` — novo fluxo documentado
- `flow.updated` — fluxo existente atualizado

## Configurações Futuras
- Criar diagramas visuais de fluxo (Mermaid ou Figma FigJam)
- Vincular fluxos a testes E2E automatizados

## Casos de Uso
- Planejamento de features
- Revisão de UX
- Escrita de testes E2E
- Onboarding de QA

## Critérios de Aceite
- [ ] Todos os fluxos críticos estão documentados
- [ ] Happy path e casos de erro estão cobertos em cada fluxo
- [ ] Fluxos estão atualizados com a realidade do produto

---

## Índice de Fluxos

| Fluxo | Arquivo | Criticidade | Status |
|-------|---------|-------------|--------|
| Autenticação | [auth-flow.md](./auth-flow.md) | Alta | Rascunho |
| Onboarding (alvo/roadmap) | [onboarding-flow.md](./onboarding-flow.md) | Alta | Rascunho |
| **Ativar novo estabelecimento (app real)** | [ativar-novo-estabelecimento.md](./ativar-novo-estabelecimento.md) | Alta | Vigente |
| Faturamento | [billing-flow.md](./billing-flow.md) | Alta | Rascunho |
