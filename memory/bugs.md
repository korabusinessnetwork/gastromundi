# Bugs e incongruências — registro vivo

Registro dos achados de varreduras de código e o estado de cada um.
Formato: achado → onde → estado (leva/commit ou pendente).

## Varredura Kora — 2026-07-17 (10 levas noturnas, branch `claude/cowork-handoff-prompt-iidj49`)

Escopo: ~167 arquivos / ~25k linhas. Cada leva = 1 commit no branch,
revisão item a item com o dono antes de merge.

### Críticos (todos resolvidos)

| Achado | Onde | Estado |
|---|---|---|
| `updatePending` sobrescrevia itens entre dispositivos (sem merge) | AppContext | ✅ Leva 2 (`789be70`) — merge por `uid`; resíduo em TD013 (RPC de append atômico) |
| `selected` sem resync com Realtime | PDVView | ✅ Leva 2 |
| Checkout travado em "Processando..." após erro | PDVView/CheckoutView | ✅ Leva 1 (`b89db6c`) |
| Cobrança dupla em retentativa de pagamento | useFinalizarPagamento | ✅ Leva 1 |
| `addPending`/`addFechamento`/`updatePending` sem checar `.error` (writes silenciosos) | AppContext | ✅ Leva 1 — contrato `{ error }` + rollback otimista + toasts |
| Papel `caixa` sem acesso às keys de sessão (RLS) | config | ✅ Leva 3 (`7e4f1b8`, migration 20260744 — **aplicar no painel**) |
| `fator_consumo_estoque` ignorado na baixa | PDVView | ✅ Leva 4 (`299789f`, migration 20260745 — **aplicar no painel**) |
| Jarvas contava fundo como venda na divergência | jarvasEngine + fechamento | ✅ Leva 5 (`a6b661b`) |

### Altos

| Achado | Onde | Estado |
|---|---|---|
| NF-e reimportável (duplicava entradas de estoque) | NotasFiscaisTab | ✅ Leva 6 (`f247c55`) |
| Config fiscal sumia da tela ao salvar | ImpostosAdmin | ✅ Leva 7 (`fc6644f`) |
| Fechamento/saldo calculado por dispositivo (sem Realtime em `vendas`) | AppContext | ⏳ pendente (relacionado a TD010) |

### Médios

| Achado | Onde | Estado |
|---|---|---|
| Centavos sem arredondar no checkout (frações fantasma) | CheckoutView | ✅ Leva 8 (`fbc2ae1`) — `round2` em tudo |
| Relatórios agrupavam dias em UTC | RPC `relatorio_vendas` | ✅ Leva 8 (migration 20260746 `p_tz` — **aplicar no painel antes do deploy**) |
| `select *` em `pending` e `lancamentos` | AppContext, financeiro.js | ✅ Leva 10 — colunas explícitas |
| Rótulos de método custom só no PDV / `METODOS_LABEL` duplicado em 5 arquivos | vários | ✅ Leva 9 (`0cbe1ba`) — convergido em `rotuloMetodo` |
| Marca "GastroMundi" hardcodada (exports, ESC/POS, textos, console) | vários | ✅ Leva 9 — identidade vem do tenant; "by Kora" = assinatura da plataforma |
| `caixaAberto` default `true` antes do bootstrap (dava pra vender com caixa fechado) | AppContext/PDVView/MobilePage | ✅ Leva 10 — gate "Conectando ao caixa…" |
| Oversell de estoque sem alerta | PDVView/Jarvas | ✅ Leva 4 |
| Combos/subprodutos não baixam estoque dos componentes | PDVView | ⏳ pendente (regra de negócio a definir com o dono) |

### Baixos

| Achado | Onde | Estado |
|---|---|---|
| Split confirmava com até 1,5¢ não alocado; dinheiro com "Recebido" menor que o alocado passava | CheckoutView | ✅ Leva 10 — tolerância 0,5¢ + bloqueio quando recebido digitado < valor |
| `sanitizeInput` lançava com não-string | crypto.js | ✅ Leva 10 — null-safe + testes |
| CSV de divergência sem descontar fundo | FechamentoModal | ✅ Leva 5 |
| Variação % mostrava "+100%" com base zero | RelatorioView | ✅ Leva 8 — vira "—" |
| `key={i}` em listas | ~25 ocorrências | ✅ verificado sem bug hoje — registrado como TD012 |
| RPC `limpar_reserva_mesa` "órfã" | — | ✅ falso positivo — usada em `useFinalizarPagamento.js` e testada |
| Cor do gerente "hardcodada" | constants/roles.js | ✅ falso positivo — papel é conceito da plataforma, não branding do tenant |
| `emitirDocumentoFiscal` stub | fiscal | ⏳ pendente (depende de provedor fiscal — decisão de custo do dono) |

## Teste real do dono — 2026-07-17 (offline no celular)

| Achado | Onde | Estado |
|---|---|---|
| Pedido lançado offline não grava E não sincroniza quando a internet volta — o rollback otimista (contrato Leva 1) descarta o pedido na falha; não existe fila local (sem service worker, sem PWA, sem IndexedDB) | app inteiro (AppContext fala direto com Supabase) | ⏳ pendente — projeto offline-first (PWA + fila local + sync), ~2–3 levas; desenho já existe em `pesquisas-diarias/ideia-2026-07-10.html` (vite-plugin-pwa + Dexie, custo zero) |
| Site promete "funciona offline" sem lastro (`ApexProva.jsx:25`, `ApexFaq.jsx:17`) | páginas de venda | ⏳ pendente — dono decide: priorizar offline-first ou ajustar o texto do site |
| Palm: na aba de comandas, tocar num slot "Disponível" abria o modal com o botão "Criar e Lançar" morto — `handleLancar` retornava em silêncio com carrinho vazio, impossível criar comanda a partir da aba | MobilePage | ✅ corrigido — criar comanda sem itens agora funciona (modal vira "Abrir Comanda", cria e abre o detalhe; itens podem ser lançados depois) |
| Pedido offline na mesma rede não chega ao caixa/impressora | Palm/caixa | ⏳ fila — estudar ponte local (QZ Tray já roda no caixa); desenho junto com a Leva 11, apresentar ao dono antes de montar |

### Ações manuais pendentes (painel Supabase)

- Migrations **20260744**, **20260745**, **20260746** ainda não aplicadas em produção.
  A 20260746 (`relatorio_vendas` com `p_tz`) é **pré-requisito do próximo deploy** —
  o front já envia o fuso.
