# Espaçamentos — GastroMundi

## Objetivo
Definir a grade de espaçamento, o ritmo vertical, as áreas de toque e as medidas de layout (containers, sidebar, gutters) que dão respiro e consistência à interface.

## Contexto
Espaçamento é o que separa uma interface premium de uma amadora. A GastroMundi usa uma **grade base de 4px** com ritmo de 8px. Como o PDV é operado no toque e sob pressão, áreas de toque generosas são regra, não exceção.

## Regras Gerais
- Tudo deriva da grade de **4px**. Nada de valores avulsos (`13px`, `7px`).
- Ritmo vertical preferencial em múltiplos de **8px**.
- **Interfaces de toque (PDV/Cozinha): alvo mínimo 44×44px** (alvos primários do PDV: 56px). Em telas de gestão operadas com mouse (Relatórios/Financeiro), botões podem usar densidades menores (32–40px).
- Densidade adaptável: telas operacionais (PDV/Cozinha) usam densidade "confortável" (alvos ≥44px); telas de gestão usam densidade "padrão".

## Validações
- Botões e itens tocáveis respeitam o mínimo de toque.
- Padding interno consistente por tipo de container (ver tabela).

## Permissões
- Adição de novos tokens de espaçamento exige revisão do tech lead.

## Exceções
- Ajustes ópticos de ±1–2px em ícones/bordas são permitidos para alinhamento visual.

## Auditoria
- Changelog de tokens de espaçamento mantido.

## Eventos
- `spacing.token.added` · `spacing.token.changed`

## Configurações Futuras
- Modo "alta densidade" para telas com muitos itens (grandes operações).

## Critérios de Aceite
- [x] Escala de espaçamento definida (token · px · Tailwind)
- [x] Padrões de padding por container
- [x] Áreas de toque mínimas definidas
- [x] Medidas de layout (container, sidebar, gutter) definidas

---

## Escala de espaçamento (grade 4px)

| Token | px | Tailwind | Uso |
|-------|----|----------|-----|
| `space-0.5` | 2 | `0.5` | Ajuste óptico |
| `space-1` | 4 | `1` | Gaps mínimos (ícone↔texto) |
| `space-2` | 8 | `2` | Itens relacionados |
| `space-3` | 12 | `3` | Padding compacto |
| `space-4` | 16 | `4` | Padding padrão de card/seção |
| `space-5` | 20 | `5` | Respiro entre grupos |
| `space-6` | 24 | `6` | Separação entre blocos |
| `space-8` | 32 | `8` | Margem de layout |
| `space-10` | 40 | `10` | Cabeçalhos/topo de página |
| `space-12` | 48 | `12` | Seções de página |
| `space-16` | 64 | `16` | Entre grandes seções |
| `space-20` | 80 | `20` | Áreas de respiro (landing/empty) |

## Padding por container

| Container | Padding | Gap interno |
|-----------|---------|-------------|
| Card / painel | `space-4` a `space-6` | `space-3` |
| Modal / drawer | `space-6` | `space-4` |
| Linha de tabela (densa) | `space-3` vertical | `space-2` |
| Item de pedido (PDV) | `space-4` | `space-3` |
| Botão (md) | `space-4` horizontal · `space-2` vertical | `space-2` |

## Áreas de toque

| Contexto | Tamanho mínimo |
|----------|----------------|
| Alvo em interface de toque (WCAG/HIG) | 44×44px |
| Botão primário de PDV (adicionar, cobrar) | 56px de altura |
| Teclado numérico (PDV/Caixa) | 64×64px por tecla |
| Ícone-botão (toque) | 44×44px (ícone 20–24px) |
| Ícone-botão / botão (desktop, ponteiro) | 32–40px |

## Layout

| Medida | Valor | Uso |
|--------|-------|-----|
| `container-max` | 1280px | Largura máxima de conteúdo de gestão |
| `gutter` | `space-6` (24px) | Margens laterais (desktop) |
| `gutter-mobile` | `space-4` (16px) | Margens laterais (mobile) |
| `sidebar-expanded` | 264px | Navegação lateral aberta |
| `sidebar-collapsed` | 72px | Navegação recolhida (ícones) |
| `topbar-height` | 64px | Barra superior |
| `grid-gap` | `space-4`/`space-6` | Grade de cards/produtos |
