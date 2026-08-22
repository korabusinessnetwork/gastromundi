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
| Hero | `ApexHero.jsx` | Fundo escuro, badge único, H1 curto, CTA primário que **abre o formulário**; abaixo, ilustração da tela de comanda (tokens `--gm-*` de propósito) rotulada como ilustração, com link pro protótipo |
| Prova | `ApexProva.jsx` | Barra com 5 fatos **verificáveis** (protótipo aberto, sem fidelidade, NFC-e, offline, personalizado); o primeiro é link pra `/demo` |
| Inimigo | `ApexInimigo.jsx` | "PDV genérico" vs KORA — 4 comparações |
| Funcionalidades | `ApexFuncionalidades.jsx` | 8 cards + banner escuro "do nosso jeito? não — do SEU" |
| Como funciona | `ApexComoFunciona.jsx` | 3 passos até a primeira venda |
| Planos | `ApexPlanos.jsx` | Presets + construtor de módulos; add-ons NF-e/TEF em faixa separada (ADR-005); JARVAS fora da grade, em bloco próprio que explica o degrau de preço; resumo com os 3 compromissos (mensal, sem fidelidade, sem taxa de instalação) |
| FAQ | `ApexFaq.jsx` | 4 objeções de compra |
| Demo | `ApexDemo.jsx` | Fechamento escuro; CTA verde de demo (ou "Entrar" sem `VITE_CONTATO_URL`) |
| Rodapé | `ApexRodape.jsx` | Monograma, identificação da empresa (`VITE_EMPRESA_*`), canais de contato e link da política de privacidade |
| Agendamento | `ApexAgendamento.jsx` | Formulário em modal (com focus trap) que **todos** os CTAs abrem — grava o lead e oferece o WhatsApp |

- Nenhum fetch de dados no carregamento: a página não lê nada do banco e não fica fora do
  `AppProvider` por acaso — a vitrine não restaura sessão nem abre realtime (`src/routes/ComContextoDoApp.jsx`
  embrulha só as telas do produto). O único acesso ao Supabase é a **gravação do lead**, quando alguém envia o formulário
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
  (44×44px, `aria-expanded`, drawer que fecha no link/backdrop); hero com badge único (quebra em
  duas linhas, centralizado) e CTAs full-width empilhados, mock em coluna única; prova só com os 3 itens essenciais; planos
  **empilhados com Casa Cheia primeiro e completo**, demais compactos (nome + resumo + preço)
  que expandem ao toque (botão ≥44px, chevron, `aria-expanded`); FAQ 1 coluna; CTA final
  full-width.
- Intuitividade: no celular o dono compara planos — por isso o recomendado vem primeiro e
  aberto, e os demais mostram preço sem toque nenhum; expandir é opt-in com affordance óbvia.

## Protótipo navegável (`/demo`)

O CTA primário do hero ("Ver o KORA rodando") abre `/demo` — uma demonstração
fictícia do produto, **só no apex** (fora dele a rota redireciona pro login):

- **`DemoLogin`**: réplica da tela de login do produto com a arte genérica KORA,
  credenciais fictícias já preenchidas (`demo`) e zero validação — qualquer
  Enter/clique entra. Banner deixa claro que é demonstração.
- **`DemoShell` + 4 telas**: Frente de Caixa (interativa — adicionar itens à
  comanda, cobrar Pix/cartão com sucesso fictício), Estoque, Clientes (busca +
  cadastro local) e Relatórios. Dados de `demoDados.js`, tudo em memória.
- Visual do **produto** (tokens `--gm-*`), não do site — a graça é mostrar o
  sistema real. Nenhum Supabase, nenhum AppContext, nada persiste.
- CTA de conversão dentro da demo ("Quero o KORA no meu negócio" → `/#planos`)
  e saída explícita ("Sair da demo" → `/`).
- Código em `src/pages/apex/demo/` (lazy — só quem abre a demo baixa o chunk).

## Variáveis de Ambiente

