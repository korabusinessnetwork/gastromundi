# PLAN — Redesign mobile `/palm` (Núcleo garçom+comanda)

Modo: **multi-model-orchestrator**. Escopo travado com o dono:
- **Escopo** = Núcleo garçom+comanda (telas 1a–1h). Fora: 1i (KDS), 1j (PDV cobrar), 1k (estoque), 1l (componentes).
- **Migração** = Substituir `/palm` pelo novo. `MobilePage.jsx` continua sendo o componente da rota `/palm`; muda o **visual + navegação**, preserva **toda a lógica**, e separa **CSS do JSX** (decisão 018).

## Objetivo
Reconstruir a superfície `/palm` fiel aos designs 1a–1h, com **navegação por abas inferiores** (Pedido / Comandas / Painel / Mais), mantendo 100% dos helpers e do comportamento atuais, trocando o `AMBER` hardcoded por `--gm-warn`, multi-tenant/white-label, temas claro+escuro, alvos de toque corretos, sem inventar dados.

## Princípio nº1 (INTUITIVIDADE) — justificativa por tela na entrega
Cada componente entrega uma frase curta de por que é intuitivo (obrigatório, CLAUDE.md).

---

## Arquitetura — casca + apresentação

**Regra de ouro:** os componentes de fan-out são **puramente apresentacionais**.
- Recebem dados via **props**, emitem via **callbacks**.
- **NÃO** importam `useApp`, `useTravaComanda`, helpers de negócio, nem tocam Supabase/logger.
- Cada um entrega seu **`.css` co-localizado** (decisão 018), usando `var(--gm-*)` e `color-mix(...)` direto (nada de hex; nada de `alfa()`/`C` — isso é JS, aqui é CSS puro).
- Ícones `react-icons/lu` podem ser importados direto pelos componentes (são apresentação).
- Alvos de toque ≥ 44px; teclas do keypad ~64px; `tabular-nums` em dinheiro/qtd/hora; respeitar `prefers-reduced-motion`.

**A casca (`src/pages/mobile/MobilePage.jsx`, dona = orquestrador)** mantém TODO o estado, handlers e integração:
- Todo o `useApp()` destructure atual.
- `persistirLancamento`, `handleLancar`, `porEmEspera`, `enviarEsperas`, `handleAddProduct`, `handleChangeQty`, `abrirDetalhe`/`fecharDetalhe`, `selecionarComanda`, `abrirModalLancar`.
- Trava: `useTravaComanda`, `travadaPorOutro`, `nomeTrava`.
- `painelGarcom` (totalLancamentosGarcom, radarOportunidades), `pedidosEmEspera` (todos), `comandaLock`.
- Portais (createPortal) das sheets, wiring de props/callbacks para os componentes de apresentação.
- `useNavigate` para a aba "Mais" → rotas `/app/*`.
- CSS co-localizado `MobilePage.css` para a casca/layout de página.

### Mapeamento navegação (troca do `mode` antigo)
Estado antigo `mode` ∈ {"pedido","grid","painel"} → **abas inferiores** ∈ {"pedido","comandas","painel","mais"}:
- `pedido`  → aba **Pedido** (grade de produtos + carrinho) — designs 1a/1b/1c.
- `grid`    → aba **Comandas** (grade de comandas + esperas) — designs 1e/1d.
- `painel`  → aba **Painel** (KPIs + radar) — design 1f.
- **nova** `mais` → aba **Mais** (hub de módulos) — design 1h. Links via `useNavigate` para `/app/*`.

Guardas (1g) e sheets (1b/1c/1d + detalhe) são renderizados por cima, independentes da aba.

---

## Contratos de interface (fonte de verdade — CONGELADOS)

Diretório-raiz dos componentes: `src/pages/mobile/`. Cada agente é **dono exclusivo** de UM subdiretório.

