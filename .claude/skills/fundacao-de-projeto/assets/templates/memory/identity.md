# Identidade do Produto — {{PRODUTO}}

## Objetivo
- Documentar a identidade, visão e diferencial do produto
- Guiar decisões de produto, design e comunicação
- Manter coerência em todos os pontos de contato com o usuário

## Contexto
- Mercado/vertical: {{MERCADO}}
- Estágio: {{ESTAGIO_PRODUTO}} (ideação/MVP/crescimento/escala)
- Competidores diretos: {{COMPETIDORES}}

## Regras Gerais
- Identidade é fonte de verdade para mensagens, tone of voice, visual
- Personas e públicos-alvo devem guiar todo novo recurso
- Posicionamento não muda sem revisão de mercado

## Validações
- Cada mensagem público alinha com a fórmula de posicionamento?
- Personas refletem pesquisa real de usuário?

## Permissões
- Dono do produto: {{DONO}} (ajusta propósito, persona, roadmap)
- Design/marketing: (aplica tom e identidade visual)

## Exceções
- Decisões de posicionamento overnight exigem ADR

## Auditoria
- Revisar identidade trimestralmente contra mercado

## Eventos
- `product.identity_defined`, `product.positioning_updated`, `persona.identified`

## Configurações Futuras
- Testes de posicionamento com usuários reais
- Pesquisa de marca (awareness, recall)

## Casos de Uso
- Briefar novo membro do time
- Validar novo recurso contra identidade
- Decidir se entra/sai roadmap

## Critérios de Aceite
- [ ] Propósito central claro e testado com 3+ usuários
- [ ] Personas documentadas com dores reais
- [ ] Tom de voz com exemplos ✅ e ❌
- [ ] Roadmap definido até Fase 2

---

## Propósito Central

### Visão
{{VISAO_LONGA_5ANOS}}

### Propósito
O que {{PRODUTO}} faz e por quê
- Problema que resolve: {{PROBLEMA_CENTRAL}}
- Como resolvemos: {{SOLUCAO_DIFERENCIADA}}
- Impacto esperado: {{IMPACTO}}

*Exemplo: GastroMundi democratiza gestão de PDV/operação para bares e restaurantes indie, substituindo sistemas caros e lentos por uma ferramenta intuitiva, rápida e sem lock-in.*

## Público-Alvo

| Segmento | Perfil | Contexto | Necessidade |
|---|---|---|---|
| {{SEGMENTO_1}} | {{PROFISSAO}} | {{AMBIENTE}} | {{DOR}} |
| Gerente de bar indie | 25-45 anos, tecnófilo moderado | PDV manual + planilha | Visibilidade em tempo real sem perder ritmo |

## Valores
- {{VALOR_1}}: {{DEFINICAO}}
- {{VALOR_2}}: {{DEFINICAO}}
- Exemplo: Intuitividade, Transparência, Sem lock-in

## Posicionamento

**Para** {{PUBLICO_ALVO}} / **que** {{PROBLEMA}} / **{{PRODUTO}}** é {{CATEGORIA}} / **que** {{BENEFICIO_1}} e {{BENEFICIO_2}} / **Diferente de** {{ALTERNATIVAS}} / **entrega** {{VALOR_UNICO}}.

*Exemplo: Para gerentes de bar indie / que cansaram de PDVs burocráticos e caros / GastroMundi é um sistema de operação rápido e flexível / que oferece visibilidade em tempo real e integração fácil / Diferente de sistemas corporativos legacy / entrega simplicidade e controle total.*

## Tom de Voz

**Princípios**: {{PRINCIPE_1}}, {{PRINCIPE_2}}

**Exemplos**:
- ✅ "Abra seu caixa em 3 segundos. Sem formulários."
- ❌ "Sistema de gestão de fluxo de caixa integrado com interface modular."

**Tom**: Direto, honesto, sem jargão. Fala como um colega experiente do dia a dia, não como textbook.

## Manifesto (versão 1.0)
1. {{MANIFESTO_1}} — não somos para gigantes com TI
2. {{MANIFESTO_2}} — a complexidade vem depois, se pedir
3. {{MANIFESTO_3}} — o usuário e seus dados são soberanos

## Personas (2-4)

### {{PERSONA_1_NOME}}
- **Contexto**: {{CONTEXTO}}
- **Dores**: {{DOR_1}}, {{DOR_2}}
- **Objetivos**: {{OBJETIVO_1}}, {{OBJETIVO_2}}
- **Sucesso**: {{METRICA_SUCESSO}}

*Exemplo: João, Gerente de Bar*
- Contexto: barzinho de esquina, 3 funcionários, venda diária R$ 2k-5k
- Dores: perder controle do estoque, não saber lucro real por noite, medo de roubo no caixa
- Objetivos: fechar noite rapidinho, saber quanto lucrou, dormir tranquilo
- Sucesso: abrir caixa e fechar em <10 min por noite, visualizar lucro ao fechar

## Princípios do Produto
- Intuitividade acima de tudo (sem manual)
- Dados são do cliente (zero lock-in)
- Funciona offline/resiliente (internet instável)

## Identidade Visual (marca)
- **Cores primárias**: {{COR_1}}, {{COR_2}}
- **Tom visual**: {{ESTILO}}
- **Logo/símbolo**: {{DESCRICAO}}

## Roadmap

- **Fase 0 (Ideação)**: Validação com 10+ usuários, proto baja
- **Fase 1 (MVP)**: Caixa diário, fechamento básico, relatório vendas
- **Fase 2**: Inventário, integração PDV, alertas (Jarvas)
- **Fase 3**: Multi-caixa, multi-loja, white-label
- **Fase 4**: Marketplace de extensões, BI avançado
- **Fase 5**: Plataforma aberta (API públicas, ISV)
