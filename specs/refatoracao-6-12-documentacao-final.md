# Refatoração 6.12: documentação final da fase 6 e ADR-015 implementado

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T23.

## A mudança

O plano pede: `docs/01_ARQUITETURA/` descrevendo o estado real, a seção de organização por domínio no
CLAUDE.md, os padrões novos em `memory/patterns.md` e o ADR-015 aceito.

- **`docs/01_ARQUITETURA/overview.md`** reescrito. Antes descrevia o modelo-alvo (API Express,
  Drizzle, Clerk, wouter, TanStack Query), que não existe no código. Agora: SPA React + Vite falando
  direto com o Supabase (ADR-004), o diagrama real com a Ponte, as regras de fronteira (tela não
  chama o Supabase, gravação de várias etapas é função do banco, segredo fora do front), a árvore de
  `src/` com os 24 domínios, as superfícies de `src/app/rotas/`, os eventos do Jarvas com os nomes
  reais, os seis provedores, os planos e módulos no lugar de "feature flags", e o multi-tenant por
  RLS com o usuário `usuario@<estabelecimento>.local`.
- **`docs/01_ARQUITETURA/tech-stack.md`**: as versões reais do `package.json` (React 18.3, Vite 8,
  React Router 7, Vitest 4, ESLint 9) e as bibliotecas que estão em uso; sem Tailwind (ADR-007).
- **`docs/01_ARQUITETURA/infra.md`**: ambientes e deploy reais. Não há staging; o push na `main`
  publica produção na Vercel; migration vai antes do merge da rodada (ADR-015, D6); o push leva a
  nota de atualização.
- **CLAUDE.md**: o aviso "refatoração em andamento" vira a seção "Organização por domínio", com as
  camadas da feature, as rotas por superfície, o papel de `src/lib/` e o cuidado ao mudar arquivo de
  lugar.
- **`memory/patterns.md`**: três padrões novos, organização por domínio e mudança de lugar, rotas por
  superfície, notas de atualização a cada push.
- **ADR-015**: status "Aceito e implementado", com a seção "Como ficou" das fases 5 e 6 e a prova
  visual atualizada (209 telas e a prova de tema).
- Os travessões que sobravam nos três arquivos de arquitetura saíram.

## O "pronto quando" da fase 6

`src/components/desktop/views/` não existe mais (6.9g) e `src/lib/` não tem regra de domínio (6.9h).
A documentação descreve o código como ele está. A fase 6 fecha; a próxima é a fase F, a auditoria.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | A arquitetura descreve o código real | leitura conferida contra `package.json`, `src/` e os nomes de evento do Jarvas |
| 2 | CLAUDE.md tem a organização por domínio | seção nova |
| 3 | ADR-015 aceito e implementado | status do ADR |
| 4 | Sem travessão no texto novo | busca |

## Revisão

- Spec: 4 de 4 em sim. Os nomes citados foram conferidos no código (eventos `venda.finalizada`,
  `estoque.baixa`, `pedido.cancelado`; os seis provedores; as variáveis `VITE_ROOT_DOMAIN` e
  `VITE_CONSOLE_SUBDOMAIN`).
- Qualidade: nenhum crítico ou importante.
