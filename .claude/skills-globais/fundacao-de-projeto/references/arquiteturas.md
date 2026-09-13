# Modelos de Arquitetura — como escolher

Esta skill **não impõe uma stack**. Ela dá uma árvore de decisão e um conjunto
de regras transversais que valem em qualquer modelo. Escolha o modelo pelo
momento do produto e **registre a escolha em ADR-001** — nunca por hábito.

## Árvore de decisão

```
O produto tem UI e precisa subir rápido, barato, com pouca equipe?
├─ SIM ─► Modelo A: SPA + BaaS (Supabase direto)         ◄── default recomendado
│         Bom até escala média. Menos camadas, mais velocidade.
│
└─ Precisa de lógica de servidor pesada, múltiplos consumidores
   da API, equipe/escala grandes, ou contrato de API público?
   ├─ SIM ─► Modelo B: Frontend + API própria contract-first
   │         (Node + Drizzle/Prisma + Postgres). Mais camadas, mais controle.
   │
   └─ É um serviço/worker/CLI/lib sem UI?
      └─► Modelo C: Backend/serviço isolado (sem design system;
          foco em contrato, testes e observabilidade).
```

## Modelo A — SPA + BaaS (default)

**Stack:** React + Vite → Supabase (SDK direto, Auth, RLS, realtime) + React
Router v6 + Vercel. **É o modelo do Kora.**

- **Quando:** MVP, produto novo, equipe pequena, orçamento bootstrap.
- **Força:** rápido de subir, barato (tiers gratuitos), realtime de graça,
  multi-tenant por RLS sem escrever backend.
- **Trade-off:** lógica de negócio mora no front + RLS; acoplamento ao BaaS.
  Lógica sensível (dinheiro, fiscal, permissão) vai para **Edge Functions**.
- **Regra:** isolar todo acesso ao Supabase numa **camada de serviços**
  (`src/lib/` ou `src/services/`), nunca chamar o SDK direto do componente —
  isso permite trocar de provedor depois sem reescrever a UI.

## Modelo B — API própria contract-first (alvo de escala)

**Stack:** Frontend → API (Node/Express ou similar) → Drizzle/Prisma → Postgres.

- **Quando:** escala/equipe justificam desacoplar do BaaS; contrato de API
  público; múltiplos clientes (web + mobile + integrações).
- **Força:** controle total, testabilidade, contrato explícito, menos lock-in.
- **Trade-off:** mais camadas, mais infra, mais custo e tempo de setup.
- **Migração A→B:** viável e barata **se** a camada de serviços foi isolada
  desde o início (por isso ela é obrigatória no Modelo A). Registre a migração
  como ADR que supersede parcialmente o ADR-001.

## Modelo C — Serviço/worker/CLI/lib (sem UI)

- Sem design system; pule as pastas `02_DESIGN_SYSTEM` e `06_COMPONENTES`.
- Foco em contrato (`07_APIS`), testes, e observabilidade.
- Mantém memory/ + docs/ + ADRs + segurança normalmente.

## Regras transversais (valem em TODOS os modelos)

1. **Camada de serviços obrigatória** — acesso a backend nunca espalhado nos
   componentes; sempre atrás de uma fronteira que dá para trocar.
2. **Envelope de resposta consistente** — `{ data, error, meta }`; toda resposta
   validada por schema (Zod) antes de chegar à UI; dado fora do contrato é
   rejeitado explicitamente.
3. **Erros com código estável** (string) + mensagem legível; falha nunca
   silenciada; erro inesperado sobe para uma fronteira de erro global.
4. **Eventos de domínio em `dot.case`** no passado/substantivo
   (`venda.criada`, `caixa.fechado`) — a espinha para IA orientada a eventos.
5. **Multi-tenant por padrão** — `tenant_id` em toda tabela; isolamento por RLS;
   nada de cliente hardcodado (ver `multi-tenant-white-label.md`).
6. **Segurança como definition-of-done** — ver `seguranca.md`.
7. **Estado:** servidor via camada de data-fetching com cache (nunca duplicado
   em estado global manual); UI global via Context; local no componente. Elevar
   estado só com >1 consumidor real.
8. **CSS separado do JSX** — estilo desacoplado da marcação (CSS Modules / .css
   co-localizado + Tailwind), para theming/white-label por tenant.
9. **Organização por feature/módulo**, não por tipo técnico; compartilhado em
   `shared/`.

## Camada de IA transversal (opcional, padrão "Jarvas")

Se o produto terá uma IA que observa o negócio: modele-a **orientada a eventos**
(consome os eventos `dot.case`), que **gera insight/alerta/sugestão mas nunca
executa ação sem confirmação humana**, e **não inventa números** — fundamenta
tudo nos dados reais ou marca como incerto. Especifique em
`docs/03_REGRAS_DE_NEGOCIO/` e registre a decisão em ADR.

## Saída desta etapa

- ADR-001 com a stack e o modelo escolhido (+ alternativas consideradas).
- `docs/01_ARQUITETURA/overview.md` + `tech-stack.md` preenchidos.
- Camada de serviços esboçada em `src/`.
- Se multi-tenant: estratégia em ADR-002 + `docs/04_MODELAGEM`.
