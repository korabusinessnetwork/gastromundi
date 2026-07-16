# Apex institucional (kora.codes)

## O que é

A raiz do domínio da plataforma (`kora.codes` e `www.kora.codes`) passa a mostrar uma página institucional —
vitrine comercial do produto — em vez de cair direto no login do GastroMundi.

Subdomínios de tenant (ex: `casacoffeecolab.kora.codes`, `gastromundi.kora.codes`) **continuam indo direto
ao login do estabelecimento**, sem mudança.

## Como funciona

### Detecção

Função `ehApexInstitucional(hostname)` em `src/lib/apex.js`:

- Retorna `true` apenas quando **ambas** as condições forem verdadeiras:
  1. `VITE_ROOT_DOMAIN` está configurado
  2. Host é exatamente o apex (`kora.codes`) ou www (`www.kora.codes`)
- Sem `VITE_ROOT_DOMAIN` (dev, preview Vercel, IP) → `false`, comportamento antigo intacto (inerte por design)
- Preview local: rode com `VITE_APEX_PREVIEW=1`

### Roteamento

- `/` **no apex** renderiza a página institucional; **nos demais hosts** redireciona para `/login` como sempre
- `/login` continua funcionando no apex (fallback GastroMundi) — clientes antigos com bookmark não quebram,
  só ganham um clique ("Entrar")

## Página

**Arquivo**: `src/pages/apex/ApexPage.jsx` — casco que compõe uma seção por componente
(um arquivo JSX + um CSS co-localizado por seção, decisões 018/023). Implementa o handoff
de design hi-fi `design_handoff_site_kora` (funil: atenção → confiança/prova → oferta → demo).

| Seção | Arquivo | Conteúdo |
|-------|---------|----------|
| Nav | `ApexNav.jsx` | Sticky; âncoras das seções + "Entrar" (`/login`) + CTA demo |
| Hero | `ApexHero.jsx` | Fundo escuro, promessa, mock real do PDV (tokens `--gm-*` de propósito) |
| Prova | `ApexProva.jsx` | Barra com 5 provas rápidas (mesmo dia, 1 turno, NFC-e, offline, personalizado) |
| Inimigo | `ApexInimigo.jsx` | "PDV genérico" vs KORA — 4 comparações |
| Funcionalidades | `ApexFuncionalidades.jsx` | 8 cards + banner escuro "do nosso jeito? não — do SEU" |
| Como funciona | `ApexComoFunciona.jsx` | 3 passos até a primeira venda |
| Planos | `ApexPlanos.jsx` | 5 planos (decisão 029); add-ons NF-e/TEF em faixa separada (ADR-005) |
| FAQ | `ApexFaq.jsx` | 4 objeções de compra |
| Demo | `ApexDemo.jsx` | Fechamento escuro; CTA verde de demo (ou "Entrar" sem `VITE_CONTATO_URL`) |
| Rodapé | `ApexRodape.jsx` | Monograma + copyright dinâmico |

- Estática — nenhum fetch de dados no carregamento; sem Supabase, sem estado
- Identidade própria da plataforma: tokens `--kora-*` (tema CLARO oficial do site, handoff
  `kora-tokens.css`), fontes Sora (títulos/CTAs) e Space Grotesk (corpo), escopados em `.apex`
  para não vazarem pro app dos tenants; monograma oficial em `KoraMonograma.jsx` (SVG inline)
- Utilitários compartilhados (botões, kickers, container) em `ApexPage.css`
- Nenhum dado específico de estabelecimento hardcodado
- Link de contato comercial é opcional: se `VITE_CONTATO_URL` vazio, CTAs de demo apontam
  pra âncora `#demo` e o fechamento vira "Entrar" (login)
- Preços exibidos são os da decisão 029 (`memory/decisions.md`) — ao mudar preço, mudar lá e aqui

### Responsivo (handoff "Site KORA Responsivo", artboards 834px e 390px)

Breakpoints padronizados do site: **desktop ≥1024px**, **tablet `max-width: 1023px`**,
**mobile `max-width: 767px`** (cada seção declara os seus no próprio CSS).

- **Tablet**: paddings 32–40px; nav completa compacta (uma linha, sem quebra); hero H1 40px
  com mock 700px; prova em 2×2 (4 itens); inimigo com intro em cima e comparativos empilhados
  dentro de cada card; funcionalidades em 2 colunas horizontais (número à esquerda); planos em
  2 colunas com o Piloto como card largo; CTA final H2 26px.
- **Mobile**: paddings 20px, títulos 22px, kickers 11px; nav vira **logo + hambúrguer**
  (44×44px, `aria-expanded`, drawer que fecha no link/backdrop); hero com badge curto e CTAs
  full-width empilhados, mock em coluna única; prova só com os 3 itens essenciais; planos
  **empilhados com Casa Cheia primeiro e completo**, demais compactos (nome + resumo + preço)
  que expandem ao toque (botão ≥44px, chevron, `aria-expanded`); FAQ 1 coluna; CTA final
  full-width.
- Intuitividade: no celular o dono compara planos — por isso o recomendado vem primeiro e
  aberto, e os demais mostram preço sem toque nenhum; expandir é opt-in com affordance óbvia.

## Variáveis de Ambiente

| Variável | Tipo | Descrição | Exemplo |
|----------|------|-----------|---------|
| `VITE_ROOT_DOMAIN` | string | Domínio raiz da plataforma; liga a detecção | `kora.codes` |
| `VITE_APEX_PREVIEW` | flag | Força a página institucional em dev local (preview sem domínio) | `VITE_APEX_PREVIEW=1` |
| `VITE_CONTATO_URL` | string | URL de contato (WhatsApp, mailto, etc); opcional | `https://wa.me/5500999999999` |

## O que NÃO muda

- Autenticação: Supabase Auth continua igual
- RLS: isolamento por tenant intacto
- Resolução de tenant por subdomínio: busca no hostname como antes
- Console da plataforma (admin, dashboards, etc): sem impacto

## Por que é intuitivo (princípio nº 1)

- **Visitante vê vitrine**: chega em `kora.codes` e conhece o produto antes de logar — conota profissionalismo
- **Cliente vê seu login direto**: `casacoffeecolab.kora.codes` vai direto ao login — nenhuma confusão
- **Um clique separa os dois**: botão "Entrar" no apex leva ao login GastroMundi — transição clara, sem detour
