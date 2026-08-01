# Aprendizados do Projeto GastroMundi

## Objetivo
Registrar aprendizados obtidos ao longo do projeto — erros cometidos, surpresas, insights e lições que a equipe não quer repetir ou quer replicar. É a memória viva do que funcionou e do que não funcionou.

## Contexto
Aprendizados não documentados se perdem. Este arquivo captura o conhecimento tácito que normalmente fica na cabeça das pessoas e some quando elas saem da equipe.

## Regras Gerais
- Qualquer membro da equipe pode (e deve) registrar aprendizados
- Aprendizados negativos (erros, falhas) devem ser registrados sem julgamento ou culpa
- Aprendizados que geram padrão devem ser movidos para `memory/patterns.md`

## Validações
- Aprendizados técnicos críticos devem ser validados por, no mínimo, um segundo membro
- Aprendizados relacionados a incidentes devem referenciar o post-mortem correspondente

## Permissões
- Todos os membros da equipe têm permissão de leitura e escrita neste arquivo

## Exceções
- Aprendizados que envolvam dados sensíveis de usuários devem ser anonimizados antes do registro

## Auditoria
- Data e autor de cada aprendizado devem ser registrados
- Revisão periódica recomendada: ao final de cada sprint ou ciclo

## Eventos
- `learning.added` — novo aprendizado registrado
- `learning.promoted` — aprendizado elevado a padrão oficial

## Configurações Futuras
- Criar ritual de retrospectiva com base neste arquivo
- Integrar aprendizados ao processo de onboarding

## Casos de Uso
- Retrospectivas de sprint
- Onboarding de novos membros
- Análise pós-incidente
- Planejamento de arquitetura futura

## Critérios de Aceite
- [ ] Cada aprendizado tem data, autor, contexto e lição clara
- [ ] Aprendizados estão categorizados por área
- [ ] Aprendizados promovidos a padrões estão referenciados

---

> Este arquivo é uma memória viva: a maioria dos aprendizados surge ao longo da execução. As entradas abaixo registram aprendizados da fase de fundação (Fase 0) e servem de modelo para os próximos.

## Aprendizados Técnicos

| Data | Aprendizado | Lição / Ação |
|------|-------------|--------------|
| 2026-06 | Isolar acesso ao Supabase em uma camada de serviços desde o início evita refatoração dolorosa depois. | Manter chamadas ao backend fora dos componentes (ver `memory/patterns.md` e decisão 007). |
| 2026-06 | RLS é poderoso, mas só protege se estiver ativo em **todas** as tabelas — uma tabela esquecida vira brecha. | Tratar RLS como requisito de definição de pronto para qualquer tabela nova. |
| 2026-08-01 | `src/lib/deliveryHorarioSqlGuard.test.js` proibia o token `lpad(` e **exigia** `'FM000'` no número do pedido do delivery. Como `to_char(n,'FM000')` não expande o gabarito (o que não cabe vira `###`), o guard obrigava a reintroduzir o bug D14 que ele existia para impedir: corrigir a migration deixou a suíte vermelha. | Guard de SQL proíbe a **forma** defeituosa (`lpad(x, 3, '0')`), nunca a palavra — e prova a regex nos dois lados, com um caso que ela deve pegar e um que ela não pode pegar. Ver `memory/patterns.md` → "Conferência textual de SQL". |
| 2026-08-01 | A âncora `/'FM000'/` continuou passando na migration `20260907` depois do conserto — casava o comentário em português que explica a fórmula removida, não o código. Mesmo falso positivo que já tinha aparecido em `20260909` sobre `pg_get_functiondef()`. | Toda conferência textual de SQL corta comentário antes: `linha.replace(/--.*$/, "")` em JS, `regexp_replace(v_def, '--.*', '', 'gn')` em PL/pgSQL. Aconteceu duas vezes — virou padrão, não é coincidência. |

## Aprendizados de Produto

| Data | Aprendizado | Lição / Ação |
|------|-------------|--------------|
| 2026-06 | A "página em branco" é o maior inimigo da documentação: estrutura vazia desmotiva preenchimento. | Entregar esqueletos opinativos (princípio de produto nº 1). |

## Aprendizados de Processo

| Data | Aprendizado | Lição / Ação |
|------|-------------|--------------|
| 2026-06 | Documentar a arquitetura **antes** de codar reduz retrabalho e alinha o time. | Manter abordagem document-first nas sprints de fundação. |
| 2026-06 | Conflitos entre instruções e a estrutura real do repositório devem ser resolvidos explicitamente, não assumidos. | Quando houver divergência entre o pedido e o que existe, registrar a decisão de mapeamento. |

## Aprendizados de Negócio

| Data | Aprendizado | Lição / Ação |
|------|-------------|--------------|
| 2026-06 | O valor central do GastroMundi (integração a partir da venda) precisa ser sentido cedo: o usuário tem que ver uma venda no PDV se propagar para caixa, estoque e relatórios. | Priorizar o "aha moment" da venda-fonte no MVP (PDV → Caixa → Pedidos). |
