# Blueprint — a árvore completa, comentada

A estrutura-alvo de um projeto novo. Nem toda pasta é obrigatória (um serviço
sem UI pula design system); mas as camadas de governança (`memory/`, `docs/`,
ADRs, segurança) valem para **qualquer** produto.

```
{{PROJETO}}/
├── CLAUDE.md                    # Constituição: princípio nº1, fonte de verdade,
│                                #   processo, custo, segurança, padrões, stack
├── README.md                    # Como rodar; visão de 30s do produto
├── INSTALACAO.md                # Setup do ambiente local
│
├── memory/                      # ── CAMADA 2: GOVERNANÇA ──────────────────
│   ├── identity.md              #   O que o produto É (visão, público, valores,
│   │                            #     posicionamento, tom, personas, roadmap)
│   ├── decisions.md             #   Índice de ADRs
│   ├── patterns.md              #   Padrões consolidados ("como fazemos aqui")
│   ├── learnings.md             #   Memória viva (erros, insights)
│   ├── restrictions.md          #   Restrições permanentes (técnica/legal/custo/
│   │                            #     produto/ética) — prioridade máxima
│   └── bugs.md                  #   Bugs conhecidos e status
│
├── docs/                        # ── CAMADA 3: DOCUMENTAÇÃO (document-first) ─
│   ├── 00_VISAO/                #   Visão de produto, problema, north star
│   ├── 01_ARQUITETURA/          #   overview, tech-stack, infra
│   ├── 02_DESIGN_SYSTEM/        #   tokens, cores, tipografia, componentes (só UI)
│   ├── 03_REGRAS_DE_NEGOCIO/    #   Regra por módulo (antes de codar a feature)
│   ├── 04_MODELAGEM/            #   entities, relationships, schema (multi-tenant)
│   ├── 05_FLUXOS/               #   auth, onboarding, billing, ativar-tenant
│   ├── 06_COMPONENTES/          #   atomic design: atoms→templates (só UI)
│   ├── 07_APIS/                 #   endpoints, auth, error-handling (contrato)
│   ├── 08_DECISOES/             #   ADRs (adr-000-template.md + adr-NNN.md)
│   ├── 09_BACKLOG/              #   features, bugs, mvp, runbooks, handoffs
│   ├── 10_PROMPTS/              #   biblioteca de prompts para agentes de IA
│   └── 11_SEGURANCA/            #   Plano de segurança versionado (NOVO)
│
├── {{BACKEND_DIR}}/             # ── CAMADA 4: DADOS (ex.: supabase/) ────────
│   ├── schema.sql               #   Fonte de verdade do banco
│   ├── migrations/              #   Migrations versionadas
│   ├── functions/               #   Edge Functions (lógica sensível)
│   └── seeds/                   #   Seeds por tenant
│
├── src/                         # ── CAMADA 5: CÓDIGO (por feature) ──────────
│   ├── components/              #   UI por feature + shared/
│   ├── pages/ (ou routes/)      #   Telas / rotas
│   ├── context/                 #   Estado global de UI (sessão, tenant, tema)
│   ├── hooks/                   #   Hooks reutilizáveis
│   ├── lib/ (ou services/)      #   CAMADA DE SERVIÇOS — isola o backend
│   ├── constants/               #   Constantes de domínio
│   ├── styles/                  #   CSS separado do JSX
│   └── utils/                   #   Funções puras (com teste)
│
├── .claude/                     # Skills e settings do projeto
├── scripts/                     # Automação (validate-build, etc.)
└── (config)                     # package.json, vite.config, .gitignore, .env.example
```

## O "porquê" de cada camada

- **Numeração de `docs/` (00→11):** dá ordem de leitura e onboarding — do "por
  que existimos" (00) até "como nos protegemos" (11). Evita a bagunça de pastas
  por tipo técnico.
- **`memory/` separada de `docs/`:** `docs/` descreve o sistema; `memory/`
  governa as decisões sobre ele. Consultar `memory/` é obrigatório antes de
  decidir produto/arquitetura.
- **Camada de serviços (`src/lib`):** o único ponto que fala com o backend.
  Trocar de provedor no futuro (Modelo A→B) mexe só aqui, não na UI.
- **`08_DECISOES` (ADRs):** decisão sem ADR é decisão perdida. Todo trade-off
  relevante fica registrado, com alternativas e consequências.
- **`11_SEGURANCA`:** segurança versionada e revisável, não folclore oral.

## O que pular por tipo de produto

| Produto | Pula |
|---------|------|
| Serviço / worker / CLI / lib (sem UI) | `02_DESIGN_SYSTEM`, `06_COMPONENTES`, `src/pages` |
| Single-tenant definitivo | modelagem multi-tenant (mas documente a decisão em ADR) |
| Sem IA | `10_PROMPTS` e a camada de IA transversal |

Nada além disso se pula: governança, ADRs e segurança são universais.
