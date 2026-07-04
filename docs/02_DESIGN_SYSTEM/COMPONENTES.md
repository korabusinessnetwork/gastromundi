# Componentes — GastroMundi

## Objetivo
Inventariar os componentes do design system: primitivos (base shadcn/ui), padrões compostos e **componentes de domínio** do PDV/gestão — com variantes, estados e regras de uso.

## Contexto
A base de UI é **shadcn/ui + Radix + Tailwind** (já disponível no projeto), estilizada com os tokens da GastroMundi. Sobre essa base construímos componentes de negócio. Este arquivo é o inventário oficial: se não está aqui, não é parte do design system. O catálogo detalhado por nível (atomic design) vive em [`../06_COMPONENTES/`](../06_COMPONENTES/).

## Regras Gerais
- Primitivos de UI ficam em `components/ui/` (base shadcn, sem regra de negócio).
- Componentes de domínio (conhecem dados do negócio) ficam em `components/<dominio>/`.
- Todo componente documenta: responsabilidade, variantes, **estados** e props principais.
- Estados obrigatórios quando aplicável: `default, hover, focus, active, disabled, loading, error, empty, selected`.
- Acessibilidade obrigatória: role/ARIA, navegação por teclado, foco visível.
- **Reutilizar antes de criar** — nunca duplicar um componente existente.

## Validações
- Componente sem documentação não entra no DS.
- Testado em toque (PDV), mobile (360px) e desktop (1280px).

## Permissões
- Uso livre dos componentes existentes; adição exige revisão.

## Exceções
- Componentes one-off com tag `[LOCAL]`, fora do DS.

## Auditoria
- Changelog de adições/deprecações mantido.

## Eventos
- `component.added` · `component.deprecated`

## Configurações Futuras
- Storybook + testes de regressão visual.

## Critérios de Aceite
- [x] Primitivos mapeados para a base shadcn/ui
- [x] Padrões compostos definidos
- [x] Componentes de domínio do PDV definidos com estados
- [x] Variantes do Button definidas

---

## Primitivos (base shadcn/ui)

Já disponíveis no projeto (`components/ui/`), re-temados com tokens GastroMundi.

`Button` · `Input` · `Textarea` · `Label` · `Select` · `Checkbox` · `Switch` · `RadioGroup` · `Badge` · `Avatar` · `Card` · `Dialog` · `Drawer/Sheet` · `DropdownMenu` · `Tooltip` · `Tabs` · `Table` · `Toast/Sonner` · `Skeleton` · `Spinner` · `Separator` · `ScrollArea` · `Command` · `Popover` · `Pagination` · `Chart`.

### Button — variantes e estados
| Variante | Uso |
|----------|-----|
| `primary` | Ação principal (Cobrar, Adicionar) — `brand-600` |
| `secondary` | Ação secundária — superfície + borda |
| `ghost` | Ação terciária / em barras |
| `destructive` | Cancelar, excluir — `danger` |
| `outline` | Filtros, alternativas |
| `icon` | Ação somente-ícone (com `aria-label`) |

Tamanhos: `sm` (32px) · `md` (40px) · `lg` (48px) · `pos` (56px, toque). Em interfaces de toque (PDV/Cozinha) usar `lg`/`pos` (≥44px); `sm`/`md` são para telas de gestão com ponteiro. Estados: default/hover/focus/active/disabled/**loading**.

## Padrões compostos (moléculas)

| Componente | Composição | Notas |
|------------|-----------|-------|
| `FormField` | Label + controle + erro + ajuda | Acessível por padrão |
| `SearchInput` | Input + ícone + clear | Busca de produtos/clientes |
| `StatusBadge` | Badge + ícone + cor semântica | Status de pedido/pagamento/caixa |
| `KpiCard` | Valor (tabular) + label + tendência | Dashboards/Relatórios |
| `QuantityStepper` | − valor + (tabular) | Quantidade de item no PDV |
| `MoneyInput` | Input mascarado R$ + tabular | Valores monetários |
| `EmptyState` | Ícone + título + ação | Listas vazias |
| `ConfirmDialog` | Dialog + ação destrutiva | Cancelamentos |

## Componentes de domínio (PDV / gestão)

| Componente | Módulo | Responsabilidade | Estados-chave |
|------------|--------|------------------|---------------|
| `ProductCard` | PDV | Produto selecionável (nome, preço, imagem) | default/selected/`out-of-stock`/loading |
| `CartLine` | PDV | Item no carrinho (qtd, preço, remover) | default/editing/removed |
| `CartSummary` | PDV | Subtotal, desconto, **total** (display) | — |
| `NumericKeypad` | PDV/Caixa | Teclado numérico de toque (64px) | default/pressed |
| `PaymentPanel` | PDV/Caixa | Forma de pagamento, valor, troco | idle/processing/approved/declined |
| `OrderTicket` | Cozinha/Pedidos | Comanda (itens, tempo, status) | novo/em-preparo/pronto/atrasado |
| `KdsColumn` | Cozinha | Coluna do KDS por status | — |
| `CashSessionBar` | Caixa | Estado da sessão de caixa | aberto/fechado/divergência |
| `StockLevelBadge` | Estoque | Nível do insumo | ok/baixo/ruptura |
| `InsightCard` | Jarvas | Insight/alerta + ação sugerida | info/atenção/crítico |

## Layout (organismos)

| Componente | Notas |
|------------|-------|
| `AppShell` | Sidebar + Topbar + área de conteúdo |
| `Sidebar` | Navegação por módulo; expanded/collapsed |
| `Topbar` | Contexto (loja/usuário), busca, ações |
| `DataTable` | Ordenação, paginação, seleção, densidade |
| `PageHeader` | Título + ações + breadcrumbs |
