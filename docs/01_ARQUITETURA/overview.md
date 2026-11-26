# Arquitetura Geral, GastroMundi

> Estado real do código, revisado na refatoração 6.12 (2026-11-26). A arquitetura com API própria,
> Drizzle e Clerk (ADR-002) continua como roadmap; o que vale hoje é o ADR-004 (Supabase direto) e a
> organização por domínio do ADR-015.

## Objetivo
Descrever a visão macro da arquitetura do GastroMundi: camadas, responsabilidades, fronteiras e
princípios que guiam as decisões técnicas, como o código está hoje.

## Contexto
O GastroMundi é um SaaS multi-estabelecimento white-label (decisão 017) para restaurante e varejo:
PDV, caixa, comandas, cozinha, estoque, delivery, financeiro, nota fiscal e o assistente Jarvas.
É uma SPA em **React + Vite** que fala **direto com o Supabase** (autenticação, banco Postgres com
RLS, Realtime e funções de borda), publicada na **Vercel**. Não há API própria no meio (ADR-004).
Dois programas satélites rodam fora do navegador: a **Ponte KORA** (`ponte/`, pedidos e impressão
pela rede local sem internet) e o **importador de cardápio** (`bot/`).

## Regras Gerais
- **Tela não chama o Supabase.** Toda leitura e gravação passa pela camada `dados/` da feature (ou
  pelos provedores de `src/context/`). O lint cobra.
- **O isolamento entre estabelecimentos é do banco**, por `tenant_id` e RLS. O front nunca decide o
  tenant: ele vem do JWT da sessão.
- **Gravação de várias etapas é uma função do banco**, atômica (combo, importação de nota, exclusão
  de unidade de medida). O navegador não encadeia gravações que podem ficar pela metade.
- **Segredo não vai para o front.** Só `VITE_SUPABASE_URL` e a chave anon, que são públicas. Chaves
  de serviço, certificado fiscal e CSC ficam nas funções de borda e no Vault do Supabase.
- **Nada de marca de um cliente no código.** Nome, cor, logo e regras vêm do tenant (decisão 017).

## Validações
- Input do usuário é validado antes de qualquer gravação, e de novo no banco (constraint, RLS ou
  validação na função).
- Toda tabela nova nasce com RLS, e a função nova do banco com checagem de tenant e `search_path` fixo.

## Permissões
- Mudança de arquitetura de alto nível exige ADR em `docs/08_DECISOES/`.
- Migration em produção é decisão do dono (decisão D6 do ADR-015: aplicada antes do merge da rodada).

## Exceções
- Protótipos podem violar fronteiras temporariamente, marcados com `[POC]` e com prazo.

## Auditoria
- Este documento é atualizado a cada mudança estrutural relevante.
- `scripts/metricas-refatoracao.mjs` mede as fronteiras (chamadas ao Supabase fora de `dados/`,
  estilo inline, cor fixa, emoji, celular importando do computador).

## Eventos
- Os eventos de domínio são do Jarvas (ver "Eventos do Jarvas" abaixo).

## Configurações Futuras
- API própria + Drizzle + Clerk (ADR-002), quando o custo e a escala justificarem.
- TanStack Query para cache de servidor, reavaliado depois da divisão do contexto (ADR-015, D1).

## Casos de Uso
- Onboarding técnico, avaliação de tecnologia, planejamento de escala.

## Critérios de Aceite
- [x] Diagrama de camadas descreve o código real
- [x] Responsabilidades de cada camada estão descritas
- [x] Fronteiras de segurança estão mapeadas
- [x] Stack principal está documentada (ver `tech-stack.md`)

---

## Diagrama de Camadas

```
Navegador (computador, celular do garçom, cardápio público, site da Kora)
   │
   ▼
SPA React + Vite (Vercel)
   │  src/app/rotas/      uma superfície por endereço
   │  src/context/        seis provedores (sessão, offline, configuração, catálogo, comandas, caixa)
   │  src/features/<x>/   telas, ganchos, regras puras e a camada dados/
   │
   │  supabase-js (JWT da sessão)                         HTTP na rede local
   ▼                                                      ▼
Supabase                                              Ponte KORA (PC do caixa)
   • Auth (usuário@<estabelecimento>.local)              • pedidos do Palm sem internet
   • Postgres com RLS por tenant_id                      • impressão na térmica
   • funções do banco (RPC) atômicas
   • Realtime (comandas, cozinha)
   • funções de borda (NFC-e, provisionamento, importação)
```

## Princípios Arquiteturais

1. **Separação por camada dentro de cada domínio.** Tela, gancho de estado, regra pura e acesso a
   dados ficam em pastas próprias da feature.
2. **Segurança por padrão.** RLS em todas as tabelas; menor privilégio; o front é tratado como não
   confiável.
3. **Regra de negócio é função pura com teste.** Dinheiro, conversão, regras do Jarvas e fiscais
   nascem com teste.
4. **Computador e celular compartilham a lógica.** Os dois usam os mesmos ganchos e regras da
   feature; o celular não importa da pasta do computador (o lint cobra).
