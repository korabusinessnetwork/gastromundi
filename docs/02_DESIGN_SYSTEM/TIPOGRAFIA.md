# Tipografia — GastroMundi

## Objetivo
Definir a família tipográfica, a escala de tamanhos, pesos, alturas de linha e regras de uso — com atenção especial à leitura de **valores monetários e quantidades** (críticos num PDV).

## Contexto
Tipografia premium é invisível: hierarquia clara, leitura sem esforço (inspiração Linear/Stripe/Notion). Numa operação de balcão, números precisam ser inequívocos — por isso usamos **algarismos tabulares** para dinheiro, quantidades e tempos.

## Regras Gerais
- Família única de UI: **Inter** (variável). Sem segunda família de texto.
- Mono apenas para dados técnicos (SKU, IDs, comandas): **JetBrains Mono**.
- Tamanhos sempre da escala — nunca valores arbitrários.
- Line-height ≥ 1.5 para corpo; headings mais justos (1.1–1.3).
- **`font-variant-numeric: tabular-nums`** obrigatório em preços, totais, quantidades, troco e horários.

## Validações
- Contraste validado para cada tamanho/peso (ver `CORES.md`).
- Stack de fallback definida (`system-ui`).
- Tamanho mínimo legível: 12px (`text-xs`), reservado a captions.

## Permissões
- Troca da família principal exige revisão visual completa + aprovação de design.

## Exceções
- Fontes de ícones são tratadas em `ICONOGRAFIA.md`.

## Auditoria
- Changelog de alterações tipográficas mantido.

## Eventos
- `typography.font.changed` · `typography.scale.updated`

## Configurações Futuras
- Tipografia para e-mails/recibos transacionais e cupom impresso.
- Avaliar `Inter Display` para títulos de marketing.

## Critérios de Aceite
- [x] Família principal definida com fallback
- [x] Escala de tamanhos documentada (rem + px)
- [x] Pesos e usos definidos
- [x] Regra de algarismos tabulares para números do domínio
- [x] Estilos semânticos (display/title/body/label/caption/mono) definidos

---

## Famílias

| Papel | Família | Fallback | Uso |
|-------|---------|----------|-----|
| UI / Texto | **Inter** (variável) | `system-ui, -apple-system, "Segoe UI", sans-serif` | Tudo: títulos, corpo, labels, inputs |
| Mono | **JetBrains Mono** | `ui-monospace, "SF Mono", monospace` | SKU, IDs, número de comanda, dados técnicos |

- Tracking: `-0.011em` em títulos grandes (`text-2xl`+) para densidade premium; `0` no corpo.
- Recursos: `cv01, ss01` do Inter habilitados; `tabular-nums` em números.

## Escala tipográfica

| Token | rem / px | Line-height | Peso típico | Uso |
|-------|----------|-------------|-------------|-----|
| `text-xs` | 0.75 / 12 | 1.5 | 500 | Captions, metadados |
| `text-sm` | 0.875 / 14 | 1.5 | 400–500 | Labels, texto de apoio, tabelas densas |
| `text-base` | 1.0 / 16 | 1.5 | 400 | Corpo padrão |
| `text-lg` | 1.125 / 18 | 1.4 | 500 | Subtítulos, item de pedido |
| `text-xl` | 1.25 / 20 | 1.35 | 600 | Título de card/seção |
| `text-2xl` | 1.5 / 24 | 1.25 | 600 | Título de página |
| `text-3xl` | 1.875 / 30 | 1.2 | 700 | Headings principais |
| `text-4xl` | 2.25 / 36 | 1.1 | 700 | Totais de venda, displays de PDV |
| `text-5xl` | 3.0 / 48 | 1.1 | 700 | Valor do troco/total em tela cheia |

## Pesos

| Token | Peso | Uso |
|-------|------|-----|
| `font-normal` | 400 | Corpo |
| `font-medium` | 500 | Labels, botões, itens de lista |
| `font-semibold` | 600 | Subtítulos, ênfase |
| `font-bold` | 700 | Títulos, totais |

## Estilos semânticos (papéis)

| Papel | Composição | Onde |
|-------|-----------|------|
| `display` | `text-4xl/5xl` · 700 · tabular | Total da venda, troco no PDV |
| `title` | `text-2xl` · 600 | Cabeçalho de página |
| `section` | `text-xl` · 600 | Título de bloco/card |
| `body` | `text-base` · 400 | Conteúdo geral |
| `label` | `text-sm` · 500 | Rótulos de campo, colunas |
| `caption` | `text-xs` · 500 · `text-secondary` | Metadados, ajuda |
| `mono` | JetBrains Mono · `text-sm` | SKU, comanda, IDs |
| `money` | herda · **tabular-nums** | Qualquer valor monetário/quantidade |
