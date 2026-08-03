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
| Duas pessoas editando a mesma comanda ao mesmo tempo (estado final pedido pelo dono: enquanto um está com a comanda aberta, o outro não mexe) | Palm + PDV | ✅ Leva 14 — trava de edição advisory (`editando_*` em `pending`, TTL 5min + heartbeat 30s, fail-open sem migration/rede); merge da Leva 2 segue como rede de segurança; migration 20260747 aplicada em 2026-07-18 |
| `selected` sem resync com Realtime | PDVView | ✅ Leva 2 |
| Checkout travado em "Processando..." após erro | PDVView/CheckoutView | ✅ Leva 1 (`b89db6c`) |
| Cobrança dupla em retentativa de pagamento | useFinalizarPagamento | ✅ Leva 1 |
| `addPending`/`addFechamento`/`updatePending` sem checar `.error` (writes silenciosos) | AppContext | ✅ Leva 1 — contrato `{ error }` + rollback otimista + toasts |
| Papel `caixa` sem acesso às keys de sessão (RLS) | config | ✅ Leva 3 (`7e4f1b8`, migration 20260744 — aplicada em 2026-07-18) |
| `fator_consumo_estoque` ignorado na baixa | PDVView | ✅ Leva 4 (`299789f`, migration 20260745 — aplicada em 2026-07-18) |
| Jarvas contava fundo como venda na divergência | jarvasEngine + fechamento | ✅ Leva 5 (`a6b661b`) |

### Altos

| Achado | Onde | Estado |
|---|---|---|
| NF-e reimportável (duplicava entradas de estoque) | NotasFiscaisTab | ✅ Leva 6 (`f247c55`) |
| Config fiscal sumia da tela ao salvar | ImpostosAdmin | ✅ Leva 7 (`fc6644f`) |
| Fechamento/saldo calculado por dispositivo (sem Realtime em `vendas`) | AppContext | ✅ Leva 15.4 — canal `sales-realtime` no AppContext (insert/update/delete sincronizam o saldo do dia entre caixas; resolve TD010). **Requer habilitar Realtime na tabela `sales` no painel** |

### Médios

| Achado | Onde | Estado |
|---|---|---|
| Centavos sem arredondar no checkout (frações fantasma) | CheckoutView | ✅ Leva 8 (`fbc2ae1`) — `round2` em tudo |
| Relatórios agrupavam dias em UTC | RPC `relatorio_vendas` | ✅ Leva 8 (migration 20260746 `p_tz` — aplicada em 2026-07-18) |
| `select *` em `pending` e `lancamentos` | AppContext, financeiro.js | ✅ Leva 10 — colunas explícitas |
| Rótulos de método custom só no PDV / `METODOS_LABEL` duplicado em 5 arquivos | vários | ✅ Leva 9 (`0cbe1ba`) — convergido em `rotuloMetodo` |
| Marca "GastroMundi" hardcodada (exports, ESC/POS, textos, console) | vários | ✅ Leva 9 — identidade vem do tenant; "by Kora" = assinatura da plataforma |
| `caixaAberto` default `true` antes do bootstrap (dava pra vender com caixa fechado) | AppContext/PDVView/MobilePage | ✅ Leva 10 — gate "Conectando ao caixa…" |
| Oversell de estoque sem alerta | PDVView/Jarvas | ✅ Leva 4 |
| Combos/subprodutos não baixam estoque dos componentes | PDVView | ✅ B4 (2026-07-18) — combos entram na grade do PDV (modo "combo" = card extra ao lado do principal; "substituir" toma o lugar dele); a receita viaja no item do carrinho; na finalização o principal baixa pelo fluxo normal e os subprodutos com `controla_estoque` baixam via RPC `baixar_estoque_subproduto` (tabela `estoque_subprodutos`, migration **20260748** — aplicar no painel); saldo/mínimo editáveis em Subprodutos; offline enfileira o replay (`rpc_baixar_estoque_subproduto`, mesmo caveat de não-idempotência do principal). v1: só PDV desktop (Palm não lança combo); sem alerta Jarvas de mínimo p/ subprodutos |

### Baixos

