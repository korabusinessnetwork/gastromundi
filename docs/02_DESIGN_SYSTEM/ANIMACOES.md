# Animações — GastroMundi

## Objetivo
Definir os princípios de movimento, durações, curvas de easing e padrões de animação — garantindo que a interface pareça viva e premium **sem nunca atrasar a operação**.

## Contexto
Movimento bem feito comunica causa e efeito, orienta a atenção e dá sensação de qualidade (Apple/Linear). Num PDV, porém, velocidade > espetáculo: animações são **rápidas, sutis e funcionais**. Nada de transição que faça o operador esperar.

## Regras Gerais
- Animação tem propósito: feedback, continuidade ou orientação espacial. Sem decoração gratuita.
- Durações curtas: a maioria entre **100–250ms**. Nada acima de ~400ms na operação.
- Anime preferencialmente `transform` e `opacity` (performáticos). Evitar animar `width/height/top/left`.
- Respeitar **`prefers-reduced-motion`**: reduzir/remover movimento, manter feedback essencial.
- Entrada e saída coerentes (mesma curva/origem).

## Validações
- Nenhuma ação crítica (cobrar, adicionar item) bloqueada por animação.
- 60fps em dispositivos de balcão (evitar reflow/layout thrashing).

## Permissões
- Novos padrões de movimento exigem revisão de design.

## Exceções
- Telas de marketing/onboarding podem usar movimento mais expressivo (fora da operação).

## Auditoria
- Changelog de tokens de movimento mantido.

## Eventos
- `motion.token.changed`

## Configurações Futuras
- Biblioteca de presets (Framer Motion) alinhada a estes tokens.

## Critérios de Aceite
- [x] Tokens de duração definidos
- [x] Curvas de easing definidas
- [x] Padrões por componente definidos
- [x] Suporte a `prefers-reduced-motion` documentado

---

## Durações

| Token | Valor | Uso |
|-------|-------|-----|
| `duration-instant` | 100ms | Hover, pressed, micro-feedback |
| `duration-fast` | 150ms | Tooltips, dropdowns, switches |
| `duration-base` | 200ms | Transições padrão, tabs, fade |
| `duration-slow` | 300ms | Modais, drawers, sheets |
| `duration-slower` | 400ms | Overlays grandes (uso raro) |

## Easing

| Token | Curva | Uso |
|-------|-------|-----|
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Geral (entrada+saída) |
| `ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Entrada de elementos |
| `ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Saída de elementos |
| `ease-spring` | mola suave (Framer) | Feedback lúdico pontual (ex.: item adicionado) |

## Padrões por componente

| Padrão | Movimento | Duração / curva |
|--------|-----------|-----------------|
| Hover de botão/card | cor + leve `translateY(-1px)` | `instant` / `ease-standard` |
| Pressed | `scale(0.98)` | `instant` |
| Foco | anel surge | `fast` / `ease-out` |
| Tooltip / dropdown | fade + `translateY(4px)` | `fast` / `ease-out` |
| Modal / dialog | fade overlay + scale `0.96→1` | `slow` / `ease-standard` |
| Drawer / sheet | slide da borda | `slow` / `ease-standard` |
| Toast | slide-in + fade | `base` (entrada) / `fast` (saída) |
| Item adicionado ao carrinho | fly/`spring` curto + contador pulsa | `base` / `ease-spring` |
| Nova comanda no KDS | leve highlight/pulse 1× | `base` |
| Skeleton loading | shimmer contínuo | loop 1.2s |
| Insight do Jarvas | fade-in suave + ícone `sparkles` | `base` / `ease-out` |

## Reduced motion
- Com `prefers-reduced-motion: reduce`: substituir slides/scales por **fade simples** ou nenhum movimento.
- Manter feedbacks essenciais (estado de loading, confirmação) de forma estática/instantânea.
- Nunca remover a informação — apenas o movimento.
