# Claude Cookbooks — referência curada (padrão Kora)

> Fonte: github.com/anthropics/claude-cookbooks (MIT, Anthropic). Este arquivo
> não é um resumo do repositório inteiro — é uma curadoria do que realmente
> serve pro padrão Kora, mapeado projeto a projeto. Ler sob demanda quando:
> (a) o intake indicar que o produto vai ter IA/agente/automação como parte
> do core, ou (b) já em produção, alguma venture precisar de um padrão
> específico (memória longa, custo, orquestração, extração de documento).

## Como isso se encaixa no fluxo da fundação

Sugestão: na **Fase 3 — Arquitetura**, se o intake indicou uso de IA como
funcionalidade (não só "Claude Code constrói o app", mas "o app *usa* Claude
em produção"), consultar este arquivo antes de fechar o ADR de arquitetura.
Vira **ADR-00X: Padrão de uso de IA em produção**, escolhendo entre os
building blocks abaixo em vez de reinventar.

---

## A. Orquestração multi-modelo — já é o seu padrão, aqui está formalizado

Isso é literalmente o que o `multi-model-orchestrator` já faz (Sonnet
orquestra, Opus julgamento técnico, Haiku volume mecânica). O cookbook dá os
3 padrões-base que sustentam isso, com implementação mínima de referência:

- `patterns/agents/basic_workflows.ipynb` — os 3 padrões fundamentais:
  **prompt chaining**, **routing**, **parallelization**. Trade-off explícito
  de custo/latência vs. qualidade em cada um.
- `patterns/agents/orchestrator_workers.ipynb` — um LLM central delega
  subtarefas pra LLMs worker e sintetiza o resultado. É o desenho exato do
  seu orquestrador Sonnet → Opus/Haiku, só que como referência formal.
- `patterns/agents/evaluator_optimizer.ipynb` — um modelo gera, outro avalia
  e devolve feedback num loop. **Isso é o `loop-spec-build-review` em forma
  de padrão genérico** — vale comparar a implementação de vocês com essa
  referência pra ver se falta algum detalhe de convergência/critério de parada.
- `patterns/agents/async_multi_agent_orchestration.ipynb` (2026) — dois
  padrões assíncronos: time fixo de N agentes com mensageria via hub
  compartilhado, e subagentes spawnados dinamicamente. Útil se o
  orquestrador precisar rodar tarefas em paralelo de verdade (não sequencial).
- `multimodal/using_sub_agents.ipynb` — Haiku como sub-agente de extração +
  Opus pra síntese, aplicado a relatórios financeiros. Modelo direto pra
  qualquer fluxo de "muitos documentos pequenos → um resultado consolidado"
  (fichas técnicas do Casa Coffee, notas fiscais do GASTROMUNDI).

**Ação sugerida:** anexar um "ver também" nesses 4 notebooks dentro do
`references/` do `multi-model-orchestrator`, não duplicar conteúdo.

---

## B. Claude Managed Agents (CMA) — provavelmente o maior achado pra vocês

CMA é runtime hospedado pra agentes com estado — ambiente sandboxed
persistente, sessões que mantêm arquivos/tool state/conversa entre turnos.
Isso resolve um problema real que aparece no ATMOSFERA_PIPELINE (worker
Python local rodando polling) e no WIA (análise longa e assíncrona).

Os que importam:

- `managed_agents/CMA_use_skills_from_a_repo.ipynb` — **monta um repo GitHub
  e a pasta raiz `.claude/skills` é descoberta e injetada automaticamente na
  sessão.** Vocês já usam esse padrão de skills — isso significa que dá pra
  rodar um agente CMA que carrega as skills Kora direto do repo, sem
  reempacotar nada.
- `managed_agents/CMA_coordinate_specialist_team.ipynb` — coordenador roda
  um time heterogêneo de especialistas (pesquisador, leitor de arquivo,
  precificador) com toolset por papel. Mapeia quase 1:1 no seu Jarvas/
  Bianca/Máquina (personas internas da Kora).
- `managed_agents/CMA_plan_big_execute_small.ipynb` — economia de "modelo
  grande planeja, modelos baratos executam em paralelo", com custo real
  medido contra um controle solo-frontier. **Dado empírico pra validar (ou
  ajustar) a divisão Opus/Sonnet/Haiku que vocês já usam por intuição.**
- `managed_agents/CMA_verify_with_outcome_grader.ipynb` — loop de
  escrever→avaliar→revisar onde um grader stateless confere cada citação
  contra uma rubrica até passar. Mesmo raciocínio do `loop-spec-build-review`,
  mas com a peça de "critério de aprovação explícito e auditável" que vale
  copiar.
- `managed_agents/CMA_cap_session_spend.ipynb` — budget de custo por sessão
  com pause automático ao bater o teto. Guardrail que faz sentido em
  qualquer automação de longa duração (Autohunt Idle, Caos Diário) rodando
  sem supervisão direta.
- `managed_agents/CMA_operate_in_production.ipynb` — o guia de produção:
  credenciais MCP via vault, webhook de sessão ociosa (human-in-the-loop sem
  conexão longa-duração), webhook de budget, pinning de região. Ler antes de
  colocar qualquer CMA em produção de verdade.
- `managed_agents/data_analyst_agent.ipynb` / `slack_data_bot.ipynb` — CSV
  → relatório HTML narrativo com gráficos. Aplicação direta pros relatórios
  de CASA CLUB ou de vendas do GASTROMUNDI.

**Ação sugerida:** novo arquivo `references/claude-managed-agents.md` na
fundação, só pra ventures que precisem de automação autônoma de longa
duração (WIA é o candidato mais forte agora).

---

## C. Claude Agent SDK — pra construir agentes autônomos fora do Claude Code

Diferente de CMA (hospedado pela Anthropic), o Agent SDK é pra vocês
hospedarem o agente onde quiserem. Série progressiva de notebooks
(`claude_agent_sdk/00` a `08`):

- `00_The_one_liner_research_agent.ipynb` — agente de pesquisa mínimo com
  WebSearch.
- `01_The_chief_of_staff_agent.ipynb` — subagentes, hooks, output styles,
  plan mode. Base conceitual mais próxima do que vocês já fazem no
  orquestrador multi-modelo, mas fora do contexto do chat.
- `02_The_observability_agent.ipynb` — conecta a sistemas externos via MCP
  (GitHub, CI). Relevante se WIA ou Caos Diário precisarem monitorar
  pipelines automaticamente.
- `08_Dynamic_workflows.ipynb` (2026) — workflow dinâmico com subagentes
  paralelos "verificador" e "cético" fact-checando um relatório contra
  fontes. Padrão direto pra validar conteúdo gerado (ex: pautas do
  Atmosfera antes de virar vídeo).
- `07_Hosting_the_agent.ipynb` — deploy do mesmo agente em 3 níveis de
  maturidade operacional (Docker → Modal → Kubernetes), mesma imagem/
  interface HTTP em todos. Guia útil quando o worker Python local do
  Atmosfera precisar virar serviço hospedado de verdade.

---

## D. Custo — método, não intuição

- `cost_optimization/cost_optimization.ipynb` (ago/2026) — guia
  eval-driven: aplica cada alavanca de custo da API Claude uma de cada vez,
  medindo pass rate e custo por tarefa pra achar o ponto Pareto-ótimo. **Isso
  é o processo formal que sustenta (ou desafia) a divisão Opus/fiscal,
  Sonnet/default, Haiku/mecânico** — vale rodar esse processo pelo menos uma
  vez pra validar com dados reais em vez de assumir.
- `observability/usage_cost_api.ipynb` — Admin API pra puxar uso e custo
  programaticamente. Dá pra montar um dashboard de custo por venture (Kora
  AI, GASTROMUNDI, etc.) em vez de olhar fatura manualmente.

---

## E. Memória e contexto longo

Relevante pro padrão `memory/` de vocês e pra qualquer sessão de agente que
rode por muito tempo (análise de conversa inteira do WhatsApp no WIA, por
exemplo):

- `tool_use/memory_cookbook.ipynb` — memory tool + context editing pra
  agentes com memória persistente entre sessões.
- `tool_use/context_engineering/context_engineering_tools.ipynb` (2026) —
  compara estratégias de engenharia de contexto (memória, compactação,
  limpeza de tools), quando cada uma se aplica e o custo de cada uma.
- `tool_use/automatic-context-compaction.ipynb` — compactação automática de
  histórico em workflows agentic longos.
- `misc/session_memory_compaction.ipynb` — compactação instantânea via
  threading em background + prompt caching.

---

## F. Extração de documento / visão — GASTROMUNDI e Casa Coffee

- `tool_use/vision_with_tools.ipynb` — visão + tools pra extrair dado
  estruturado de imagem (usaram rótulo nutricional como exemplo — mesmo
  princípio pra foto de nota fiscal ou cardápio).
- `multimodal/how_to_transcribe_text.ipynb` — extração de texto não
  estruturado de imagem/PDF.
- `multimodal/reading_charts_graphs_powerpoints.ipynb` — leitura de
  gráficos/apresentações.
- `tool_use/extracting_structured_json.ipynb` — extração de JSON
  estruturado a partir de qualquer input.

Combinação direta pro módulo fiscal NF-e/NFC-e do GASTROMUNDI e pra
compactação/estruturação de fichas técnicas do Casa Coffee.

---

## G. Skills — pra quando o catálogo Kora crescer

- `skills/notebooks/01_skills_introduction.ipynb`,
  `03_skills_custom_development.ipynb` — como o Claude nativamente organiza
  e descobre skills (Excel/PPT/PDF built-in + skills customizadas). Boa
  leitura de fundo pra manter o padrão de skills da Kora consistente com
  como a Anthropic estrutura oficialmente.
- `tool_use/tool_search_with_embeddings.ipynb` — descoberta semântica de
  tools quando o catálogo passa de dezenas pra milhares. Ainda não é o caso
  de vocês, mas vale guardar se o catálogo de skills/MCPs da Kora continuar
  crescendo.

---

## H. Outros pontuais

- `capabilities/text_to_sql/guide.ipynb` — natural language → SQL com
  RAG + chain-of-thought + auto-correção. Aplicável a relatórios ad-hoc do
  GASTROMUNDI ou dashboards do Kora AI.
- `coding/prompting_for_frontend_aesthetics.ipynb` — como promptar pra fugir
  de estética genérica. Complementa (não substitui) a skill
  `frontend-design` de vocês.
- `tool_evaluation/tool_evaluation.ipynb` — roda avaliações paralelas de
  tools de forma independente. Útil pra validar confiabilidade do
  orquestrador multi-modelo antes de considerar uma nova skill "pronta".

---

## O que eu **não** trouxe pra cá

Third-party integrations (Pinecone, MongoDB, LlamaIndex, Wolfram Alpha,
ElevenLabs, Deepgram), fine-tuning no Bedrock, e os notebooks introdutórios
de 2024 (JSON mode, batch processing básico, citations) — nada disso resolve
um problema que vocês têm hoje. Fica de fora pra não inflar a fundação com
referência morta. Se algum desses virar necessidade real (ex: voz pro
Atmosfera, ou RAG dedicado pro Kora AI), volto e cito o notebook específico
na hora.