| Variável | Tipo | Descrição | Exemplo |
|----------|------|-----------|---------|
| `VITE_ROOT_DOMAIN` | string | Domínio raiz da plataforma; liga a detecção | `kora.codes` |
| `VITE_APEX_PREVIEW` | flag | Força a página institucional em dev local (preview sem domínio) | `VITE_APEX_PREVIEW=1` |
| `VITE_CONTATO_URL` | string | URL de contato (WhatsApp comercial, mailto, etc); opcional | `https://wa.me/5500999999999` |
| `VITE_EMPRESA_RAZAO_SOCIAL` | string | Razão social no rodapé e na política; opcional | `KORA Tecnologia LTDA` |
| `VITE_EMPRESA_CNPJ` | string | CNPJ no rodapé; opcional | `00.000.000/0001-00` |
| `VITE_EMPRESA_ENDERECO` | string | Endereço no rodapé; opcional | `Rua X, 100 — Cidade/UF` |
| `VITE_EMPRESA_EMAIL` | string | E-mail de contato/encarregado LGPD; opcional | `contato@kora.codes` |

O telefone do rodapé **não** tem variável própria: sai de `VITE_CONTATO_URL`
(`telefoneDoLink()` em `src/lib/empresa.js` tira o número do link do WhatsApp). Sem as
`VITE_EMPRESA_*` o rodapé simplesmente não mostra a linha correspondente — nada quebra, mas a
página fica sem a identificação que a LGPD e o Código de Defesa do Consumidor esperam.

## Captura de leads

Todo CTA da página abre o mesmo formulário (`ApexAgendamento.jsx`): nome, WhatsApp, e-mail e
**aceite explícito** de contato, com link pra política. O caminho é estreito de propósito
(migração `supabase/migrations/20260920_leads.sql`):

1. o navegador chama a RPC `registrar_lead` (SECURITY DEFINER, `GRANT EXECUTE` pra `anon`) —
   a chave pública **não** tem permissão nenhuma na tabela `leads`;
2. sem aceite marcado, o banco recusa a gravação (o CHECK vem antes de tudo);
3. dois envios do mesmo WhatsApp em 10 minutos viram um lead só;
4. quem lê é o Console (`is_super_admin()` na policy de SELECT), na aba **Leads**
   (`src/components/console/LeadsDashboard.jsx`): quem entrou, de qual CTA veio, que plano montou,
   link direto de WhatsApp e marcação de "já falei com essa pessoa".

Enquanto não existe e-mail transacional (custo — `memory/restrictions.md`), o aviso é o
próprio WhatsApp: a tela de sucesso oferece a conversa já escrita com o plano montado, e o
Console mostra os pendentes. `src/lib/leads.js` concentra validação, máscara e as consultas —
nada lança, tudo volta como `{ data, error }`.

**RLS precisa estar ligada no painel** para a tabela `leads` (a migração já cria as policies).

## Compartilhamento e indexação

- `index.html` tem título, descrição, Open Graph e Twitter Card **neutros de plataforma** — o
  mesmo HTML serve o apex e o subdomínio de cada estabelecimento, então nada ali pode falar de
  um host só. Imagem em `public/og-kora.png` (1200×630, gerada por `scripts/og-kora.html`)
- `src/lib/seo.js` decide **em runtime, por host e caminho**: canonical na vitrine, na
  demonstração e na política; `noindex` no login, no PDV, no console e em endereço inexistente
- `public/robots.txt` e `public/sitemap.xml` são arquivos de verdade (o Vercel serve o
  filesystem antes do rewrite do SPA)
- Endereço inexistente no apex cai em `ApexNaoEncontrada.jsx` — com `noindex`, porque o
  status HTTP continua 200 (limitação de SPA atrás de rewrite catch-all)

## O que NÃO muda

- Autenticação: Supabase Auth continua igual
- RLS: isolamento por tenant intacto
- Resolução de tenant por subdomínio: busca no hostname como antes
- Console da plataforma (admin, dashboards, etc): sem impacto

## Por que é intuitivo (princípio nº 1)

- **Visitante vê vitrine**: chega em `kora.codes` e conhece o produto antes de logar — conota profissionalismo
- **Cliente vê seu login direto**: `casacoffeecolab.kora.codes` vai direto ao login — nenhuma confusão
- **Um clique separa os dois**: botão "Entrar" no apex leva ao login GastroMundi — transição clara, sem detour
