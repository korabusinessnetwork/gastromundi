# F005-SANGRIA — Sangria e suprimento no caixa

## 1. Escopo

Registrar **sangria** (retirada de dinheiro da gaveta) e **suprimento** (reforço de troco)
durante a sessão de caixa aberta, com motivo obrigatório, autor, limite por estabelecimento
e autorização de gerente acima do limite — e fazer esses movimentos entrarem no **valor
esperado** do fechamento, exatamente como `docs/03_REGRAS_DE_NEGOCIO/CAIXA.md` define:
`esperado = fundo + entradas em dinheiro + suprimentos − sangrias − estornos`.

## 2. Fora de escopo

- **Estornos** — a fórmula do CAIXA.md cita estornos, mas eles já existem como cancelamento
  de venda e não mudam nesta rodada.
- **Relatório dedicado de sangrias** — os movimentos aparecem no fechamento e no
  `activity_log`; uma tela de histórico com filtro por período fica para depois.
- **Sangria no Palm / mobile** — só no desktop (`Sidebar` + `DesktopLayout`), onde já moram
  abertura e fechamento de caixa.
- **Vínculo com o F009 (lançamentos financeiros)** — sangria não vira lançamento automático
  de saída; são livros diferentes e juntar os dois é decisão de produto ainda não escrita.
- **Editar ou excluir um movimento já registrado** — é trilha de auditoria; a tabela nasce
  sem policy de UPDATE/DELETE de propósito.
- **Impressão do comprovante de sangria.**

## 3. Origem e decisões que este item honra

- **Backlog:** `docs/09_BACKLOG/features.md:62` — F005 "Caixa — abertura/fechamento/sangria",
  🔴 Critical, hoje "Parcial — abertura/fechamento entregues, **sangria não existe**".
- **Regra de negócio:** `docs/03_REGRAS_DE_NEGOCIO/CAIXA.md` — movimentos, fórmula do valor
  esperado, validação "sangria não pode exceder o numerário disponível", matriz de permissões
  (sangria até o limite: dono/gerente/caixa; acima do limite: autorização), auditoria
  ("cada sangria/suprimento com autor e motivo") e os eventos `caixa.sangria`/`caixa.suprimento`.
- **Decisão 002** (multi-tenancy por RLS) — tabela nova nasce com `tenant_id` e política
  restritiva de isolamento.
- **Decisão 017** (SaaS white-label) — o limite de sangria é **configuração por
  estabelecimento**, não número cravado no código.
- **Decisão 018** (CSS separado do JSX) — modal novo nasce com `.css` co-localizado.
- **Princípio nº 1 (intuitividade)** — prevenção de erro antes de mensagem de erro.

### Duas decisões tomadas aqui (não são pergunta ao dono)

1. **Dinheiro em `numeric`, não em centavos inteiros.** O critério genérico do `/spec` pede
   inteiro, mas a camada operacional inteira já é `numeric`: `vendas.total numeric NOT NULL`,
   `lancamentos.valor numeric NOT NULL CHECK (valor > 0)`, e toda a conferência de caixa passa
   por `round2` de `src/lib/vendas.js`. Centavos inteiros só existem na camada de
   console/assinatura (`valor_centavos`, `faturamento_centavos`). Misturar as duas
   representações dentro da mesma conta de caixa é que produziria erro de arredondamento.
   `caixa_movimentos.valor` segue `lancamentos.valor`: `numeric NOT NULL CHECK (valor > 0)`, e
   toda soma passa por `round2`.
2. **O limite vira a config `limite_sangria`, com padrão no código.** O CAIXA.md exige
   autorização "acima do limite" mas nunca diz qual é o limite. Vira chave em `public.config`
   (mesma mecânica de `taxa_servico` e `dias_alerta_validade`), padrão R$ 200,00, editável na
   aba Geral das Configurações. A policy `config_write_caixa_sessao` (migration `20260744`)
   já restringe a escrita do cargo `caixa` a `fundo_atual`/`caixa_aberto`/`sessao_aberta_em`,
   então o caixa **lê** o limite mas não consegue afrouxá-lo — nenhuma mudança de policy é
   necessária.

## 4. Arquivos afetados

**Criados**

- `supabase/migrations/20260916_caixa_movimentos.sql` — tabela `public.caixa_movimentos` + RLS.
- `src/lib/caixaMovimentos.js` — funções puras (totais, ajuste do esperado, disponível,
  validação, exigência de autorização).
- `src/lib/caixaMovimentos.test.js` — teste das funções puras.
- `src/lib/caixaMovimentosSqlGuard.test.js` — guard do texto da migration, na convenção dos
  outros quinze `*SqlGuard.test.js` de `src/lib/`.
