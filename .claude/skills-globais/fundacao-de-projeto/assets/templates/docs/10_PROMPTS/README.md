# 10 — PROMPTS · {{PRODUTO}}

> Biblioteca de prompts/templates para agentes IA usados no projeto.

## O que vive aqui

- **Prompts de agentes**: instruções para Claude/IA que roda no projeto
- **Templates de interação**: como conversar com IA sobre X
- **Jarvas (IA transversal)**: prompts para insights, alertas, sugestões
- **Análise de dados**: prompts para extrair insights de logs, relatórios
- **Code generation**: prompts para gerar código, testes, documentação
- **Versionamento de prompts**: histórico, mudanças, performance

## O que NÃO vive aqui

- Código dos agentes IA → `src/` (implementação)
- Decisões sobre como usar IA → `08_DECISOES/`
- Regras de negócio que IA executa → `03_REGRAS_DE_NEGOCIO/`
- Fluxos que IA participa → `05_FLUXOS/`

## Arquivos sugeridos

- `agent-prompts.md` — prompts dos agentes do projeto (Jarvas, análise, etc.)
- `jarvas-insights.md` — prompts para IA gerar insights de vendas, estoqueagem
- `jarvas-alertas.md` — prompts para detectar anomalias, disparar alertas
- `code-generation.md` — prompts para gerar migrations, testes, boilerplate
- `templates.md` — templates reutilizáveis (ex: "resumir relatório de X")
- `versionamento.md` — histórico de prompts, versão atual, performance

## Como preencher

1. **Prompt começa vago → versão 1.0**: teste, refina, documente a versão final
2. **Versionamento**: marque data e mudança ("adicionado contexto de X", "melhorado clareza")
3. **Métricas**: se possível, registra qualidade de output (acurácia, latência)
4. **Reutilizável vs. específico**: templates genéricos em `templates.md`, específicos em seu arquivo
5. **Não delete prompts antigos**: marque como "v0.9 (obsoleto)", mantenha histórico

## Ligações

- `docs/03_REGRAS_DE_NEGOCIO/JARVAS.md` — regras que Jarvas implementa
- `src/` — código que chama esses prompts
- `01_ARQUITETURA/` — quais agentes IA rodam no projeto (ADR)
