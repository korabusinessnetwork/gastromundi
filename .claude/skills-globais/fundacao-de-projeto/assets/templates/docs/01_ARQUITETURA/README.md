# 01 — ARQUITETURA · {{PRODUTO}}

> Visão técnica da plataforma: stack, componentes, infra e decisões de design.

## O que vive aqui

- **Tech stack**: linguagens, frameworks, banco de dados, hosting
- **Diagramas arquiteturais**: componentes, fluxo de dados, deployments
- **Infraestrutura**: ambientes (dev/staging/prod), CI/CD, monitoramento
- **Padrões técnicos**: convenções de código, estrutura de pastas, integração
- **Performance & escalabilidade**: bottlenecks conhecidos, roadmap de otimização
- **Decisões arquiteturais grandes**: por quê {{STACK}}, por quê não alternativa X

## O que NÃO vive aqui

- Decisões formalizadas → `08_DECISOES/` (ADRs)
- Código em si → `src/`, `lib/` etc.
- Regras de negócio → `03_REGRAS_DE_NEGOCIO/`
- Componentes UI → `06_COMPONENTES/`

## Arquivos sugeridos

- `overview.md` — 1 página: stack, deployment, arquitetura em alto nível
- `tech-stack.md` — justificativa de cada tecnologia principal
- `infra.md` — ambientes, CI/CD, logging, monitoring
- `diagramas/` — C4, ER, fluxos de dados (Mermaid/Excalidraw)
- `padroes.md` — convenções, estrutura de pastas, naming

## Como preencher

1. **Comece por `overview.md`**: uma figura vale 1000 palavras (diagrama C4 Nível 1)
2. **Tech stack**: lista + uma linha de "por quê" para cada escolha principal
3. **Mantenha sincronizado**: quando refatorar arquitetura, update aqui + crie ADR em `08_DECISOES/`
4. **Diagramas**: prefira Mermaid (versionável) a Figma (muda a cada semana)

## Ligações

- `08_DECISOES/` — ADRs que justificam escolhas maiores (ex: "Por que Supabase?")
- `memory/tech-choices.md` — restrições técnicas do projeto
- `04_MODELAGEM/` — schema de dados que você vai descrever em diagrama ER
