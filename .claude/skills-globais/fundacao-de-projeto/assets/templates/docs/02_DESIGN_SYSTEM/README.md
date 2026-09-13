# 02 — DESIGN SYSTEM · {{PRODUTO}}

> Fonte única de verdade visual: tokens, cores, tipografia, componentes, animações.

## O que vive aqui

- **Design tokens**: escala de cores, tipografia, espaçamento, shadows, bordas
- **Paleta de cores**: cores base, semântica (sucesso/erro/aviso), acessibilidade
- **Tipografia**: fontes, escalas de tamanho, line-height, weights por contexto
- **Espacimentos**: grid, padding, margin, gap — a "régua" do layout
- **Iconografia**: conjunto único de ícones (SVG), convenção de nomes, tamanhos
- **Componentes**: catálogo de componentes visuais (atoms → molecules → organisms)
- **Animações**: transições, eases, durations — movimento consistente

## O que NÃO vive aqui

- Código dos componentes → `src/components/`
- Regras de negócio de UI → `03_REGRAS_DE_NEGOCIO/`
- Fluxos de interação → `05_FLUXOS/`
- Documentação de APIs → `07_APIS/`

## Arquivos sugeridos

- `TOKENS.md` — tabela estruturada: categoria, token name, valor, escopo
- `CORES.md` — paleta com hex/RGB, uso recomendado, contrast ratios
- `TIPOGRAFIA.md` — fontes, escalas (mobile/desktop), line-heights
- `ESPACAMENTOS.md` — grid, unidade base, escalas de spacing
- `ICONOGRAFIA.md` — conjunto de ícones SVG, nomeação, tamanhos
- `COMPONENTES.md` — atomic design: atoms, molecules, organisms
- `ANIMACOES.md` — transições, eases, durations, movimentos padrão

## Como preencher

1. **Crie uma paleta de cores primeiro**: escolha 3–5 cores base + variações (light/dark)
2. **Defina 1 única fonte para textos, 1 para display**: consistência visual
3. **Tokens devem ser parametrizáveis**: {{NOME_TENANT}} muda cor/logo, tokens não mudam
4. **Componentes nascem aqui, código em src/**: design first, depois implementa
5. **White-label**: nada de marca ou cor hardcodada — tudo token parametrizável por tenant

## Ligações

- `06_COMPONENTES/` — implementação dos componentes em React
- `memory/brand.md` — identidade visual e restrições de brand
- CLAUDE.md — regra de separar CSS do JSX (decisão 018)
