# Prompts — Visão Geral — GastroMundi

## Objetivo
Documentar todos os prompts utilizados no GastroMundi: prompts de agentes de IA, templates de e-mail, mensagens do sistema e scripts de comunicação com o usuário.

## Contexto
Esta pasta centraliza toda a "cópia de sistema" do GastroMundi: mensagens que o sistema envia ao usuário (toasts, modais de confirmação, e-mails), prompts de LLM (se o produto usar IA), e templates reutilizáveis de comunicação.

## Regras Gerais
- Todo texto do sistema deve ser revisado pelo product owner antes de ir para produção
- Prompts de LLM devem ser versionados e testados antes de trocar em produção
- Templates de e-mail devem seguir as diretrizes de tom de voz em `memory/identity.md`
- Mensagens de erro são documentadas em `docs/07_APIS/error-handling.md`, não aqui

## Validações
- Prompts de LLM devem ser testados com casos extremos (edge cases) antes de deploy
- Templates de e-mail devem ser testados em múltiplos clientes (Gmail, Outlook, Apple Mail)

## Permissões
- Product owner aprova toda cópia voltada ao usuário
- Tech lead aprova prompts de LLM com impacto em segurança ou privacidade

## Exceções
- Microcópias de UI (labels, placeholders, tooltips) são documentadas junto ao componente

## Auditoria
- Mudanças em prompts de LLM devem ser versionadas
- E-mails transacionais devem ser testados antes de ativar em produção

## Eventos
- `prompt.llm.updated` — prompt de LLM atualizado em produção
- `email.template.updated` — template de e-mail atualizado

## Configurações Futuras
- Sistema de gerenciamento de prompts (ex: PromptLayer, LangSmith)
- A/B testing de copies de e-mail
- Internacionalização de templates (i18n)

## Casos de Uso
- Comunicação transacional com o usuário (boas-vindas, confirmação, alertas)
- Funcionalidades de IA que usam LLMs
- Padronização de tom de voz em toda a plataforma

## Critérios de Aceite
- [ ] Todos os prompts de LLM estão versionados e documentados
- [ ] Templates de e-mail estão documentados e testados
- [ ] Tom de voz é consistente com `memory/identity.md`

---

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [agent-prompts.md](./agent-prompts.md) | Prompts de agentes de IA (se aplicável) |
| [templates.md](./templates.md) | Templates de e-mail e mensagens do sistema |