| Achado | Onde | Estado |
|---|---|---|
| Split confirmava com até 1,5¢ não alocado; dinheiro com "Recebido" menor que o alocado passava | CheckoutView | ✅ Leva 10 — tolerância 0,5¢ + bloqueio quando recebido digitado < valor |
| `sanitizeInput` lançava com não-string | crypto.js | ✅ Leva 10 — null-safe + testes |
| CSV de divergência sem descontar fundo | FechamentoModal | ✅ Leva 5 |
| Variação % mostrava "+100%" com base zero | RelatorioView | ✅ Leva 8 — vira "—" |
| `key={i}` em listas | ~25 ocorrências | ✅ verificado sem bug hoje — registrado como TD015 (era TD012, renumerado em 2026-08-01: o número colidia com o item de estoque) |
| RPC `limpar_reserva_mesa` "órfã" | — | ✅ falso positivo — usada em `useFinalizarPagamento.js` e testada |
| Cor do gerente "hardcodada" | constants/roles.js | ✅ falso positivo — papel é conceito da plataforma, não branding do tenant |
| `emitirDocumentoFiscal` stub | fiscal | ⏳ pendente (depende de provedor fiscal — decisão de custo do dono) |

## Teste real do dono — 2026-07-17 (offline no celular)

| Achado | Onde | Estado |
|---|---|---|
| Pedido lançado offline não grava E não sincroniza quando a internet volta — o rollback otimista (contrato Leva 1) descarta o pedido na falha; não existe fila local (sem service worker, sem PWA, sem IndexedDB) | app inteiro (AppContext fala direto com Supabase) | ✅ Leva 11 — offline-first: PWA (vite-plugin-pwa), snapshot do bootstrap, fila local em `src/lib/offline/` (insert vira upsert por id no reenvio — idempotente), badge `IndicadorRede`; escopo v1 = comandas (`pending`); **Leva 12 estendeu para a cobrança**: fechar comanda offline funciona em métodos SEM maquininha (venda vira `insert_venda` na fila — upsert por id, idempotente; evento `venda.finalizada` + dual-write só no reenvio confirmado); TEF segue online-only (bloqueio preventivo no checkout + guarda no hook); quais métodos usam TEF é configurável em Configurações → Meios de Pagamento (config `metodos_tef`, padrão crédito+débito, lista vazia = escolha explícita de "nenhum"); impressão local funciona offline via cache da config (`kora.cache.config_impressao.v1`). **Caveats conhecidos**: replays de `rpc_baixar_estoque` e `insert_lancamento` NÃO são idempotentes (janela rara de aplicação dupla se a resposta se perder após o servidor aplicar); caixa/fechamento segue online-only |
| Site promete "funciona offline" sem lastro (`ApexProva.jsx:25`, `ApexFaq.jsx:17`) | páginas de venda | ✅ com a Leva 11 a promessa passa a ter lastro para o fluxo de comandas; revisar o texto se quiser prometer menos/mais |
| Palm: na aba de comandas, tocar num slot "Disponível" abria o modal com o botão "Criar e Lançar" morto — `handleLancar` retornava em silêncio com carrinho vazio, impossível criar comanda a partir da aba | MobilePage | ✅ corrigido — criar comanda sem itens agora funciona (modal vira "Abrir Comanda", cria e abre o detalhe; itens podem ser lançados depois) |
| Pedido offline na mesma rede não chega ao caixa/impressora | Palm/caixa | ✅ Leva 13 — **Ponte KORA** (`ponte/`): servidor Node puro (zero deps, grátis) no PC do caixa; Palm abre página local via QR (`/palm?t=token`), pedido viaja pelo Wi-Fi, o app do caixa (que enxerga `http://localhost` mesmo em HTTPS) puxa via `PonteLocalBridge`/`usePonteLocal`, grava com `addPending` (cai na fila offline da Leva 11 → sincroniza sozinho), imprime a via de produção e confirma. Segurança: endpoints de gestão só-localhost; rede local exige token (nasce no 1º uso, fica em `ponte/dados/` — fora do git); total sempre recalculado no servidor; dedup em 3 camadas por id. Config em Configurações → Impressão → "Pedidos sem Internet" (QR + status); endereço salvo em config `ponte_endereco` (chave nova na tabela `config` existente — **sem migration nem RLS nova**). Botão no Palm quando offline leva ao modo local |

