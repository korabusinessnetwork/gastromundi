# Cores — GastroMundi

## Objetivo
Definir a paleta de cores oficial da GastroMundi, a semântica de uso de cada cor, o suporte a tema claro/escuro e as regras de acessibilidade de contraste.

## Contexto
A cor é a expressão visual mais imediata da identidade. A GastroMundi busca uma estética **premium, calma e operacional** (inspiração: Apple, Linear, Stripe, Notion): neutros sóbrios como base, um acento de marca preciso e cores de status inequívocas — porque no balcão e na cozinha a leitura precisa ser instantânea. O tema escuro é cidadão de primeira classe (telas de cozinha / ambientes de baixa luz).

## Regras Gerais
- Nunca usar hex hardcoded no código — sempre tokens semânticos (`bg-surface`, `text-muted`, `text-primary`…).
- Toda cor tem um papel semântico (`success`, não "verde").
- Cores de status (success/warning/danger/info) são reservadas para status — nunca decoração.
- Contraste mínimo **WCAG AA**: 4.5:1 (texto normal), 3:1 (texto grande/ícones).
- Todo token de cor tem variante para **tema claro e escuro**.

## Validações
- Novas cores passam por verificação de contraste antes de entrar na paleta.
- O acento de marca (`brand`) não é usado para status nem para grandes áreas de fundo.

## Permissões
- Alteração da cor de marca exige aprovação de design + product owner (e ADR).
- Adição de neutros/semânticas exige revisão do tech lead.

## Exceções
- Cores de terceiros (logos de meios de pagamento, integrações) podem sair da paleta.

## Auditoria
- Changelog de paleta mantido; verificação de contraste a cada release visual.

## Eventos
- `color.added` · `color.changed` · `color.deprecated`

## Configurações Futuras
- Exportar tokens para Figma Variables e CSS custom properties.
- Temas por estabelecimento (white-label) reaproveitando a estrutura de tokens — padrão fixado em [ADR-007](../08_DECISOES/adr-007.md): CSS Custom Properties (`--gm-*`) sobrescritas por tenant, valores hoje hardcoded em `src/constants/colors.js`.

## Critérios de Aceite
- [x] Cor de marca definida com escala completa
- [x] Cores semânticas (success/warning/danger/info) definidas com fundo suave
- [x] Neutros (background/surface/border/text) definidos para claro e escuro
- [x] Mapeamento de status do domínio (PDV/Pedidos/Caixa) às cores semânticas
- [x] Diretriz de contraste documentada

---

## Cor de marca — GastroMundi Indigo

Acento único, confiante e moderno. Usado em CTAs primários, foco, seleção e elementos de marca.

| Token | Hex | Uso |
|-------|-----|-----|
| `brand-50` | `#EEF2FF` | Fundos de seleção/realce muito suave |
| `brand-100` | `#E0E7FF` | Hover de itens selecionados |
| `brand-200` | `#C7D2FE` | Bordas de foco suaves |
| `brand-300` | `#A5B4FC` | Ícones/estado ativo em dark |
| `brand-400` | `#818CF8` | Acento em dark mode |
| `brand-500` | `#6366F1` | Acento secundário |
| **`brand-600`** | **`#4F46E5`** | **Cor primária — botões, links, CTAs** |
| `brand-700` | `#4338CA` | Hover de primário |
| `brand-800` | `#3730A3` | Pressed/active |
| `brand-900` | `#312E81` | Texto de marca sobre fundo claro |

> Token semântico: `--color-primary` → `brand-600` (claro) / `brand-400` (escuro). Foco: `--ring` → `brand-500`.

## Neutros (Graphite)

Base cool/slate, sóbria e premium.

| Token semântico | Tema claro | Tema escuro | Uso |
|-----------------|-----------|------------|-----|
| `canvas` | `#F7F8FA` | `#0B0F19` | Fundo da aplicação |
| `surface` | `#FFFFFF` | `#111725` | Cards, painéis, barras |
| `surface-muted` | `#F1F3F5` | `#1A2233` | Fundos secundários, hover de linha |
| `border` | `#E5E7EB` | `#243044` | Bordas e divisores |
| `border-strong` | `#D1D5DB` | `#334155` | Divisores de ênfase |
| `text-primary` | `#0F172A` | `#F8FAFC` | Texto principal |
| `text-secondary` | `#475569` | `#94A3B8` | Texto auxiliar, labels |
| `text-tertiary` | `#94A3B8` | `#64748B` | Placeholders, desabilitado |

## Cores semânticas

Cada status tem **base** (texto/ícone/realce) e **fundo suave** (chips, banners). Em dark, usar a variante mais clara para garantir contraste.

| Status | Base (claro) | Fundo suave (claro) | Base (escuro) | Uso |
|--------|-------------|---------------------|--------------|-----|
| `success` | `#059669` | `#ECFDF5` | `#34D399` | Pago, concluído, confirmado |
| `warning` | `#D97706` | `#FFFBEB` | `#FBBF24` | Em preparo, aguardando, atenção |
| `danger` | `#DC2626` | `#FEF2F2` | `#F87171` | Cancelado, erro, ação irreversível |
| `info` | `#0284C7` | `#F0F9FF` | `#38BDF8` | Novo, informativo, dica |

## Mapeamento de status do domínio → cor

A consistência de cor entre módulos é regra (a mesma situação tem sempre a mesma cor).

| Situação | Cor |
|----------|-----|
| Pedido **aberto / novo** | `info` |
| Pedido **em preparo** (cozinha) | `warning` |
| Pedido **pronto / entregue** | `success` |
| Pedido **cancelado** | `danger` |
| Pagamento **aprovado** | `success` |
| Pagamento **pendente** | `warning` |
| Caixa **aberto** | `info` |
| Caixa **fechado / conferido** | `success` |
| Caixa **com divergência** | `danger` |
| Estoque **ok** | `success` |
| Estoque **baixo** | `warning` |
| Estoque **em ruptura** | `danger` |

## Acessibilidade
- Nunca comunicar status **só** por cor: acompanhar com ícone e/ou rótulo (ex.: ✓ Pago, ● Em preparo).
- Validar combinações texto/fundo em claro e escuro.
- Foco sempre visível (anel `--ring`, 2px), incluindo navegação por teclado.
