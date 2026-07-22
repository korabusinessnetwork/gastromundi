# Análise de Ferramentas Open-Source — Backlog Futuro — KORA

## Objetivo
Registrar a análise de viabilidade de 3 ferramentas open-source avaliadas para o
ecossistema KORA (Crawl4AI, Browser Use, Stirling PDF), para **uso futuro**. Nada
foi implementado — este é um documento de decisão guardado a pedido do dono
("salve essas ferramentas aí de cima pra usarmos no futuro").

## Contexto e regra que rege a decisão
Estamos em fase de **bootstrap / pré-receita**. Vale a regra de custo do `CLAUDE.md`:
**usar sempre meios gratuitos; toda implementação que exija investimento é adiada por
padrão**, salvo decisão explícita do dono. A stack real hoje é **serverless grátis**
(Vercel + Supabase + Edge Functions Deno). O ponto decisivo da análise abaixo:
**nenhuma das 3 ferramentas roda nessa stack serverless** — todas precisam de um
**host persistente** (VM/container que fica de pé), o que hoje é custo novo.

Decisão do dono (2026-07-22): **continuar no grátis.** As 3 ficam guardadas aqui
como roadmap; reavaliar quando houver receita/2º tenant ou necessidade concreta.

---

## 1. Crawl4AI
- **O que é:** crawler/scraper web em Python que devolve o conteúdo de páginas já
  em **Markdown pronto para LLM**. Licença **MIT**. Gratuito (código aberto).
- **Como roda:** self-host — Python + Playwright (Chromium headless), ou via Docker.
- **Setup estimado:** ~3–5 h para um POC local (instalar, subir Playwright, extrair
  1 site de fornecedor e mapear o resultado no nosso formato de produto).
- **Custo real:** o software é grátis; o **host não é** — precisa de máquina persistente
  com Chromium (não cabe em Edge Function/Vercel serverless). Local/dev = grátis.
- **Ponto de integração no KORA:** alimentaria o **Importador Inteligente**
  (`src/lib/importacao/`) como uma nova fonte — cardápio/catálogo publicado em site do
  fornecedor → Markdown → mesmo pipeline testado `montarCSVProdutos → validarPlanilhaProdutos`.
- **Risco/dependência nova:** runtime Python + Playwright fora da nossa stack JS;
  fragilidade típica de scraper (muda o site, quebra a extração); precisa de host.
- **Recomendação:** **prototipar depois** (local/off-product, grátis). É a mais
  interessante das três para o nosso caso (importação), mas só quando houver host e
  demanda real. Não integrar agora.

## 2. Browser Use
- **O que é:** agente de navegador dirigido por LLM em Python (o LLM "opera" o browser
  para cumprir uma tarefa). Licença **MIT** (código grátis).
- **Como roda:** self-host Python + browser, **e cada execução consome LLM** (custo por
  run — tokens do modelo que dirige o agente).
- **Setup estimado:** ~4–6 h para um POC.
- **Custo real:** software grátis, mas **custo de LLM por execução** + host persistente.
  Some dois custos que a regra de bootstrap manda adiar.
- **Ponto de integração no KORA:** nenhum ponto natural hoje. Poderia automatizar
  tarefas em portais externos (ex.: consultar/preencher algo num site sem API), mas não
  há necessidade concreta no produto atual.
- **Risco/dependência nova:** custo de LLM recorrente e imprevisível; não-determinismo
  (agente de IA operando UI externa); host; superfície de segurança maior.
- **Recomendação:** **não vale a pena agora.** Sem caso de uso claro e com custo de LLM
  por run. Reavaliar só se surgir automação externa sem API que justifique.

## 3. Stirling PDF
- **O que é:** caixa de ferramentas de PDF (juntar, dividir, OCR, converter, etc.) com
  **API REST**. OCR via Tesseract. Java / Spring Boot.
- **Como roda:** **Docker persistente** (Java Spring Boot) — não é serverless.
- **Setup estimado:** ~2–4 h para subir o container e chamar a API de OCR.
- **Custo real:** software grátis, mas exige **host Docker sempre de pé** (~US$5–7/mês
  num VPS pequeno). É custo recorrente → adiado por padrão.
- **Ponto de integração no KORA:** poderia substituir/reforçar o OCR do Importador
  Inteligente (hoje `src/lib/importacao/ocrTesseract.js`, Tesseract.js no navegador).
  Mas o OCR local já existe e é grátis; e para casos difíceis já temos a leitura por IA
  (Edge Function `ler-cardapio-ia`).
- **Risco/dependência nova:** stack Java fora da nossa; host pago 24/7; mais um serviço
  para operar/monitorar.
- **Recomendação:** **não vale a pena agora.** Redundante com o que já temos de graça
  (Tesseract no front + IA de visão no servidor). Reconsiderar só se o OCR local se
  mostrar insuficiente E houver orçamento para o host.

---

## Resumo priorizado
| Ferramenta   | Custo real          | Onde entraria           | Veredito agora        |
|--------------|---------------------|-------------------------|-----------------------|
| Crawl4AI     | Host persistente    | Importador Inteligente  | **Prototipar depois** |
| Browser Use  | Host + LLM por run  | (sem caso de uso)       | Não vale a pena agora |
| Stirling PDF | Host Docker ~US$5–7 | OCR (já coberto grátis) | Não vale a pena agora |

**Restrição que unifica as três:** exigem host persistente, o que a stack serverless
grátis (Vercel/Supabase/Deno) não oferece. Enquanto estivermos no grátis, ficam no
backlog. Quando reavaliar, começar por **Crawl4AI** (maior aderência ao Importador).

## Referência cruzada
- Regra de custo: `CLAUDE.md` → "Custo — priorizar o gratuito" e `memory/restrictions.md`.
- Importador Inteligente: `src/lib/importacao/` (pdfExtrator, ocrTesseract, iaCardapio, pdfCardapio).
- Edge Function de IA: `supabase/functions/ler-cardapio-ia/`.
