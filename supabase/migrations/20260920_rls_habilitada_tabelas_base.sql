-- ════════════════════════════════════════════════════════════════════
-- 20260920 — LIGAR a RLS nas seis tabelas em que ela nunca foi ligada
-- ════════════════════════════════════════════════════════════════════
--
-- PROBLEMA (simulação de ataque, achado nº 1 — o mais grave)
--   No Postgres, `CREATE POLICY` sozinho não protege nada. Enquanto a
--   tabela não tem `ENABLE ROW LEVEL SECURITY`, o planejador ignora
--   TODAS as policies dela: as permissivas e também as RESTRICTIVE.
--   A policy fica escrita, aparece em `pg_policies`, passa em revisão
--   de código — e não vale nada em tempo de execução.
--
--   Seis tabelas estão exatamente nesse estado desde 20240108:
--
--     config        3 policies inertes
--     fechamentos   1 policy  inerte
--     pending       1 policy  inerte
--     products      2 policies inertes
--     sales         1 policy  inerte
--     users         9 policies inertes
--
--   O que isso significa na prática, hoje, em produção:
--
--     • Papel não vale. `sales_all_caixa_up` e `fechamentos_all_caixa_up`
--       existem para deixar só caixa/gerente/admin no faturamento; sem
--       RLS ligada, um GARÇOM lê e escreve venda e fechamento de caixa.
--       `products_write_gerente_admin` idem: garçom reescreve preço.
--     • Tenant não vale. O isolamento multi-tenant da fase 2
--       (20260724, RESTRICTIVE `<t>_tenant_isolamento`) cobre `sales`,
--       `pending`, `products`, `config` e `fechamentos` — inerte junto.
--       Com a chave anon, que é pública por definição, qualquer pessoa
--       logada em QUALQUER estabelecimento lê o cardápio, o caixa e as
--       comandas de TODOS os outros. É o furo mais caro de um SaaS
--       multi-estabelecimento (decisão 017).
--     • Assinatura não vale. O bloqueio por inadimplência (20260720,
--       RESTRICTIVE sobre `public.assinatura_atual_ativa()`) também
--       cobre essas cinco — quem não paga continua operando.
--     • `users` é o pior caso: as nove policies incluem
--       `users_select_self` (cada um vê só a própria linha) e as quatro
--       de admin com clamp de tenant (20260739). Nenhuma valendo, um
--       garçom lista nome, usuário, papel e `auth_id` de todo mundo, de
--       todos os estabelecimentos — a lista de alvos pronta.
--
--   E ninguém percebeu porque o código todo ACREDITA que a RLS está
--   ligada. Dois exemplos de comentário escrito de boa-fé:
--     • 20260744: "o papel `caixa` era barrado pela RLS silenciosamente"
--     • src/context/AppContext.jsx (gravarConfig): "a RLS de config
--       exige gerente/admin — o papel caixa falhava em silêncio"
--   Nenhum dos dois podia ser verdade com a RLS desligada. A migration
--   20260744 foi escrita para consertar um bloqueio que não existia.
--
-- POR QUE LIGAR AGORA É SEGURO (não derruba ninguém)
--   Ligar RLS numa tabela sem policy nenhuma nega tudo. Não é o caso:
--   cada uma das seis tem pelo menos uma policy PERMISSIVE que cobre o
--   uso real do app, e o app já roda assim em produção nas tabelas
--   irmãs. `vendas`, `venda_itens`, `venda_pagamentos`, `lancamentos`,
--   `estoque`, `clientes` e `mesas` carregam a MESMA pilha de policies
--   (permissiva por papel + RESTRICTIVE de tenant + RESTRICTIVE de
--   assinatura), já estão com RLS ligada e funcionam.
--
--   O caminho público do delivery não passa por aqui: o cardápio, a
--   taxa e o pedido do cliente entram por RPC SECURITY DEFINER
--   (`cardapio_publico`, `calcular_taxa_entrega`, `criar_pedido_delivery`),
--   que roda por cima da RLS. Ligar `products` não apaga o cardápio
--   público.
--
--   O que MUDA de comportamento, de propósito, é o papel `garcom`:
--   ele para de enxergar `sales`, `fechamentos` e a lista de usuários.
--   Nenhuma tela dele usa isso — faturamento e fechamento só aparecem
--   em Relatório (permissão `relatorio`, gerência) e no Jarvas
--   (regraDivergenciaCaixa, gerência); a lista de usuários só é lida em
--   Configurações (tela de admin). `pending` continua liberado para
--   todo logado (`pending_all_auth`), então a comanda do garçom não
--   muda em nada.
--
-- CORREÇÃO EXTRA NA MESMA LEVA (senão a Ponte quebra)
--   Com a RLS de `config` valendo de verdade pela primeira vez, o
--   caixa passa a ser barrado nas chaves que não são dele. Uma delas o
--   PDV grava sozinho: `ponte_endereco`. O desktop descobre o endereço
--   da Ponte na rede local e persiste (src/hooks/usePonteLocal.js, no
--   ciclo — "Endereço mudou (IP/token novo)? Grava em config"). Se o
--   caixa não puder gravar, o endereço congela no valor antigo e o
--   Palm do garçom perde a Ponte no dia em que o IP da casa mudar.
--   Então a chave entra na lista do caixa.
--
--   Ela NÃO é liberada para todo logado de propósito: `ponte_endereco`
--   é para onde o celular do garçom aponta quando cai a internet.
--   Quem escreve nela redireciona o Palm da casa inteira. Caixa para
--   cima, como o resto do balcão.
--
-- ⚠️  RLS NO PAINEL: esta migration é o passo que faltava. Depois de
--     rodar, confira em Supabase → Database → Tables que as seis
--     aparecem com "RLS enabled" (o SELECT do fim já responde isso).
--
-- Rodar MANUALMENTE no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Liga a RLS ────────────────────────────────────────────────────
-- ENABLE é idempotente no Postgres (rodar de novo em tabela já ligada
-- não dá erro), então a leva inteira pode ser repetida à vontade.
ALTER TABLE public.config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fechamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;

-- ── 2. Caixa também grava o endereço da Ponte ────────────────────────
-- Substitui a policy de 20260744 acrescentando `ponte_endereco`. As
-- chaves de gestão (meios_pagamento, taxa_servico, metodos_custom,
-- metodos_tef, dias_alerta_validade, limite_sangria, categorias_extra,
-- config_impressao, ponte_local_ativa) seguem só com gerente/admin.
DROP POLICY IF EXISTS "config_write_caixa_sessao" ON public.config;
CREATE POLICY "config_write_caixa_sessao" ON public.config FOR ALL
  USING  (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'caixa'
    AND key IN ('fundo_atual', 'caixa_aberto', 'sessao_aberta_em', 'ponte_endereco')
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'caixa'
    AND key IN ('fundo_atual', 'caixa_aberto', 'sessao_aberta_em', 'ponte_endereco')
  );

-- ── 3. Conferência ───────────────────────────────────────────────────
-- `rls_ligada` tem que sair `true` nas seis linhas. Se sair `false` em
-- alguma, a RLS daquela tabela continua sendo enfeite.
SELECT
  c.relname                                  AS tabela,
  c.relrowsecurity                           AS rls_ligada,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname)           AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('config','fechamentos','pending','products','sales','users')
ORDER BY c.relname;
