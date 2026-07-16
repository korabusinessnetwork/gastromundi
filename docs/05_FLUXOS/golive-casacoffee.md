# Go-live · Casa Coffee Colab (Paula operando sozinha)

> Roteiro do **dono da plataforma** (Matheus) pra deixar o 2º tenant operável em
> `casacoffeecolab.kora.codes`. O SQL de conferência/acabamento está em
> `supabase/GO_LIVE_casacoffee.sql` (blocos numerados batem com os passos daqui).
> Depois do go-live, tudo que a Paula faz é self-service:
> `docs/05_FLUXOS/ativar-novo-estabelecimento.md`.

## Pré-requisitos (uma vez, já devem estar de pé)

- [ ] Migrações até a `20260743` aplicadas (a 20260743 foi a última confirmada: "passou")
- [ ] DNS wildcard `*.kora.codes` apontando pra Vercel e `VITE_ROOT_DOMAIN=kora.codes` no build
- [ ] `TENANT_ROOT_DOMAIN=kora.codes` nas Edge Functions (se o Console for usado pra provisionar)

## Passo a passo

### 1. Tenant existe? (SQL bloco 1 — só SELECT)
Se **não** existir: provisionar pelo **Console da Plataforma** (logado como super-admin
`plataforma`) — ele cria o tenant **e** o primeiro usuário da Paula numa operação atômica.
É o caminho preferido; SQL manual só como plano B (`SELECT public.provisionar_tenant(...)`).

### 2. Tema white-label (SQL bloco 2)
Rodar `supabase/SEED_tema_casacoffee.sql` (idempotente) se `tema_aplicado = false`.
Login e sidebar passam a mostrar "Casa Coffee Colab by Kora" com a paleta café/terracota —
e a **aba do navegador** também (fix `aplicarTituloDocumento`, já em produção).

### 3. Plano (SQL bloco 3 — decisão do dono)
Recomendação: **`medio` (Casa Cheia)** — cafeteria com salão usa mesas/comandas/Palm.
Se a Paula for operar só balcão, `simples` cobre. O plano liga os módulos via
`tenant_tem_modulo()`; dá pra trocar depois com a mesma função sem downtime.

### 4. Assinatura fundadora (SQL bloco 4 — decisão do dono)
Preencher o `valor_mensal` com o **preço fundador acordado com a Paula** antes de rodar
(decisão 029: desconto forte em troca de case; preço cheio do Médio na tabela é R$ 349).
O valor NÃO fica no código — só na linha de `assinaturas` do tenant.

### 5. Usuários da Paula (SQL bloco 6 pra conferir)
- **Caminho feliz**: já criado junto no passo 1 pelo Console.
- Se o tenant é antigo e os usuários têm e-mail `@gastromundi.local`: rodar o **cutover**
  (`supabase/CUTOVER_SUBDOMINIO_renomear_auth.sql` — pré-visualização primeiro, janela curta).
- Criando na mão (painel de Auth): `app_metadata` precisa de `tenant_id` e
  `gastro_role: 'dono'` (Paula) — sem isso a RLS não enxerga o tenant dela.
- Equipe (caixa/garçom/cozinha): a própria Paula cria depois, pela **Área Admin** do app.

### 6. RLS — lembrete padrão
Nenhuma tabela nova foi criada neste go-live; as políticas RESTRICTIVE por tenant já
cobrem tudo (migração 20260738/20260739). Se o bloco 1 mostrar algo estranho de acesso,
conferir no painel se RLS está **enabled** em `tenants`, `users`, `assinaturas`.

### 7. Conferência final (SQL bloco 7)
Tudo `true`/preenchido → mandar o link e o login pra Paula. Critério de "operável":
ela loga no subdomínio, vê a marca dela e consegue cadastrar o primeiro produto.

## O que fica com a Paula (self-service, sem a gente)

Cardápio (obrigatório) → meios de pagamento (default já serve) → mesas (se salão) →
equipe → abrir caixa e vender. Detalhe por tela no runbook de ativação.

## Fora do escopo deste go-live

- **NF-e/NFC-e**: add-on (ADR-005) — exige certificado A1 + CSC da Paula (segredos, nunca
  no front/git) e configuração fiscal própria; tratar como projeto à parte quando ela pedir.
- **TEF/maquininha integrada**: add-on pago — decisão de custo do dono (restrições de custo).
- **Cobrança automática**: `assinaturas` é manual por enquanto (bootstrap gratuito).