- `src/components/modals/MovimentoCaixaModal.jsx` + `MovimentoCaixaModal.css`.
- `src/components/modals/MovimentoCaixaModal.test.jsx`.

**Modificados**

- `src/context/AppContext.jsx` — carrega `caixa_movimentos` e a config `limite_sangria` no
  bootstrap, expõe `movimentosCaixa`, `registrarMovimentoCaixa`, `limiteSangria`,
  `setLimiteSangria`; emite `caixa.sangria`/`caixa.suprimento`.
- `src/components/desktop/Sidebar.jsx` — botão "Sangria / Suprimento" no rodapé do caixa.
- `src/pages/desktop/DesktopLayout.jsx` — estado do modal, handler, `logAction`.
- `src/components/modals/FechamentoModal.jsx` — suprimentos e sangrias entram na linha do
  dinheiro e no `totalEsperado`, com linhas próprias no resumo.
- `src/components/desktop/views/ConfiguracoesView.jsx` — campo do limite na aba Geral.
- `src/components/desktop/views/ConfiguracoesView.css` — estilo do campo novo.
- `docs/09_BACKLOG/features.md` — status do F005 (no `/aprender`).

## 5. Critérios de aceite

1. A migration `20260916_caixa_movimentos.sql` cria `public.caixa_movimentos` de forma
   idempotente (`CREATE TABLE IF NOT EXISTS`) com `tenant_id uuid NOT NULL DEFAULT
   public.tenant_atual_id() REFERENCES public.tenants(id)`.
2. A coluna `tipo` aceita apenas `'sangria'` e `'suprimento'` por CHECK, e `valor` é
   `numeric NOT NULL CHECK (valor > 0)` — nunca zero, nunca negativo, nunca float binário.
3. `motivo` e `autor` são `NOT NULL`; `autorizado_por` é anulável e só é preenchido quando
   houve autorização de gerente.
4. RLS ativa na tabela, com SELECT para `authenticated`, INSERT restrito aos cargos
   `admin`/`gerente`/`caixa` lidos de `(auth.jwt() -> 'app_metadata' ->> 'gastro_role')`,
   **nenhuma policy de UPDATE ou DELETE**, e uma policy `AS RESTRICTIVE FOR ALL` de
   isolamento por tenant. O cabeçalho avisa que a execução é manual no SQL Editor do Supabase.
5. `src/lib/caixaMovimentos.js` expõe `ajusteEsperadoDinheiro(movimentos)` devolvendo
   `round2(suprimentos − sangrias)`, e todas as somas do arquivo passam por `round2`.
6. `validarMovimento({ tipo, valor, motivo, disponivel })` rejeita, com mensagem em português
   do dia a dia: valor não numérico ou ≤ 0, motivo vazio, e sangria maior que o numerário
   disponível ("Sangria não pode exceder o numerário disponível" — CAIXA.md).
7. `exigeAutorizacao({ tipo, valor, limite })` é verdadeiro só para sangria acima do limite;
   suprimento nunca exige autorização.
8. O modal só permite confirmar quando o formulário está válido — botão desabilitado com o
   motivo visível ao lado, em vez de deixar errar e mostrar erro depois (Princípio nº 1).
9. Sangria acima do limite feita pelo cargo `caixa` exige senha de administrador via
   `verificarSenhaAdmin` de `src/lib/adminAuth.js`, e o insert só acontece depois do `ok`;
   `admin` e `gerente` não precisam de senha.
10. O ponto de entrada na `Sidebar` só aparece com o caixa aberto e para os cargos
    `admin`/`gerente`/`caixa` — `garcom` não vê.
11. `FechamentoModal` soma `ajusteEsperadoDinheiro` na linha do dinheiro, de modo que o
    `totalEsperado` enviado no `onConfirm` obedeça `fundo + entradas em dinheiro +
    suprimentos − sangrias`; sangrias e suprimentos aparecem como linhas próprias no resumo.
12. Só entram na conta os movimentos da **sessão atual** (`created_at >= inicioSessao`),
    pelo mesmo corte que o fechamento já usa para as vendas.
13. Cada movimento gera `emitirEvento("caixa.sangria" | "caixa.suprimento", "caixa", …)` e um
    `logAction` fire-and-forget com autor, valor e motivo — sem bloquear a operação.
14. A leitura de `caixa_movimentos` especifica as colunas (`select("id,tipo,valor,motivo,autor,autorizado_por,created_at")`) — nada de `select *` em tabela de caixa.
15. Falha do Supabase no insert mantém o modal aberto, com mensagem em `role="alert"` e sem
    alterar o estado local — nada é somado ao esperado sem ter sido gravado.