### Ações manuais pendentes (painel Supabase)

- ✅ Migrations **20260744**, **20260745**, **20260746** e **20260747** aplicadas
  em produção pelo dono em 2026-07-18 ("tudo rodando").
- ✅ Migration **20260748** (`estoque_subprodutos` + RPC `baixar_estoque_subproduto`)
  aplicada em produção pelo dono em 2026-07-18.
- ✅ **Realtime habilitado na tabela `sales`** (Database → Publications →
  `supabase_realtime`) pelo dono em 2026-07-18 — Leva 15.4 completa: saldo do
  dia sincronizado entre dispositivos.
- Nenhuma ação manual pendente no momento.

## Leva 15 — pedidos do dono (2026-07-18)

| Item | O quê | Estado |
|---|---|---|
| 15.1 | Remover produto na finalização (lista + botão no topo, senha admin) | ✅ |
| 15.2 | Rótulo de método `custom_*` nas comandas fechadas | ✅ |
| 15.3 | Cancelar comandas fechadas (blob marca `cancelada` p/ auditoria; linhas relacionais + lançamentos removidos; senha gerente/admin + motivo) | ✅ |
| 15.4 | Saldo do dia sincronizado (canal Realtime `sales`) | ✅ (Realtime habilitado no painel em 2026-07-18) |
| 15.5 | Busca por número de comanda no relatório | ✅ |
| 15.6 | Card de Lucro no financeiro (`calcularCustoVendas`: fichas técnicas × vendas do mês, menos saídas pagas; cobertura parcial sinalizada no rótulo) | ✅ |
| 15.7 | Frente de caixa abre direto na lista | ✅ |

## Ciclo do loop — 2026-08-01