5. **Estilo vem do tema.** CSS co-localizado com variáveis `--gm-*` que cada estabelecimento
   sobrescreve; sem estilo inline e sem cor fixa no JSX (guardas na suíte).
6. **Custo zero primeiro.** Nada pago sem decisão do dono (`memory/restrictions.md`).
7. **Observabilidade.** Erros vão para o Sentry e para o log de operações, sem dado sensível.

---

## Arquitetura Frontend

```
src/
  main.jsx            ponto de entrada (e o atalho das pautas, em subdomínio próprio)
  app/                coordenação da carga, tela de erro, ganchos da casca
    rotas/            apex.jsx, console.jsx, cardapioPublico.jsx, estabelecimento.jsx, index.js
  routes/             index.jsx (só escolhe a superfície), PrivateRoute, ConsoleRoute
  context/            os seis provedores e os ganchos de leitura (useSessao, useCaixa...)
  features/<dominio>/
    dados/            única camada que fala com o Supabase
    regras/           funções puras com teste
    hooks/            estado da feature, usado pelo computador e pelo celular
    desktop/          telas do computador, cada uma com seu .css
  pages/              casca das páginas (computador, celular, cardápio público, site da Kora, console)
  components/         casca do computador (barra lateral, avisos de assinatura) e componentes comuns
  lib/                utilidade técnica e de plataforma, sem regra de domínio
  styles/             tema (--gm-*), campos, ícones
```

**Domínios em `src/features/`:** admin, apex (site da Kora), assinatura, auditoria, caixa, cardápio,
clientes, comandas, configurações, console, cozinha, delivery, estoque, financeiro, fiscal (NFC-e),
importação, impressão, jarvas, mesas, pautas, pdv, ponte, relatórios, sessão e tenant (dados do
estabelecimento, plano, add-ons e identidade).

**O que fica em `src/lib/`:** o cliente do Supabase e o prazo de rede, a aplicação do tema e o cache
da marca na tela (`tema.js`, `brandingCache.js`), a fila offline, a observabilidade, a assinatura de
mudanças ao vivo (`lib/dados/tempoReal.js`), os guardas de SQL e de texto, e funções
pequenas usadas por vários domínios (telefone, documento, busca, períodos). É o papel que o ADR-015
dá a `shared/lib/`; a pasta mantém o nome atual.

**Superfícies** (`src/app/rotas/`): o site da Kora no domínio nu, o Console da plataforma (no host
dedicado ou em `/console`), o cardápio público em `/cardapio` e o estabelecimento (login, `/palm` e
`/app`). O `routes/index.jsx` só lê o endereço e escolhe.

---

## Eventos do Jarvas

O Jarvas é a IA transversal (spec em `docs/03_REGRAS_DE_NEGOCIO/JARVAS.md`). Os domínios publicam
eventos de fato consumado (`venda.finalizada`, `estoque.baixa`, `pedido.cancelado` e afins) em `jarvas_eventos`, pela
função `emitirEvento` de `src/features/jarvas/dados/jarvas.js`, de forma fire-and-forget. O motor de
regras (`jarvasEngine.js`) transforma eventos e leituras em insight, alerta ou sugestão. O Jarvas
nunca executa ação sem confirmação humana.

---

## Estado global (Context API)

Sem Redux (decisão 003). Seis provedores em `src/context/`, cada um dono de um assunto e com valor
memorizado, montados de fora para dentro: **sessão** (usuário, papel, tenant), **offline** (fila de
operações sem internet), **configuração**, **catálogo** (produtos e categorias), **comandas** e
**caixa**. No centro, `src/app/CoordenacaoDaCarga.jsx` faz a carga, o dreno da fila offline e a
análise do Jarvas. As telas leem pelos ganchos (`useSessao`, `useCaixa`...).

---

## Planos e módulos (no lugar de feature flags)

O que cada estabelecimento vê depende do **plano** dele (F013): cada plano libera módulos
(`planos_modulos`), e add-ons pagos (nota fiscal, TEF) são ligados por estabelecimento no Console.
O `PrivateRoute` recebe o módulo exigido pela tela e mostra o convite de upgrade quando o plano não
tem o módulo. A liberação real está no banco.

---

## Arquitetura Multi-tenant

**Estratégia (decisão 002):** banco e schema compartilhados, coluna `tenant_id` e isolamento por
**RLS** no Postgres.

| Estratégia | Isolamento | Custo | Decisão |
|-----------|-----------|-------|---------|
| Banco por tenant | Máximo | Alto | Rejeitada |
| Schema por tenant | Alto | Médio | Rejeitada |
| **`tenant_id` + RLS** | Alto (por política) | Baixo | **Adotada** |

**Garantias:**
- Toda tabela com dado de estabelecimento tem `tenant_id` e políticas RLS pelo tenant do JWT.
- O usuário é `usuario@<endereco>.local` (ADR-009): o mesmo nome de usuário pode existir em dois
  estabelecimentos sem conflito.
- O subdomínio escolhe a marca da tela de login; ele não dá acesso a nada.
- Vazamento de dado entre estabelecimentos é incidente crítico (`memory/restrictions.md`).
