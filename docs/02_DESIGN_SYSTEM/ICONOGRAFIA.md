# Iconografia — GastroMundi

## Objetivo
Definir a biblioteca de ícones, tamanhos, traço, regras de uso e o mapeamento semântico de ícones para os módulos e ações do domínio.

## Contexto
Ícones aceleram o reconhecimento numa operação rápida. A GastroMundi adota um set **outline, consistente e minimalista** (estética Linear/Notion). Ícone nunca substitui rótulo em ações críticas (cobrar, cancelar) — acompanha.

## Regras Gerais
- Biblioteca oficial: **Lucide** (outline, traço consistente, já presente no ecossistema shadcn/ui).
- Traço (stroke) padrão: **1.75px** (1.5px em ícones ≥24px).
- Tamanhos da escala — nunca redimensionar arbitrariamente.
- Ícone com significado funcional precisa de `aria-label`; ícone decorativo usa `aria-hidden`.
- Um conceito = um ícone (consistência entre módulos).

## Validações
- Cor do ícone herda a cor do texto/semântica do contexto (não cores avulsas).
- Ícones de status seguem o mapeamento de `CORES.md`.

## Permissões
- Inclusão de ícone fora do Lucide exige aprovação de design (SVG otimizado, mesmo grid/traço).

## Exceções
- Logos de meios de pagamento e integrações usam suas marcas oficiais.

## Auditoria
- Changelog do set de ícones mantido (adições/substituições).

## Eventos
- `icon.added` · `icon.replaced`

## Configurações Futuras
- Sprite/sublibrary de ícones de produto (categorias de cardápio).

## Critérios de Aceite
- [x] Biblioteca e traço definidos
- [x] Escala de tamanhos definida
- [x] Regras de acessibilidade definidas
- [x] Mapeamento semântico módulos/ações → ícone

---

## Tamanhos

| Token | px | Uso |
|-------|----|-----|
| `icon-xs` | 14 | Inline em texto pequeno, badges |
| `icon-sm` | 16 | Dentro de botões/labels |
| `icon-md` | 20 | Padrão (navegação, ações) |
| `icon-lg` | 24 | Cabeçalhos, ícone-botão |
| `icon-xl` | 32 | Empty states, destaques |
| `icon-2xl` | 48 | Ilustração leve, onboarding |

## Mapeamento por módulo

| Módulo | Ícone (Lucide) |
|--------|----------------|
| PDV | `shopping-cart` / `scan-barcode` |
| Caixa | `banknote` / `wallet` |
| Pedidos | `receipt` / `clipboard-list` |
| Cozinha | `chef-hat` / `flame` |
| Estoque | `package` / `boxes` |
| Financeiro | `landmark` / `line-chart` |
| Clientes | `users` / `user-round` |
| Relatórios | `bar-chart-3` / `pie-chart` |
| Jarvas (IA) | `sparkles` / `brain` |

## Mapeamento por ação

| Ação | Ícone |
|------|-------|
| Adicionar item | `plus` |
| Remover | `trash-2` |
| Editar | `pencil` |
| Buscar | `search` |
| Cobrar / pagamento | `credit-card` |
| Imprimir / cupom | `printer` |
| Confirmar | `check` · `check-circle-2` |
| Cancelar / erro | `x` · `x-circle` |
| Aguardando / tempo | `clock` |
| Alerta / atenção | `alert-triangle` |
| Insight do Jarvas | `sparkles` |
| Configurações | `settings` |

## Acessibilidade
- Ações somente-ícone exigem `aria-label` descritivo e tooltip.
- Status nunca depende só do ícone: usar ícone + cor + (quando crítico) rótulo.