| Bug | Onde | Estado |
|---|---|---|
| **Prévia do cardápio abria o estabelecimento errado.** "Ver cardápio do cliente" (`DeliveryView`, desde `f9fc34f`) abria `/cardapio` sem parâmetro. Sem subdomínio por tenant no ar, `CardapioPage` resolvia o slug por `slugDoSubdominio() ?? resolverSlugTenant()` e caía no fallback: o dono de **qualquer** estabelecimento via a vitrine, a marca, as categorias e os preços da GastroMundi. Violação de white-label (decisão 017) numa tela usada justamente para conferir o próprio cadastro — e silenciosa, porque a loja do outro parece normal | `DeliveryView.jsx` · `CardapioPage.jsx` · `tenantSlug.js` · `tenant.js` | ✅ Rodada 4 — o botão leva `?loja=<slug do tenant logado>` (`slug` entrou no `select` de `buscarTenantAtual`, que não o trazia) e a vitrine resolve por `slugDaVitrine`: **subdomínio > query > fallback**, então endereço publicado nunca é sequestrado por URL. Tenant sem slug abre `/cardapio` como antes. Sem migration — `tenants.slug` já existia desde a `20260740` |
| **`resumirAddonsDoTenant` casava tenant nulo (achado no build, não chegou a produção).** O filtro `linhas.filter((l) => l.tenant_id === tenantId)` compara por identidade: com `tenantId` nulo — que é o que `AddonsModal` calcula (`tenant?.id ?? null`) — `null === null` casa, e uma linha de `tenant_addons` sem tenant apareceria como add-on pago **ligado**. Hoje inalcançável pela tela (o `ConsolePage` só monta o modal com `tenantAddonsSelecionado &&`), mas a função é exportada de `src/lib/console.js` e o segundo chamador não teria essa guarda | `console.js` (`resumirAddonsDoTenant`) | ✅ Rodada 9 (2026-08-02) — curto-circuito `tenantId ? … : []`; teste "tenant nulo não liga nada por acidente" em `console.test.js` fixa o caso. Virou padrão em `memory/patterns.md` → "Cruzamento por tenant nunca casa tenant ausente" |
| **Vazamento de marca pelo cache de branding (achado no caminho, não chegou a produção).** `salvarBrandingCache` carimba o cache com o slug da **origem**; numa origem compartilhada isso é sempre `gastromundi`. A prévia da Casa Coffee gravaria a marca dela sob o carimbo do vizinho e a tela de login da origem passaria a pintar "Casa Coffee" para todo mundo | `brandingCache.js:91` | ✅ Rodada 4 — prévia (`origem === "query"`) não lê nem grava o cache; teste de controle prova que o caminho normal continua lendo e gravando |
| **Sufixo de alfa colado em `var()` apaga a borda em vez de tingi-la (em produção hoje).** `varColor(C.accent) + "66"` produz a string `var(--gm-accent)66` — CSS inválido. O idioma era correto quando as cores eram hex literal (`#7c3aed66`) e morreu calado na migração para custom properties (ADR-007). Como `var()` inválido resolve para `unset`, `border-style` cai para `none`: a borda **some** em vez de mudar de cor. No campo de senha da `Sidebar` (340, 359) é a borda vermelha de senha errada que desaparece. Nada acusa — o Vite não valida string de estilo, o jsdom não computa CSS, a suíte fica verde | 26 linhas / 27 declarações em 7 arquivos: `Sidebar.jsx` · `MesasAdmin.jsx` · `PDVView/index.jsx` · `RelatorioView.jsx` · `FechamentoModal.jsx` · `ConfiguracoesView.jsx` · `JarvasPanel.jsx` | ✅ Rodada 14 (2026-08-02) — todas trocadas por `alfa(cor, "NN")`, mesma cor e mesmo sufixo em cada ponto (diff de 26 linhas, 26 inserções e 26 remoções). Achado na rodada 13 ao migrar o hover do `.pdv__saldo-btn`, que foi documentado e **não** traduzido na hora porque o contrato daquela rodada era mudança visual zero. O inventário da rodada 13 estava curto: dizia 18 em 6 arquivos porque o grep ancorava em `varColor(`, e a forma quebrada também aparece quando o token chega por variável (`tipo.color`, `cor`, `color`) ou quando o `}` fecha um ternário em vez da chamada |
| **Endereço do estabelecimento renomeado em silêncio (em produção hoje).** O Console nunca mandava `slug` no corpo do provisionamento, então `provisionar_tenant` derivava do nome e, em colisão ou rótulo reservado, resolvia com sufixo numérico sem avisar ninguém: um segundo "Bar do Zé" virava `bardoze2` e um "Console" virava `console2`. O dono só via o endereço depois de criado, no cartão de primeiro acesso, e nunca sabia que tinha sido renomeado — nem tinha como escolher outro, porque a RLS de `tenants` só tem policy de SELECT | `console.js` (`provisionarEstabelecimento`) · `NovoEstabelecimentoModal.jsx` | ✅ Rodada 45 (2026-08-03) — campo **Link do cardápio** nasce do nome, mostra a URL real pela `urlDoCardapioPublico` e barra ocupado/reservado antes do envio, com botão de um clique para o livre mais próximo; `slug` passa a ir no corpo. Só cliente: a Edge Function já aceitava `slug` e o Console já tinha todos os slugs em memória — sem migration e sem consulta nova |
| **Botão dentro do `<label>` deixa o campo sem rótulo (achado na review, não chegou a produção).** O botão "Gerar senha" nasceu dentro do `<label className="nem-campo">` que envolvia o input. Um `<button>` dentro de `<label>` entra no cálculo do nome acessível dos dois: o botão passou a se chamar "Senha provisória gy2gk4t9rk Senha forte." (o texto inteiro do label, senha incluída) e o input ficou sem nome — `getByLabelText(/Senha provisória/i)` devolvia o botão. Leitor de tela anunciaria a senha em voz alta ao focar o botão | `NovoEstabelecimentoModal.jsx` | ✅ Rodada 46 (2026-08-03) — o único campo do modal que não é `<label>` em volta do input: `<div className="nem-campo">` com `<label htmlFor="nem-senha">` e `id="nem-senha"`, comentário no JSX explicando por que este destoa dos vizinhos. Nove testes de tela que usam `getByLabelText`/`getByRole` falharam de uma vez e apontaram direto para a causa |
