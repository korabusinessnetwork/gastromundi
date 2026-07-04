# Prompts de Agentes de IA — GastroMundi

## Objetivo
Documentar e versionar todos os prompts de agentes de IA utilizados no GastroMundi, com contexto, versão, casos de uso e histórico de alterações.

## Contexto
Se o GastroMundi utilizar funcionalidades baseadas em LLM, este arquivo centraliza todos os prompts de sistema, instruções de agentes e templates de geração. Prompts são tratados como código — versionados, revisados e testados.

## Regras Gerais
- Todo prompt de produção deve ter versão (ex: `v1.0`, `v1.1`)
- Mudanças em prompts de produção exigem teste antes do deploy
- Prompts não devem conter dados pessoais de usuários como exemplos
- Prompts devem ser testados com casos extremos (respostas inesperadas, jailbreak attempts)

## Validações
- Saídas de LLM devem ser validadas antes de usar em contexto sensível
- Prompts com acesso a dados do usuário devem ser auditados quanto à privacidade

## Permissões
- Tech lead aprova prompts com acesso a dados sensíveis
- Product owner aprova prompts que geram copy voltada ao usuário

## Exceções
- Prompts de prototipagem/experimentação podem ser marcados como `[EXPERIMENTAL]`

## Auditoria
- Versão, autor e data de cada prompt devem ser registrados
- Revisão de prompts: a cada ciclo de produto ou após incidente relacionado

## Eventos
- `llm.prompt.updated` — prompt de produção atualizado
- `llm.response.error` — resposta inesperada de LLM detectada

## Configurações Futuras
- Implementar sistema de prompt management (PromptLayer, LangSmith, ou similar)
- Criar pipeline de avaliação automatizada de prompts
- Definir guardrails para outputs de LLM

## Casos de Uso
- Features de IA do produto (a definir conforme o produto evolui)

## Critérios de Aceite
- [ ] Todo prompt tem versão, autor e data
- [ ] Testes de prompt estão documentados com exemplos de input/output esperado
- [ ] Prompts de produção estão separados de prompts experimentais

---

## Registro de Prompts

> _Nenhum prompt de IA definido ainda. Preencher conforme o produto evolui._

### Template de Entrada de Prompt

```markdown
## [Nome do Prompt] — v[X.Y]

**Versão:** X.Y  
**Data:** YYYY-MM-DD  
**Autor:** [nome]  
**Modelo alvo:** [ex: gpt-4o, claude-3-5-sonnet]  
**Status:** experimental | ativo | deprecated

### Prompt de Sistema

\```
[Conteúdo do prompt aqui]
\```

### Exemplos de Teste

| Input | Output Esperado | Output Real | Status |
|-------|----------------|-------------|--------|
| — | — | — | — |

### Histórico de Versões

| Versão | Data | Mudança | Autor |
|--------|------|---------|-------|
| 1.0 | — | Versão inicial | — |
```
