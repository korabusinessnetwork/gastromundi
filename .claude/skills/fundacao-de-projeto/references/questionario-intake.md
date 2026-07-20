# Questionário de Intake — a entrevista antes de criar o app

Antes de gerar **qualquer** arquivo, conduza esta entrevista com o usuário. O
objetivo é extrair as infos necessárias para preencher a fundação com conteúdo
real (não placeholder). Use a tool `AskUserQuestion`, agrupando 2-4 perguntas
por chamada, na ordem dos blocos abaixo. Sempre ofereça uma opção recomendada.

## Regras de condução

1. **Bloqueante:** não rode `scaffold.sh` nem crie arquivos sem as respostas
   dos blocos 1-5 (Produto, Público, Multi-tenant, Stack, Segurança). Design e
   Custo podem ser inferidos com defaults e confirmados depois.
2. **Um bloco por vez**, mas agrupe perguntas relacionadas numa só chamada de
   `AskUserQuestion` (a UI aceita até 4 perguntas juntas).
3. **Grave as respostas** em `respostas-intake.md` (a partir de
   `assets/templates/respostas-intake.template.md`) assim que obtê-las — é a
   fonte de verdade que o `scaffold.sh` consome para substituir os `{{...}}`.
4. **Não pergunte o que dá pra inferir.** Se o usuário já disse o produto numa
   conversa anterior, confirme em vez de perguntar do zero.
5. Se o usuário responder "não sei" num ponto crítico, ofereça o default
   recomendado e siga — registre como "assumido, revisar".

## Mapa resposta → arquivo (por que cada pergunta importa)

| Resposta | Preenche | Placeholder |
|----------|----------|-------------|
| Nome/essência do produto | `memory/identity.md`, `CLAUDE.md`, `README.md` | `{{PRODUTO}}`, `{{ESSENCIA}}` |
| Problema / proposta de valor | `memory/identity.md`, `docs/00_VISAO` | `{{PROBLEMA}}`, `{{PROPOSTA}}` |
| Público-alvo / personas | `memory/identity.md` | `{{PUBLICO_ALVO}}`, `{{PERSONAS}}` |
| Multi-tenant? white-label? | `memory/identity.md`, `docs/04_MODELAGEM`, ADR-002 | `{{MULTI_TENANT}}` |
| Stack escolhida | `CLAUDE.md`, `docs/01_ARQUITETURA`, ADR-001 | `{{STACK}}`, `{{DEPLOY}}` |
| Precisa de UI? | ativa/desativa seções de design system e princípio nº1 | `{{TEM_UI}}` |
| Requisitos de segurança/compliance | `docs/11_SEGURANCA`, `memory/restrictions.md` | `{{COMPLIANCE}}` |
| Restrições de custo | `memory/restrictions.md`, `CLAUDE.md` | `{{FASE_CUSTO}}` |
| Fase/roadmap inicial | `memory/identity.md` (Roadmap), `docs/09_BACKLOG` | `{{FASE_ATUAL}}` |

---

## Bloco 1 — Produto e identidade (bloqueante)

1. **Qual o produto e sua essência em uma frase?** (nome + o que é)
2. **Que problema ele resolve, e para quem, hoje?**
3. **Qual a proposta de valor / diferencial** frente às alternativas atuais?
4. **Já existe código/produto** ou é do zero? (traz para o padrão × nasce novo)

## Bloco 2 — Público e escopo (bloqueante)

Opções sugeridas para `AskUserQuestion`:
1. **Público-alvo primário** — segmento + perfil de usuário (ex.: donos de
   pequenos restaurantes; devs; times de RH). Peça 1-3 personas curtas.
2. **É B2B, B2C ou B2B2C?**
3. **Qual o "aha moment"** que o usuário precisa sentir cedo? (guia o MVP)

## Bloco 3 — Multi-tenant e white-label (bloqueante)

1. **É SaaS multi-estabelecimento/multi-cliente?**
   - Sim, multi-tenant desde já (recomendado para SaaS)
   - Single-tenant agora, multi-tenant no roadmap (modelar como multi mesmo assim)
   - Ferramenta interna / single-tenant definitivo
2. **Precisa de white-label** (marca/tema/config por cliente)?
   - Sim — nada hardcodado, tudo vem do tenant (recomendado p/ SaaS)
   - Não — marca única
3. **Terá planos** (free/pro/enterprise) e feature flags por tenant?

> Se multi-tenant ou white-label = sim, aplique `references/multi-tenant-white-label.md`
> e registre a estratégia em ADR-002.

## Bloco 4 — Stack e arquitetura (bloqueante)

1. **Qual stack?**
   - **Default recomendado:** React + Vite + Supabase (Auth/RLS/realtime) +
     React Router + Vercel — barato, rápido de subir, multi-tenant por RLS.
   - API própria contract-first (Node/Drizzle/Postgres) — para escala/equipe maior.
   - Outra (especificar) — mobile, backend-heavy, etc.
2. **Tem interface de usuário?** (define design system + princípio nº1)
3. **Onde faz deploy?** (Vercel / outro) e **onde ficam os dados?**

> Registre a escolha em **ADR-001** e detalhe em `docs/01_ARQUITETURA`. Use a
> árvore de decisão de `references/arquiteturas.md`.

## Bloco 5 — Segurança e compliance (bloqueante)

1. **Trata dado pessoal / financeiro / de menores?** (define LGPD/GDPR e
   controles em `docs/11_SEGURANCA`)
2. **Requisitos de compliance específicos?** (fiscal, PCI, setor regulado)
3. **Nível de isolamento exigido entre clientes?** (reforça RLS/testes de tenant)

> Alimenta `docs/11_SEGURANCA/README.md` e as Restrições Legais em
> `memory/restrictions.md`. Aplique `references/seguranca.md`.

## Bloco 6 — Custo (default: bootstrap gratuito)

1. **Fase do projeto:** bootstrap/pré-receita (tudo gratuito por padrão) ×
   com orçamento (pode investir em serviços pagos).
2. **Há algum serviço pago já aprovado?** (senão, tudo pago é adiado por padrão)

## Bloco 7 — Design (só se tem UI)

1. **Tem identidade visual / marca definida?** (cores, tipografia, logo)
2. **Referências visuais** ou tom (minimalista, denso, lúdico)?
3. **Contexto de uso crítico** (ex.: toque/PDV, mobile, desktop) — impacta
   tamanho de alvo e legibilidade.

---

## Ao terminar o intake

1. Consolide tudo em `respostas-intake.md`.
2. Confirme com o usuário um **resumo de 5 linhas** do que entendeu antes de
   gerar os arquivos (evita retrabalho).
3. Só então rode a **Fase 2 — Fundação** (scaffold + preenchimento).