### Compartilhado — `src/pages/mobile/fmt.js` (dono = orquestrador, criado no scaffold)
```js
export function fmtComanda(name) {
  return /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;
}
export function fmtDinheiro(v) { return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`; }
```
> Os componentes importam SÓ de `@/pages/mobile/fmt`. Formatação de dinheiro atual no MobilePage usa `toFixed(2)`; `fmtDinheiro` reproduz o mesmo (com vírgula pt-BR — conferir contra o JSX atual e ajustar a casca para usar o helper de forma consistente).

### Chrome — `src/pages/mobile/chrome/` (Agente 7, Haiku)
- **`BottomNav.jsx`** `({ ativa, onNavegar, comandasBadge })`
  - `ativa`: "pedido"|"comandas"|"painel"|"mais". `onNavegar(chave)`. `comandasBadge`: number (nº de abertas; 0 = sem badge).
  - 4 abas: Pedido (LuUtensils), Comandas (LuLayoutGrid), Painel (LuChartBar), Mais (LuMenu/LuGrid). Ativa = cor accent.
- **`Guarda.jsx`** `({ tipo, onAcao, ponteEndereco })`
  - `tipo`: "loading" | "caixaFechado" | "offline". As 3 telas do 1g.
  - loading: spinner + "Conectando ao caixa…" + subtexto.
  - caixaFechado: círculo check VERDE + "Caixa fechado" + texto + botão "Verificar de novo" (`onAcao`).
  - offline: card escuro + wifi-off warn + "Sem internet" + texto + botão accent "Lançar pelo Wi-Fi do caixa" (`onAcao`) + rodapé. Só renderiza quando `ponteEndereco` existe (a casca decide).
- **`Toast.jsx`** `({ msg })` — fixo topo-centro, verde, mantém última msg no fade-out (comportamento do ToastMsg atual). Reproduz a lógica de `useRef` para segurar msg durante fade.
- **`BarraEsperas.jsx`** `({ esperas, onClick })` — pill warn: LuPause + "N pedidos em espera · R$ total" + "Revisar e enviar" (LuSend). `esperas` é array; usa `.length` e soma `totalEspera`-equivalente já calculado pela casca? → recebe `total` pronto: `({ qtd, total, onClick })`. **Congelado: `({ qtd, total, onClick })`**.

### Aba Pedido — `src/pages/mobile/tabs/pedido/` (Agente 1, Sonnet)
- **`PedidoTab.jsx`** props:
  - `usuarioNome` (string, primeiro nome), `onLogout()`.
  - `categorias` (string[]), `catAtiva` (string), `onCategoria(cat)`.
  - `busca` (string), `onBusca(txt)`.
  - `produtos` (array já filtrado por categoria+busca) — cada `{ id, name, price, category, emoji?, ... }`.
  - `qtdDe(produto)` → number (qtd no carrinho; a casca passa a função ou um `Map` por id). **Congelado: `qtdPorId` (objeto {id: qtd})**.
  - `onAddProduto(produto)`.
  - Rodapé de carrinho: `carrinhoQtd` (number), `carrinhoTotal` (number), `onAbrirCarrinho()`.
  - `barraEsperas`: `{ qtd, total, onClick }` | null (renderiza BarraEsperas se não-null).
  - Header: título "Pedido", nome do usuário, botão logout.
  > Carrinho aqui é só o **resumo/rodapé** que abre a sheet (design 1b). A edição do carrinho é a `CarrinhoSheet`.
- Entrega `PedidoTab.css`. Imagem: `1a-pedido-grade.png`.

### Aba Comandas — `src/pages/mobile/tabs/comandas/` (Agente 2, Sonnet)
- **`ComandasTab.jsx`** props:
  - `busca` (string), `onBusca(txt)`.
  - `comandas`: array de células a renderizar. A casca monta a lista já resolvida:
    `{ numero (string|number), estado: "lancada"|"comItens"|"vazia", emUso: bool, nomeTrava?: string, onClick() }`.
    - `lancada` → borda/preenchimento warn; `comItens` → azul; `vazia` → card/border neutro.
  - `temMais` (bool), `limite` (number), `total` (number = TOTAL_COMANDAS), `onVerMais()`.
  - `barraEsperas`: `{ qtd, total, onClick }` | null.
  - Header: LuLayoutGrid "Comandas" + count + "Voltar" (**na nav por abas, "Voltar" volta pra aba Pedido** → `onVoltar()`).
- Entrega `ComandasTab.css`. Imagens: `1e-comandas-grade.png`, `1d-pedidos-em-espera.png` (contexto da barra).

### Aba Painel — `src/pages/mobile/tabs/painel/` (Agente 3, Sonnet)
- **`PainelTab.jsx`** props:
  - `meu`: `{ total, itens, comandas }` (de totalLancamentosGarcom). Ticket médio = `total / comandas` (calcular na casca e passar `ticketMedio`; se comandas=0 → 0).
  - `oportunidades`: array `{ comandaId, comanda, mesa, regraId, rotulo, onClick() }` (de radarOportunidades; a casca anexa onClick→abrirDetalhe).
  - Header LuChartBar "Painel". Bloco KPIs: "Meus lançamentos no caixa" (R$ total), nº comandas, nº itens, **ticket médio** (3º KPI, design 1f). Bloco "Radar de oportunidades" (LuLightbulb warn) — cards clicáveis + CTA "+ Lançar nesta comanda".
- Entrega `PainelTab.css`. Imagem: `1f-painel-garcom.png`.

### Aba Mais — `src/pages/mobile/tabs/mais/` (Agente 4, Sonnet)
- **`MaisTab.jsx`** props:
  - `tenantNome` (string), `usuarioNome` (string), `usuarioIniciais` (string, ex "MA").
  - `caixa`: `{ aberto: bool, desde?: string, operador?: string }` (pill "Caixa aberto · desde HH:MM · operador X"; NÃO inventar — só mostra o que vier).
  - `modulos`: array `{ chave, rotulo, descricao?, icone (nome), habilitado: bool, melhorNoComputador?: bool, onClick() }`. Dimmed quando `!habilitado` ou `melhorNoComputador`.
  - `onConfiguracoes()`.
  - Header "Módulos" + tenant · usuário + avatar iniciais.
  - **NÃO fabricar contagens** (ex.: "8 pedidos na fila"): usar só `descricao` honesta vinda por prop; se não vier, não mostrar número.
- Entrega `MaisTab.css`. Imagem: `1h-hub-modulos.png`.

### Sheets de lançamento — `src/pages/mobile/sheets/lancamento/` (Agente 5, Sonnet)
- **`CarrinhoSheet.jsx`** `({ aberto, itens, onFechar, onQtd(index, qty), onLimpar, onLancar, total, podeConfirmar, textoConfirmar })`
  - Sheet inferior (design 1b): linhas de item com stepper (− vermelho / + verde), "Limpar carrinho" (vermelho), CTA "Lançar Pedido" (accent; disabled→faint). `itens` = cartItems (`{_key, name, price, qty, emoji?}`).
- **`LancarSheet.jsx`** `({ aberto, titulo, comanda, mesa, onComanda(v), onMesa(v), onConfirmar, onEspera, erro, salvando, textoConfirmar, mostrarEspera })`
  - Design 1c = **KEYPAD NUMÉRICO** (~64px/tecla) para o número da comanda. Campo "Número da Comanda *" alimentado pelo keypad (dígitos) + permitir texto? O atual aceita "Ex: 42 ou Mesa VIP" (texto até 40 chars). **Congelado:** keypad numérico como entrada primária + input de texto editável para casos não-numéricos (não perder a capacidade atual). Campo "Mesa (opcional)". Botão "Deixar em espera e ir pra próxima" (warn, LuPause) quando `mostrarEspera`. `erro` exibido. Título dinâmico e `textoConfirmar` vêm prontos da casca.
- Entrega `lancamento.css` (um arquivo para as duas sheets, ou dois — dono decide, co-localizado). Imagens: `1b-carrinho-sheet.png`, `1c-lancar-comanda-keypad.png`.

### Sheets de comanda — `src/pages/mobile/sheets/comanda/` (Agente 6, Sonnet)
- **`EsperasSheet.jsx`** `({ aberto, esperas, resumo, onFechar, onRemover(id), onEnviarTodos, enviando })`
  - Design 1d: "Pedidos em espera" (LuPause warn) + `resumo` (string pronta de resumoEsperas). Linhas: `fmtComanda(nome)` + itens (string) + `erro?` (warn, LuLock) + total (verde) + remover (LuTrash2 vermelho). CTA "Enviar todos (N)" (LuSend). `esperas` = array `{ id, nome, itensTexto, total, erro? }` — a casca adapta o formato de pedidosEmEspera para isso.
- **`DetalheComandaSheet.jsx`** `({ order, visivel, onFechar, onAdicionar, travada, nomeTrava })`
  - Sheet animada (backdrop fade 0.3s, panel translateY cubic-bezier(0.32,0.72,0,1) 0.3s, sempre montada — usa `visivel` p/ animar). Drag handle. Header `fmtComanda` + Mesa/garçom(LuUser)/hora(LuClock accent). Aviso de trava (warn, LuLock) quando `travada`. Linhas de item (badge qtd 44px + "un", nome+emoji+launched_at LuClock, preço verde + unитário se qty>1). Footer "Total" (verde) + botão "Adicionar itens" (accent; disabled→"Em uso" LuLock quando `travada`). `order` = objeto pending (`{ comanda, mesa, garcom, created_at, items:[{name, qty, price, emoji?, launched_at}], total }`).
- Entrega `comanda.css`. Imagens: `1d` (contexto), estado detalhe (do fluxo atual).

---

## Papéis de modelo
- **Orquestrador (Opus, eu):** foundation (warn token — FEITO), `fmt.js`, scaffold, casca `MobilePage.jsx` + `MobilePage.css`, integração, validação, commit/push.
- **Sonnet:** Agentes 1–6 (tabs + sheets — UI com layout/estado local de apresentação).
- **Haiku:** Agente 7 (chrome — BottomNav/Guarda/Toast/BarraEsperas, peças menores e repetitivas).

## Regra anti-colisão (um dir, um dono)
| Agente | Modelo | Diretório EXCLUSIVO |
|---|---|---|
| 1 | Sonnet | `src/pages/mobile/tabs/pedido/` |
| 2 | Sonnet | `src/pages/mobile/tabs/comandas/` |
| 3 | Sonnet | `src/pages/mobile/tabs/painel/` |
| 4 | Sonnet | `src/pages/mobile/tabs/mais/` |
| 5 | Sonnet | `src/pages/mobile/sheets/lancamento/` |
| 6 | Sonnet | `src/pages/mobile/sheets/comanda/` |
| 7 | Haiku  | `src/pages/mobile/chrome/` |
| — (orq) | Opus | `src/pages/mobile/MobilePage.jsx`, `src/pages/mobile/MobilePage.css`, `src/pages/mobile/fmt.js` |

Nenhum agente escreve fora do seu diretório. `fmt.js` é criado pelo orquestrador ANTES do fan-out (os agentes só importam dele).

## Validação (Fase 3 — orquestrador)
- `node --check` em cada `.jsx`/`.js` novo (via babel/esbuild se necessário — JSX não passa em `node --check` puro; usar parser).
- Consistência props: consumidor (casca) ↔ produtor (componente) para cada contrato acima.
- `npm test` (inclui colors.test.js afetado pelo warn token + testes de componente do PDV `src/**/*.test.jsx`).
- Reset `package-lock.json` antes do commit.
- VALIDATION.md com tabela de checagens + veredito.
- No push: force-with-lease (branch resetada p/ main); avisar sobre commits VARREDURA preservados no tag `varredura-backup` (57fea46) → recomendar PR separado.
