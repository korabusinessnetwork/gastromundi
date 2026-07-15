# Auditoria técnica — Julho/2026

Auditoria da frente de caixa, funções e telas antes do certificado NFC-e.
Duas frentes: **teste do app em produção** (navegação/leitura, feito na sessão
do dono) + **revisão de código-fonte** (segurança, lógica, incongruências —
feito aqui). Este documento consolida os achados e o estado de cada um.

Legenda de estado: ✅ corrigido · 🔧 aberto (pronto pra corrigir) · 🔍 observação/tech-debt · 🟢 verificado OK

---

## Bugs de código

### ✅ nº1 [ALTO] `montarVendaLegada is not defined` no bootstrap
`src/context/AppContext.jsx` importava só `mapearVendaParaLinhas`, mas
`buscarSalesData()` chamava `montarVendaLegada` (não importado) → `ReferenceError`
em runtime → o `try/catch` engolia e a leitura de vendas normalizadas (TD009
etapa 2) degradava silenciosamente para a tabela legada `sales`. Introduzido em
`d8ab155`. **Corrigido** (commit `c748fe0`): `+ montarVendaLegada` no import.
> ⚠️ Só vale em produção depois que o commit chegar na branch de deploy (Vercel)
> e ela rebuildar. Enquanto isso o erro persiste no ar.

### ✅ nº2 [MÉDIO/UX] KDS com tempo cru ("8510 min")
`CozinhaView` mostrava minutos crus (~6 dias como "8510 min"), ilegível na
operação. **Corrigido** (commit `b6eebfb`): função pura `formatarTempoDecorrido`
(min→"Xd Yh"/"Xh Ymin"/"X min"), com teste. *A queixa secundária de "botão
sobreposto pelo card seguinte" NÃO foi reproduzida no CSS (flex-column com gap,
sem overlap estrutural) — precisa de print + largura da janela pra investigar.*

### ✅ nº4 [MÉDIO/UX] Método de pagamento exibido como id interno
Relatórios mostravam `custom_crédito_cielo_1783529650712` porque cada tela tinha
um `METODOS_LABEL` fixo sem os métodos personalizados do estabelecimento.
**Corrigido** (commit `e8b50ca`): função pura `rotuloMetodo` (nativo → configurado
→ deriva do id custom → fallback), aplicada em RelatorioView e DesempenhoReport,
com teste.

### ✅ nº7 [MÉDIO/Financeiro] Conta que vence HOJE é marcada "vencida" no próprio dia
`src/lib/financeiro.js` → `marcarVencidos`: compara `new Date(l.vencimento)`
(string date-only → **meia-noite UTC**) com `hoje = new Date()` (agora local, com
hora). Em BRT (UTC−3), uma conta com `vencimento` de hoje é lida como ontem
21:00 local → `< agora` → marcada **vencido no próprio dia de vencimento**,
disparando o evento Jarvas `financeiro.conta.vencida` e um `UPDATE status='vencido'`
prematuro no banco. O teste `financeiro.test.js:82` ("não marca o que vence
exatamente hoje") passa **só porque** injeta `hoje` como string date-only
(meia-noite UTC), mascarando o caso real com `new Date()`.
**Corrigido** (commit `87b6ca4`): novo helper `dataCalendario` compara por
**data de calendário** (YYYY-MM-DD), usando os componentes **locais** quando `hoje`
é `Date` (produção). Teste de regressão com `hoje = new Date(2026,6,15,14,30)`
(hora do dia) trava o caso real que o teste antigo mascarava.

---

## Segurança (revisão de código) — 🟢 tudo verificado OK

- 🟢 **Aba "Credenciais" (Relatórios):** não expõe segredo. Mostra só
  Usuário / Login (@username) / Cargo, é **admin-gated** (`!isAdmin` → "Acesso
  restrito"), e a coluna de senha diz apenas "redefinir em Configurações". O
  export PDF leva os mesmos 3 campos. O nome "Credenciais" é enganoso (é lista
  de usuários/logins, não credenciais de gateway) — considerar renomear para
  "Usuários/Acessos" pra não assustar.
- 🟢 **`public.users` não tem coluna de senha/segredo** (schema.sql:25 — "Senhas
  vivem SOMENTE em auth.users"). O front busca colunas explícitas
  (`id,name,username,role,auth_id,active`). O `.insert().select()` em `addUser`
  não vaza segredo porque não há segredo na tabela.
- 🟢 **Configurações não guarda segredo de gateway/TEF.** Nenhum padrão
  `api_key/token/secret/merchant/cielo/...` na tela. Métodos `custom_*` são só
  rótulo+id, sem valor sensível.
- 🟢 **Sem chave/secret hardcodado** e **sem `console.log` de dado sensível**
  (senha/token/cpf/valor/caixa) no `src/`.
- 🟢 **Sem `select *` nas tabelas sensíveis** citadas na CLAUDE.md
  (`users`/`caixa`).

---

## Tech-debt / observações

- 🔍 **`CredenciaisReport.jsx` é um stub** (`return null` + TODO). A aba funciona
  por render inline no RelatorioView; o componente extraído nunca foi implementado.
  Remover o arquivo morto ou concluir a extração (decisão 018 — CSS/JSX separados).
- 🔍 **`select("*")` em `pending` (pedidos) e `lancamentos` (financeiro)**
  (`AppContext.jsx:161`, `financeiro.js:114`): não vazam segredo, mas a CLAUDE.md
  pede colunas explícitas em tabelas de pedidos/financeiro. Trocar por lista de
  campos quando conveniente.
- 🔍 **`FinanceiroView` carrega TODOS os lançamentos** (`listarLancamentos({})`)
  e filtra o mês no cliente. Cresce sem limite ao longo do tempo — passar `de/ate`
  do período pro banco.
- 🔍 **Dados de teste inflados** (achados nº3/nº6 do teste de produção): contas
  órfãs (matheus/joaquim/Administrador), ticket médio irreal (R$977), comandas
  abertas há dias, caixa aberto há muito tempo. Não é código — limpeza de base
  antes de validar números reais.
- 🔍 **nº5 — Combo com estoque próprio** (decisão de modelagem): combo é composto
  de subprodutos; controlar estoque do próprio combo tende a duplicar contagem.
  Avaliar em módulo de estoque/combos.

---

## Ainda não coberto (precisa de teste vivo, no navegador)

Estes exigem exercitar o app logado — ficam com o dono:
- Fluxo de **escrita ponta a ponta**: nova comanda → lançar item → fechar venda →
  método de pagamento → cupom. (O código foi revisado; falta a validação de
  comportamento real.)
- **Jarvas** (insights/alertas) na tela.
- **Visão mobile/palm**.
- Área **Admin** (compras/fornecedores/notas/impostos) em uso real.

---

_Correções nº1/nº2/nº4 já estão na branch `claude/cowork-handoff-prompt-iidj49`.
nº7 aguarda sinal verde pra corrigir._
