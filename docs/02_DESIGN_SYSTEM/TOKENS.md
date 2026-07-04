# Tokens — GastroMundi

## Objetivo
Centralizar os tokens transversais do design system que **não** são cor, tipografia, espaçamento, ícones ou movimento (esses têm arquivo próprio): raios, sombras, bordas, breakpoints, z-index e opacidades. Serve como referência de implementação no `tailwind.config` / CSS custom properties.

## Contexto
Tokens são a linguagem comum entre design e código. A regra é absoluta: nada hardcoded — tudo derivado de token semântico. Este arquivo é o "mapa" dos tokens; valores específicos de cada categoria estão em:
- Cores → [`CORES.md`](./CORES.md)
- Tipografia → [`TIPOGRAFIA.md`](./TIPOGRAFIA.md)
- Espaçamento e layout → [`ESPACAMENTOS.md`](./ESPACAMENTOS.md)
- Ícones → [`ICONOGRAFIA.md`](./ICONOGRAFIA.md)
- Durações/easing → [`ANIMACOES.md`](./ANIMACOES.md)

## Regras Gerais
- Nenhum valor de raio, sombra, borda ou z-index hardcoded — sempre token.
- Tokens nomeados semanticamente e documentados antes do uso.
- Definidos no `tailwind.config` e/ou CSS custom properties; tema claro/escuro via `data-theme`/`.dark`.

## Validações
- Todo novo token tem nome semântico (`radius-card`, não `radius-8`).
- Tokens não usados são removidos na revisão.

## Permissões
- Consulta livre; adição exige revisão do tech lead/design.

## Exceções
- Tokens de protótipo prefixados `proto-` (validade 30 dias).

## Auditoria
- Changelog de tokens com data e motivo.

## Eventos
- `token.added` · `token.changed` · `token.removed`

## Configurações Futuras
- Sincronizar com Figma Variables; exportar como JSON de design tokens.

## Critérios de Aceite
- [x] Raios definidos
- [x] Sombras (elevação) definidas para claro e escuro
- [x] Breakpoints definidos
- [x] Z-index em escala definida
- [x] Ponteiros para os demais arquivos de tokens

---

## Raios (border-radius)

| Token | Valor | Uso |
|-------|-------|-----|
| `radius-xs` | 4px | Badges, chips, inputs pequenos |
| `radius-sm` | 6px | Inputs, botões |
| `radius-md` | 10px | Cards, dropdowns |
| `radius-lg` | 14px | Painéis, modais, drawers |
| `radius-xl` | 20px | Containers de destaque |
| `radius-full` | 9999px | Pills, avatares, toggles |

## Sombras / elevação

Sombras suaves e em camadas (estética premium, não "pesadas"). Em **dark mode**, elevação é comunicada mais por `surface`/`border` do que por sombra.

| Token | Uso (claro) |
|-------|-------------|
| `shadow-xs` | Borda elevada sutil (inputs em foco) |
| `shadow-sm` | Cards em repouso / hover leve |
| `shadow-md` | Dropdowns, popovers |
| `shadow-lg` | Modais, drawers |
| `shadow-xl` | Overlays / command palette |

> Diretriz: `shadow-sm = 0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.10)`; escalar opacidade/blur para os níveis maiores. No dark, reduzir opacidade e reforçar `border`.

## Bordas

| Token | Valor |
|-------|-------|
| `border-width` | 1px (padrão) |
| `border-width-strong` | 1.5px (ênfase/foco) |
| `ring-width` | 2px (anel de foco — cor `brand-500`) |

## Breakpoints

| Token | Valor | Descrição |
|-------|-------|-----------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet (PDV em tablet) |
| `lg` | 1024px | Desktop pequeno |
| `xl` | 1280px | Desktop |
| `2xl` | 1536px | Desktop largo / KDS |

## Z-index

| Token | Valor | Uso |
|-------|-------|-----|
| `z-base` | 0 | Conteúdo |
| `z-sticky` | 100 | Cabeçalhos/colunas fixas |
| `z-dropdown` | 200 | Dropdowns, popovers |
| `z-overlay` | 300 | Backdrop de modal/drawer |
| `z-modal` | 400 | Modais, drawers |
| `z-toast` | 500 | Toasts/notificações |
| `z-tooltip` | 600 | Tooltips |

## Opacidades

| Token | Valor | Uso |
|-------|-------|-----|
| `opacity-disabled` | 0.5 | Elementos desabilitados |
| `opacity-muted` | 0.7 | Conteúdo secundário |
| `opacity-overlay` | 0.6 | Backdrop de overlay |