16. O limite vem da config `limite_sangria` por tenant, com padrão no código; nenhum valor de
    limite, nome ou regra de um cliente específico aparece cravado (decisão 017).
17. O estilo do modal fica em `MovimentoCaixaModal.css`, usando os tokens de tema do projeto
    (`var(--gm-…)` / `varColor(C.…)`) — nenhuma cor hexadecimal solta no JSX (decisão 018).
18. A suíte de testes do projeto (`npx vitest run`) fica verde, com teste novo cobrindo as
    funções puras e o fluxo do modal.

## 6. Edge cases conhecidos

- **Caixa fechado:** sem sessão aberta não há sangria — o botão não existe e o handler recusa.
- **Sangria de tudo:** sangria exatamente igual ao disponível é permitida (deixa a gaveta em
  zero); um centavo acima é bloqueada.
- **Disponível negativo ou zero:** com fundo zerado e nenhuma venda em dinheiro, qualquer
  sangria é bloqueada e o campo explica por quê; suprimento continua liberado.
- **Vírgula decimal:** o operador digita `50,00`; o valor precisa ser interpretado como 50 e
  não como `NaN`.
- **Offline:** a gravação é online-only. Sem rede, o insert falha e o modal diz isso; a senha
  de administrador já falha fechada com `MSG_SEM_REDE` (`src/lib/adminAuth.js`).
- **Permissão insuficiente no banco:** a policy nega o insert de um cargo sem direito mesmo
  que a UI tenha sido burlada — o erro vira mensagem, não tela quebrada.
- **Movimento de sessão anterior:** registros antigos ficam na tabela mas fora da conta da
  sessão atual, por causa do corte por `inicioSessao`.
- **`sessao_aberta_em` ausente** (dado legado): `inicioSessao` já cai no início do dia; o
  corte dos movimentos usa o mesmo número, sem cálculo próprio.
- **Ciclo de dependência:** `inicioSessao` é exportado de `FechamentoModal.jsx`, que importa
  `useApp` de `AppContext.jsx`. A lib nova recebe o timestamp como número e **não** importa o
  modal.
- **Limite mal configurado** (vazio, zero ou texto): cai no padrão do código em vez de
  liberar sangria ilimitada sem autorização.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte de testes verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nos fluxos de abertura e fechamento de caixa já
cobertos em `DesktopLayout.test.jsx`.

---

## 8. Resultado da review (2026-08-02)

**Aprovado sem ressalvas** — 18 de 18 critérios em sim. `npx vitest run`: 194 arquivos e
3080 testes, verde.

**Corrigido pela review, sem perguntar:**

1. **O handler não recusava com o caixa fechado.** O edge case desta lista diz "o botão não
   existe **e o handler recusa**", e só a primeira metade existia. `registrarMovimentoCaixa`
   ganhou a checagem de `caixaAberto` antes do `validarMovimento`
   (`src/context/AppContext.jsx:1288`): o `caixa_aberto` é chave compartilhada do `config` e
   chega por realtime, então o caixa pode fechar em outro aparelho com este modal já na tela —
   o movimento entraria com o recorte de uma sessão já conferida e nenhum fechamento o somaria.
2. **`caixa_movimentos` faltava em `supabase/schema.sql`** — apanhado pelo guard do TD016
   (rodada 10), que é exatamente o que ele existe para apanhar. A tabela foi descrita antes de
   `operator_logs` e `limite_sangria` entrou no comentário de chaves do `config`.

**Desvio deliberado, critério 9.** O spec pede `verificarSenhaAdmin(senha)`; o build usa
`verificarSenhaUsuario(username, senha)`. É a mesma RPC (`verificar_senha_admin`) com
`p_username` a mais. O motivo é o critério 3: `verificarSenhaAdmin` aceita a senha de qualquer
admin ou gerente ativo do tenant e devolve só `{ ok }`, então `autorizado_por` gravaria o nome
escolhido no seletor sem que ninguém o tivesse conferido. A troca é estritamente mais
restritiva que o pedido.

**Fica para uma próxima rodada** (já estava em "fora de escopo", segue de pé): relatório
dedicado de sangrias com filtro por período, sangria no Palm/mobile, vínculo com os lançamentos
do F009, comprovante impresso, e editar/estornar um movimento — hoje o caminho é registrar o
movimento inverso, por a tabela não ter policy de UPDATE nem de DELETE.

**Pendência de produção:** `supabase/migrations/20260916_caixa_movimentos.sql` precisa ser
executada manualmente no SQL Editor do Supabase, com a RLS conferida no painel. Até lá o botão
responde `relation "caixa_movimentos" does not exist`.
