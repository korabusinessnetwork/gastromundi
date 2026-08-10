-- =============================================================
-- GastroMundi — Schema de referência
--
-- O QUE ESTE ARQUIVO É: a melhor descrição do banco que se obtém lendo
-- supabase/migrations/*.sql. Revisado em 2026-08-02 (TD016).
--
-- O QUE ELE NÃO É: um dump do banco. O bloco "núcleo operacional" abaixo
-- nasceu de uma leitura direta da produção em 2026-07-04
-- (information_schema + pg_catalog); de lá pra cá o arquivo acompanha as
-- migrations, e ninguém reconferiu contra o banco desde então. Só um
-- `supabase db dump -f supabase/schema.sql --schema public` (exige Docker
-- e a senha do banco) devolve a garantia de que os dois batem.
--
-- Consequência prática: use este arquivo para saber QUE tabela e QUE
-- coluna existem. Para o detalhe exato de uma coluna recém-criada, a
-- migration que a criou é a fonte — ela é que rodou no banco.
--
-- NÃO edite à mão para mudar schema: mudança nasce em
-- supabase/migrations/ e este arquivo é atualizado junto.
-- `src/lib/schemaSqlGuard.test.js` quebra a suíte quando uma tabela nova,
-- um tenant_id novo ou um DROP TABLE não chega aqui.
--
-- ── Migrations descritas aqui que podem NÃO estar no banco ────
-- Entregues em código, aplicação manual pendente pelo dono:
--   20260912_analytics_plataforma.sql          (só funções)
--   20260913_estorno_pagamento_assinatura.sql  (funções + as 3 colunas
--                                               estornado_* de
--                                               assinaturas_pagamentos)
--   20260914_identidade_tenant.sql             (só funções)
--   20260915_alternar_addon_tenant.sql         (só funções)
--
-- ── Convenções de RLS ─────────────────────────────────────────
-- (20240107_rls_por_role.sql; claim corrigido em
--  20260722_fix_jwt_role_claim_v2.sql)
--   auth.role() = 'authenticated'                          → qualquer usuário logado
--   (auth.jwt() -> 'app_metadata' ->> 'gastro_role')        → 'admin' | 'gerente' | 'caixa' | 'garcom' | 'plataforma'
--   NUNCA usar (auth.jwt() ->> 'role') para o papel do app — a raiz
--   `role` do JWT é reservada pelo PostgREST pro role do banco
--   (sempre 'authenticated'); o papel de negócio só existe em
--   app_metadata.gastro_role, injetado pelo custom_access_token_hook
--   (20240105/20240108) a partir de public.users.
--
-- ── Convenção de isolamento por tenant ────────────────────────
-- (20260723/20260724; estendida por 20260726, 20260743 e 20260813)
--   public.tenant_atual_id() → uuid do tenant do usuário logado, lido de
--     app_metadata.tenant_id no JWT. É o DEFAULT da coluna tenant_id em
--     toda tabela isolada — o app nunca envia tenant_id no INSERT.
--   Além da policy de papel, cada tabela isolada tem UMA policy a mais:
--     CREATE POLICY <tabela>_tenant_isolation ON public.<tabela>
--       AS RESTRICTIVE FOR ALL
--       USING (tenant_id = public.tenant_atual_id())
--       WITH CHECK (tenant_id = public.tenant_atual_id());
--   RESTRICTIVE é o ponto: ela não CONCEDE nada, ela SUBTRAI. Some com a
--   policy de papel e o usuário perde o acesso; some com a RESTRICTIVE e
--   ele passa a ver os outros estabelecimentos. As duas precisam existir.
--   public.is_super_admin() → true quando gastro_role = 'plataforma'.
--     O super-admin tem tenant_id NULL (está "acima" dos tenants) e é a
--     única exceção ao isolamento — só nas tabelas da plataforma.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- CAMADA DA PLATAFORMA (SaaS multi-estabelecimento — decisão 017)
-- Estas tabelas NÃO são isoladas por tenant_id: elas descrevem os
-- tenants. Quem escreve nelas é o Console da plataforma (F022), sempre
-- por RPC SECURITY DEFINER guardada por is_super_admin() — várias delas
-- não têm policy de escrita nenhuma, de propósito.
-- =============================================================

-- ── tenants (o estabelecimento) — 20260716_tenants_minimo.sql ──
-- tema: jsonb de white-label (cores, layout, nome de exibição, logo).
-- slug (20260740): identificador de URL, usado pelo delivery público.
CREATE TABLE public.tenants (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         text        NOT NULL,
  tema         jsonb       NOT NULL DEFAULT '{}',
  plano_codigo text        NOT NULL DEFAULT 'avancado' REFERENCES public.planos(codigo), -- 20260717
  slug         text,                                                                     -- 20260740
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── planos / planos_modulos (F013) — 20260717_planos_modulos.sql ──
-- Gating por módulo: o app pergunta "este plano inclui o módulo X?".
CREATE TABLE public.planos (
  codigo text    PRIMARY KEY,
  nome   text    NOT NULL,
  ordem  integer NOT NULL UNIQUE,
  ativo  boolean NOT NULL DEFAULT true
);

CREATE TABLE public.planos_modulos (
  plano_codigo  text NOT NULL REFERENCES public.planos(codigo),
  modulo_codigo text NOT NULL,
  PRIMARY KEY (plano_codigo, modulo_codigo)
);

-- ── addons / tenant_addons (decisão 019) — 20260718_addons.sql ──
-- Add-on é módulo vendido fora do plano (ex.: fiscal). tenant_addons
-- não tem policy de escrita: só a RPC alternar_addon_tenant (20260915).
CREATE TABLE public.addons (
  codigo    text PRIMARY KEY,
  nome      text NOT NULL,
  descricao text
);

CREATE TABLE public.tenant_addons (
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id),
  addon_codigo text        NOT NULL REFERENCES public.addons(codigo),
  ativo        boolean     NOT NULL DEFAULT true,
  ativado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, addon_codigo)
);

-- ── assinaturas (billing manual) — 20260719_assinaturas.sql ────
-- Cobrança é manual (Pix/dinheiro): o Console confirma o pagamento e
-- empurra data_vencimento. status bloqueia o tenant no RLS (20260720).
CREATE TABLE public.assinaturas (
  tenant_id       uuid        PRIMARY KEY REFERENCES public.tenants(id),
  valor_mensal    numeric     NOT NULL DEFAULT 0,
  ciclo_dias      integer     NOT NULL DEFAULT 30,
  data_inicio     date        NOT NULL DEFAULT current_date,
  data_vencimento date        NOT NULL,
  status          text        NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo', 'carencia', 'bloqueado', 'cancelado')),
  carencia_dias   integer     NOT NULL DEFAULT 3,
  ultima_renovacao date,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

-- Histórico de pagamentos da assinatura. As colunas estornado_* vêm da
-- 20260913 (estorno de pagamento) — pendente de aplicação em produção.
CREATE TABLE public.assinaturas_pagamentos (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES public.tenants(id),
  competencia    date        NOT NULL,
  valor          numeric     NOT NULL,
  metodo         text,
  confirmado_por text,
  confirmado_em  timestamptz NOT NULL DEFAULT now(),
  estornado_em   timestamptz,  -- 20260913
  estornado_por  text,         -- 20260913
  estorno_motivo text          -- 20260913
);

-- ── tenant_fiscal_config — 20260731_tenant_fiscal_config.sql ───
-- Configuração fiscal POR ESTABELECIMENTO, preenchida pelo próprio
-- tenant no PainelFiscal (src/components/fiscal/PainelFiscal.jsx), não
-- pelo Console. O certificado A1 e o VALOR do CSC não moram aqui: são
-- secret de servidor (S1-4/F019). csc_id é só o identificador.
CREATE TABLE public.tenant_fiscal_config (
  tenant_id        uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Identidade do emitente
  cnpj             text,
  ie               text,          -- inscrição estadual
  im               text,          -- inscrição municipal (ISS, opcional)
  razao_social     text,
  nome_fantasia    text,
  -- CRT — 1=Simples Nacional, 2=Simples (excesso de sublimite), 3=Normal.
  crt              smallint,
  -- Endereço fiscal do emitente (obrigatório no XML)
  uf               text NOT NULL DEFAULT 'RS',
  codigo_municipio text,          -- IBGE, 7 dígitos
  municipio        text,
  logradouro       text,
  numero_end       text,
  complemento      text,
  bairro           text,
  cep              text,
  fone             text,
  -- Parâmetros de emissão
  ambiente         smallint NOT NULL DEFAULT 2,  -- tpAmb: 1=produção, 2=homologação
  serie            integer  NOT NULL DEFAULT 1,
  proximo_numero   integer  NOT NULL DEFAULT 1,  -- próximo nNF a emitir
  csc_id           text,                         -- idToken do CSC (NÃO o segredo)
  -- Endpoints da SEFAZ (públicos, por UF e ambiente — não são segredo).
  url_qrcode           text,
  url_autorizacao      text,
  url_recepcao_evento  text,  -- 20260734
  url_inutilizacao     text,  -- 20260736
  -- Contingência offline (20260737)
  contingencia_ativa   boolean NOT NULL DEFAULT false,
  contingencia_desde   timestamptz,
  -- Só emite de verdade quando configurado e ligado de propósito.
  ativo            boolean  NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_fiscal_crt_valido      CHECK (crt IS NULL OR crt IN (1, 2, 3)),
  CONSTRAINT tenant_fiscal_ambiente_valido CHECK (ambiente IN (1, 2)),
  CONSTRAINT tenant_fiscal_serie_positiva  CHECK (serie >= 1),
  CONSTRAINT tenant_fiscal_numero_positivo CHECK (proximo_numero >= 1)
);

-- ── ia_uso (rate limit do Jarvas) — 20260817_ia_uso_rate_limit.sql ──
-- Uma linha por tenant/dia. Existe porque chamada de IA custa dinheiro.
CREATE TABLE public.ia_uso (
  tenant_id  uuid        NOT NULL DEFAULT public.tenant_atual_id(),
  dia        date        NOT NULL DEFAULT current_date,
  chamadas   integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, dia)
);

-- =============================================================
-- NÚCLEO OPERACIONAL
-- Todas as tabelas desta seção são isoladas por tenant_id
-- (20260724_multitenant_fase2_isolamento.sql): coluna NOT NULL com
-- DEFAULT public.tenant_atual_id() e policy RESTRICTIVE de isolamento.
-- =============================================================

-- ── users (papéis e vínculo com Supabase Auth) ────────────────
-- Senhas vivem SOMENTE em auth.users (coluna password foi removida
-- na migração 20240107; credenciais legíveis removidas em 20260704).
-- tenant_id (20260723) é NULLABLE aqui de propósito: o super-admin da
-- plataforma não pertence a estabelecimento nenhum.
CREATE TABLE public.users (
  id        bigint  PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  name      text    NOT NULL,
  username  text    NOT NULL UNIQUE,
  role      text    NOT NULL,
  active    boolean NOT NULL DEFAULT true,
  auth_id   uuid    UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id uuid    REFERENCES public.tenants(id)  -- 20260723; NULL = plataforma
);

-- ── products ──────────────────────────────────────────────────
-- (SEM as colunas legadas unidade_compra/fator_compra_estoque/
--  detalhamento_compra que a versão antiga deste arquivo listava)
CREATE TABLE public.products (
  id                    bigint  PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  name                  text    NOT NULL,
  price                 numeric NOT NULL,
  category              text    NOT NULL,
  emoji                 text,
  active                boolean NOT NULL DEFAULT true,
  unidades_compra       jsonb   NOT NULL DEFAULT '[]',
  unidade_estoque       text    NOT NULL DEFAULT 'un',
  unidade_consumo       text,
  fator_consumo_estoque numeric DEFAULT 1,
  produzivel            boolean NOT NULL DEFAULT true, -- F015, 20260721_produtos_produzivel.sql
  validade_dias         integer,                       -- C1, 20260731_produtos_validade.sql
  proxima_validade      date,                          -- C1, 20260731_produtos_validade.sql
  codigo_barras         text,                          -- 20260745_produtos_codigo_barras.sql
  tenant_id             uuid    NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

-- ── pending (pedidos em aberto — Realtime habilitado) ─────────
CREATE TABLE public.pending (
  id         text  PRIMARY KEY,
  comanda    text,
  items      jsonb NOT NULL DEFAULT '[]',
  status     text  NOT NULL DEFAULT 'open',
  note       text,
  total      numeric,
  garcom     text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  mesa       text,
  apelido    text,
  tenant_id  uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

-- ── sales (vendas finalizadas — payload JSONB; ver TD009) ─────
-- TD009 etapa 2: sales mantida como gravação de backup (dual-write).
-- O app já NÃO lê mais daqui — leituras vêm de vendas/venda_itens/venda_pagamentos.
CREATE TABLE public.sales (
  id        text  PRIMARY KEY,
  data      jsonb NOT NULL DEFAULT '{}',
  at        timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid  NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

-- ── vendas / venda_itens / venda_pagamentos ───────────────────
-- TD009 etapa 1 — gravação dupla (supabase/migrations/20260707_vendas_normalizadas.sql).
-- TD009 etapa 2 (supabase/migrations/20260708_backfill_vendas.sql) — backfill
-- do histórico e inversão da fonte de verdade: as LEITURAS (bootstrap do
-- AppContext, assistente do Jarvas) agora vêm destas tabelas; sales
-- segue recebendo a gravação dupla como backup até uma futura etapa 3.
CREATE TABLE public.vendas (
  id           text        PRIMARY KEY,
  comanda      text,
  mesa         text,
  subtotal     numeric,
  taxa_servico boolean     NOT NULL DEFAULT false,
  valor_taxa   numeric     NOT NULL DEFAULT 0,
  valor_ajuste numeric     NOT NULL DEFAULT 0,
  total        numeric     NOT NULL,
  cashier      text,
  cliente_id   uuid        REFERENCES public.clientes(id) ON DELETE SET NULL, -- F010, 20260713_clientes.sql
  at           timestamptz NOT NULL DEFAULT now(),
  tenant_id    uuid        NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

CREATE TABLE public.venda_itens (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id            text    NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  product_id          bigint  REFERENCES public.products(id) ON DELETE SET NULL,
  nome                text    NOT NULL,
  preco               numeric NOT NULL,
  qtd                 numeric NOT NULL DEFAULT 1,
  cancelado           boolean NOT NULL DEFAULT false,
  motivo_cancelamento text,
  cancelado_por       text,
  tenant_id           uuid    NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);
CREATE INDEX venda_itens_venda_id_idx   ON public.venda_itens (venda_id);
CREATE INDEX venda_itens_product_id_idx ON public.venda_itens (product_id);

CREATE TABLE public.venda_pagamentos (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id  text    NOT NULL REFERENCES public.vendas(id) ON DELETE CASCADE,
  metodo    text    NOT NULL,
  valor     numeric NOT NULL,
  tenant_id uuid    NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);
CREATE INDEX venda_pagamentos_venda_id_idx ON public.venda_pagamentos (venda_id);
CREATE INDEX venda_pagamentos_metodo_idx   ON public.venda_pagamentos (metodo);
CREATE INDEX vendas_at_idx ON public.vendas (at DESC);

-- ── lancamentos (Financeiro fase 1 — docs/03_REGRAS_DE_NEGOCIO/FINANCEIRO.md) ──
-- Receita automática nasce de venda.finalizada (por pagamento); fiado
-- vira conta a receber (status 'previsto'). NÃO inclui nesta fase:
-- estorno/reversão, margem por custo de estoque, DRE, centros de custo.
CREATE TABLE public.lancamentos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        text        NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  categoria   text        NOT NULL,
  descricao   text,
  valor       numeric     NOT NULL CHECK (valor > 0),
  competencia date        NOT NULL,
  vencimento  date,
  status      text        NOT NULL DEFAULT 'previsto' CHECK (status IN ('previsto', 'pago', 'recebido', 'vencido')),
  origem      text        NOT NULL DEFAULT 'manual' CHECK (origem IN ('venda', 'manual', 'estoque')),
  venda_id    text        REFERENCES public.vendas(id) ON DELETE SET NULL,
  cliente_id  uuid        REFERENCES public.clientes(id) ON DELETE SET NULL, -- F010, 20260713_clientes.sql
  retroativo  boolean     NOT NULL DEFAULT false,
  criado_por  text,
  baixado_por text,
  baixado_em  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  tenant_id   uuid        NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);
CREATE INDEX lancamentos_competencia_idx ON public.lancamentos (competencia);
CREATE INDEX lancamentos_status_idx      ON public.lancamentos (status);
CREATE INDEX lancamentos_tipo_idx         ON public.lancamentos (tipo);
CREATE INDEX lancamentos_venda_id_idx     ON public.lancamentos (venda_id);
CREATE INDEX lancamentos_cliente_id_idx   ON public.lancamentos (cliente_id);

-- ── clientes (F010 — docs/03_REGRAS_DE_NEGOCIO/CLIENTES.md) ───
-- Cadastro, histórico de compras (via vendas.cliente_id) e fiado
-- (via lancamentos.cliente_id — o fiado em si já existe como conta a
-- receber no Financeiro; esta tabela só acrescenta o vínculo).
-- documento/documento_tipo: CPF ou CNPJ opcional (só dígitos, sem máscara;
-- o tipo é escolhido no toggle do cadastro). Ver migration 20260825.
CREATE TABLE public.clientes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text        NOT NULL,
  telefone       text,
  documento      text,
  documento_tipo text        CHECK (documento_tipo IS NULL OR documento_tipo IN ('cpf','cnpj')),
  endereco       text,
  observacoes    text,
  anonimizado    boolean     NOT NULL DEFAULT false,
  criado_por     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  tenant_id      uuid        NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);
CREATE INDEX clientes_nome_idx      ON public.clientes (nome);
CREATE INDEX clientes_telefone_idx  ON public.clientes (telefone);
CREATE INDEX clientes_documento_idx ON public.clientes (documento);

-- ── fechamentos ───────────────────────────────────────────────
CREATE TABLE public.fechamentos (
  id         bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  data       jsonb  NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id  uuid   NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

-- ── config (chave/valor de configurações do caixa) ────────────
-- Keys atuais: fundo_atual, caixa_aberto, sessao_aberta_em,
-- meios_pagamento, taxa_servico, metodos_custom, limite_sangria (20260916).
-- (keys 'credentials' e 'estoque' foram removidas — 20260704/20260705)
-- PK composta desde 20260738: a chave natural `key` era global e o 2º
-- tenant colidiria em 'caixa_aberto' sem sequer enxergar a linha do 1º.
CREATE TABLE public.config (
  key       text  NOT NULL,
  value     jsonb NOT NULL,
  tenant_id uuid  NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id), -- 20260724
  PRIMARY KEY (tenant_id, key)  -- 20260738
);

-- ── caixa_movimentos — 20260916_caixa_movimentos.sql (F005) ───
-- Sangria (dinheiro sai da gaveta) e suprimento (reforço de troco) da
-- sessão de caixa. Entram no valor esperado do fechamento:
--   esperado = fundo + entradas em dinheiro + suprimentos − sangrias.
-- Sem policy de UPDATE nem de DELETE, de propósito: é trilha de
-- auditoria. Errou o valor? Registra o movimento inverso.
CREATE TABLE public.caixa_movimentos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id),
  tipo             text        NOT NULL,   -- CHECK: 'sangria' | 'suprimento'
  valor            numeric     NOT NULL,   -- CHECK: > 0 (o sinal está no tipo)
  motivo           text        NOT NULL,
  autor            text        NOT NULL,   -- username, mesma chave do activity_log
  autorizado_por   text,                   -- só quando passou do limite_sangria
  sessao_aberta_em timestamptz,            -- recorte da sessão para o fechamento
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX caixa_movimentos_sessao_idx ON public.caixa_movimentos (tenant_id, created_at DESC);

-- ── operator_logs (auditoria fire-and-forget) ─────────────────
CREATE TABLE public.operator_logs (
  id          bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  operator_id text   NOT NULL,
  action_type text   NOT NULL,
  payload     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  tenant_id   uuid   NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);
CREATE INDEX operator_logs_operator_id_idx ON public.operator_logs (operator_id);
CREATE INDEX operator_logs_action_type_idx ON public.operator_logs (action_type);
CREATE INDEX operator_logs_created_at_idx  ON public.operator_logs (created_at DESC);

-- ── unidades_medida ───────────────────────────────────────────
-- Isolada por tenant só em 20260813 (ficou de fora das 24 da 20260724).
CREATE TABLE public.unidades_medida (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  abreviacao text NOT NULL,
  tipo       text NOT NULL,  -- estoque | compra | consumo
  ordem      integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  tenant_id  uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260813
);

-- ── notas_fiscais / itens / entradas de estoque ───────────────
-- (nota fiscal de ENTRADA — compra de fornecedor. Nota de saída/NFC-e
--  é outra história: ver nfce_emitidas.)
CREATE TABLE public.notas_fiscais (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_acesso    text UNIQUE,
  numero          text,
  serie           text,
  data_emissao    date,
  fornecedor_nome text,
  fornecedor_cnpj text,
  valor_total     numeric,
  origem          text DEFAULT 'xml',
  status          text DEFAULT 'importada',
  xml_raw         text,
  created_at      timestamptz DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

CREATE TABLE public.notas_fiscais_itens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_fiscal_id     uuid   REFERENCES public.notas_fiscais(id) ON DELETE CASCADE,
  product_id         bigint REFERENCES public.products(id) ON DELETE SET NULL,
  descricao_xml      text,
  codigo_xml         text,
  unidade_xml        text,
  quantidade         numeric,
  preco_unitario     numeric,
  preco_total        numeric,
  fator_conversao    numeric DEFAULT 1,
  quantidade_estoque numeric,
  tenant_id          uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

CREATE TABLE public.estoque_entradas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     bigint REFERENCES public.products(id) ON DELETE CASCADE,
  nota_fiscal_id uuid   REFERENCES public.notas_fiscais(id) ON DELETE SET NULL,
  quantidade     numeric,
  preco_unitario numeric,
  data_entrada   date DEFAULT CURRENT_DATE,
  observacao     text,
  created_at     timestamptz DEFAULT now(),
  tenant_id      uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

-- ── itens_fiscal (dados fiscais por produto) ──────────────────
CREATE TABLE public.itens_fiscal (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id            bigint NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  ncm                text,
  cest               text,
  cfop               text,
  origem_mercadoria  text,
  csosn              text,
  cst_icms           text,
  aliquota_icms      numeric DEFAULT 0,
  reducao_base_icms  numeric DEFAULT 0,
  cst_ipi            text,
  aliquota_ipi       numeric DEFAULT 0,
  cst_pis            text,
  aliquota_pis       numeric DEFAULT 0,
  cst_cofins         text,
  aliquota_cofins    numeric DEFAULT 0,
  aliquota_ibs       numeric DEFAULT 0,
  aliquota_cbs       numeric DEFAULT 0,
  aliquota_is        numeric DEFAULT 0,
  regime_tributario  text DEFAULT 'simples',
  observacao_fiscal  text,
  updated_at         timestamptz DEFAULT now(),
  tenant_id          uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

-- ── subprodutos / combos ──────────────────────────────────────
CREATE TABLE public.subprodutos (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text    NOT NULL,
  categoria        text,
  preco            numeric NOT NULL DEFAULT 0,
  unidade_medida   text,
  controla_estoque boolean NOT NULL DEFAULT false,
  ativo            boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  tenant_id        uuid    NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

CREATE TABLE public.combos (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text    NOT NULL,
  item_principal_id bigint  NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  modo              text    NOT NULL DEFAULT 'combo',
  preco_total       numeric,
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  tenant_id         uuid    NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

CREATE TABLE public.combo_subprodutos (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id          uuid    NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
  subproduto_id     uuid    NOT NULL REFERENCES public.subprodutos(id),
  quantidade        integer NOT NULL DEFAULT 1,
  preco_customizado numeric,
  created_at        timestamptz NOT NULL DEFAULT now(),
  tenant_id         uuid    NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

-- combo_produtos — 20260726_combo_produtos.sql. O combo passou a agregar
-- vários PRODUTOS do catálogo (cada um baixa o próprio estoque), não só
-- subprodutos. Nasceu depois da 20260724, então a própria migration
-- replicou o isolamento por tenant que a lista das 24 não cobria.
CREATE TABLE public.combo_produtos (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id          uuid          NOT NULL REFERENCES public.combos(id) ON DELETE CASCADE,
  produto_id        bigint        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantidade        integer       NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  preco_customizado numeric(10,2) CHECK (preco_customizado IS NULL OR preco_customizado >= 0),
  created_at        timestamptz   NOT NULL DEFAULT now(),
  tenant_id         uuid          NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id),
  UNIQUE (combo_id, produto_id)
);
CREATE INDEX idx_combo_produtos_combo   ON public.combo_produtos (combo_id);
CREATE INDEX idx_combo_produtos_produto ON public.combo_produtos (produto_id);

-- ── impressão (locais e roteamento por categoria) ─────────────
CREATE TABLE public.locais_impressao (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  descricao  text,
  ativo      boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  tenant_id  uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

-- UNIQUE composta desde 20260738 (era UNIQUE(categoria), global).
CREATE TABLE public.categorias_roteamento (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria          text NOT NULL,
  local_impressao_id uuid REFERENCES public.locais_impressao(id) ON DELETE SET NULL,
  updated_at         timestamptz DEFAULT now(),
  tenant_id          uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id), -- 20260724
  CONSTRAINT categorias_roteamento_tenant_categoria_key UNIQUE (tenant_id, categoria)  -- 20260738
);

-- ── estacoes (F020) — 20260823_estacoes_impressao.sql ─────────
-- Uma estação = um computador com a Ponte KORA rodando. impressoras
-- mapeia local_impressao_id → nome da impressora daquela máquina.
CREATE TABLE public.estacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id),
  nome        text NOT NULL,
  impressoras jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { [local_impressao_id]: { "nome": "<impressora>" } }
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- ── trabalhos_impressao — 20260824_trabalhos_impressao.sql ────
-- Fila de impressão: o app enfileira, a Ponte KORA consome. É o que
-- faz a comanda sair mesmo quando a impressora está em outra máquina.
CREATE TABLE public.trabalhos_impressao (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id),
  local_impressao_id uuid NOT NULL,
  documento          jsonb NOT NULL,
  status             text NOT NULL DEFAULT 'pendente',  -- pendente → processando → impresso | erro
  tentativas         int  NOT NULL DEFAULT 0,
  erro               text,
  estacao_id         uuid,
  criado_em          timestamptz DEFAULT now(),
  atualizado_em      timestamptz DEFAULT now(),
  impresso_em        timestamptz
);

-- ── mesas (layout físico; status derivado no front) ───────────
-- PK composta desde 20260738 (mesa "1" existe em todo estabelecimento).
CREATE TABLE public.mesas (
  numero        text NOT NULL,
  capacidade    integer DEFAULT 4,
  posicao_x     integer,
  posicao_y     integer,
  status_manual text DEFAULT 'livre',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  tenant_id     uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id), -- 20260724
  PRIMARY KEY (tenant_id, numero)  -- 20260738
);

-- ── estoque (uma linha por produto — migração 20260705) ───────
CREATE TABLE public.estoque (
  produto_id bigint  PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  quantidade numeric NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  minimo     numeric NOT NULL DEFAULT 10 CHECK (minimo >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id  uuid    NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);

-- ── estoque_subprodutos — 20260748_estoque_subprodutos.sql ────
-- O espelho de `estoque` para o que não é produto de catálogo.
CREATE TABLE public.estoque_subprodutos (
  subproduto_id uuid    PRIMARY KEY REFERENCES public.subprodutos(id) ON DELETE CASCADE,
  quantidade    numeric NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  minimo        numeric NOT NULL DEFAULT 10 CHECK (minimo >= 0),
  tenant_id     uuid    NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── estoque_baixas_aplicadas — 20260830_idempotencia_baixa_estoque.sql ──
-- Idempotência da baixa: op_id é a PK, então reenviar a mesma operação
-- (retry de rede, clique duplo) não baixa o estoque duas vezes.
-- tipo (20260901) distingue 'baixa' de 'estorno'.
CREATE TABLE public.estoque_baixas_aplicadas (
  op_id         uuid    PRIMARY KEY,
  tenant_id     uuid,
  produto_id    bigint,
  subproduto_id uuid,
  qtd           numeric NOT NULL,
  aplicada_em   timestamptz NOT NULL DEFAULT now(),
  tipo          text    NOT NULL DEFAULT 'baixa'  -- 20260901
);

-- ── grupos_categoria / categoria_grupo — 20260732 ─────────────
-- Agrupa categorias do cardápio (ex.: "Bebidas" reúne Refrigerante,
-- Suco, Cerveja). Isoladas por tenant só em 20260743.
CREATE TABLE public.grupos_categoria (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome       text   NOT NULL,
  created_at timestamptz DEFAULT now(),
  tenant_id  uuid   NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id), -- 20260743
  CONSTRAINT grupos_categoria_tenant_nome_key UNIQUE (tenant_id, nome)  -- 20260743
);

CREATE TABLE public.categoria_grupo (
  category   text   NOT NULL,
  grupo_id   bigint NOT NULL REFERENCES public.grupos_categoria(id) ON DELETE CASCADE,
  updated_at timestamptz DEFAULT now(),
  tenant_id  uuid   NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id), -- 20260743
  PRIMARY KEY (tenant_id, category)  -- 20260743
);

-- ── role_permissions — 20260828_permissoes_por_cargo_e_funcionario.sql ──
-- Permissões por cargo, sobrescrevendo o default do papel, por tenant.
CREATE TABLE public.role_permissions (
  tenant_id   uuid  NOT NULL DEFAULT public.tenant_atual_id(),
  role        text  NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role)
);

-- ── senha_admin_tentativas — 20260802_leva16_hardening_rpcs.sql ──
-- Rate limit da senha de gerente: N falhas na janela e a RPC recusa.
CREATE TABLE public.senha_admin_tentativas (
  auth_id       uuid    PRIMARY KEY,
  falhas        integer NOT NULL DEFAULT 0,
  janela_inicio timestamptz NOT NULL DEFAULT now()
);

-- ── login_tentativas — 20260920_login_rate_limit_servidor.sql ──
-- Rate limit do login em si (TD008): antes ele era decidido só no navegador,
-- com o contador em localStorage. A chave é o e-mail com namespace do tenant
-- (usuario@slug.local), então a contagem é por usuário E por estabelecimento.
CREATE TABLE public.login_tentativas (
  email         text        PRIMARY KEY,
  falhas        integer     NOT NULL DEFAULT 0,
  janela_inicio timestamptz NOT NULL DEFAULT now(),
  bloqueado_ate timestamptz
);

-- ── Jarvas (eventos + insights — migração 20260703) ───────────
CREATE TABLE public.jarvas_eventos (
  id          bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
  tipo        text   NOT NULL,
  modulo      text   NOT NULL,
  payload     jsonb  NOT NULL DEFAULT '{}',
  operator_id text,
  processado  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  tenant_id   uuid   NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);
CREATE INDEX jarvas_eventos_tipo_idx       ON public.jarvas_eventos (tipo);
CREATE INDEX jarvas_eventos_processado_idx ON public.jarvas_eventos (processado, created_at);
CREATE INDEX jarvas_eventos_created_at_idx ON public.jarvas_eventos (created_at DESC);

CREATE TABLE public.jarvas_insights (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL CHECK (tipo IN ('insight', 'alerta', 'sugestao')),
  severidade   text NOT NULL DEFAULT 'info' CHECK (severidade IN ('info', 'warning', 'danger')),
  visibilidade text NOT NULL DEFAULT 'operacional' CHECK (visibilidade IN ('operacional', 'estrategico')),
  modulo       text NOT NULL,
  titulo       text NOT NULL,
  descricao    text NOT NULL,
  acao         jsonb,
  origem       jsonb NOT NULL DEFAULT '{}',
  status       text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'lido', 'descartado', 'executado')),
  status_por   text,
  status_em    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  tenant_id    uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) -- 20260724
);
CREATE INDEX jarvas_insights_status_idx     ON public.jarvas_insights (status, created_at DESC);
CREATE INDEX jarvas_insights_tipo_idx       ON public.jarvas_insights (tipo);
CREATE INDEX jarvas_insights_created_at_idx ON public.jarvas_insights (created_at DESC);

-- =============================================================
-- DELIVERY (F016 — 20260804_delivery_fundacao.sql e sucessoras)
-- Cardápio público por tenant (slug), carrinho e pedido. Tudo isolado
-- por tenant_id; a leitura pública do cardápio é o único caminho que
-- roda sem usuário logado.
-- =============================================================

CREATE TABLE public.config_delivery (
  tenant_id                 uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  aberto                    boolean NOT NULL DEFAULT false,
  pedido_minimo             numeric NOT NULL DEFAULT 0,
  tempo_preparo_min         integer NOT NULL DEFAULT 30,
  horario                   jsonb   NOT NULL DEFAULT '{}',
  faixas_taxa               jsonb   NOT NULL DEFAULT '[]',
  updated_at                timestamptz NOT NULL DEFAULT now(),
  origem_lat                numeric,  -- 20260810
  origem_lng                numeric,  -- 20260810
  endereco_origem           text,     -- 20260811
  endereco_origem_bloqueado boolean NOT NULL DEFAULT false,                    -- 20260827
  fuso                      text    NOT NULL DEFAULT 'America/Sao_Paulo'       -- 20260903
);

CREATE TABLE public.delivery_pedidos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  numero               text NOT NULL,
  cliente_nome         text NOT NULL,
  cliente_telefone     text,
  cep                  text,
  bairro               text,
  endereco             text NOT NULL,
  complemento_endereco text,
  subtotal             numeric NOT NULL,
  taxa_entrega         numeric NOT NULL DEFAULT 0,
  total                numeric NOT NULL,
  forma_pagamento      text NOT NULL,
  troco_para           numeric,
  levar_maquininha     boolean NOT NULL DEFAULT false,
  status               text NOT NULL DEFAULT 'recebido',
  pending_id           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  entrega_lat          numeric,  -- 20260810
  entrega_lng          numeric   -- 20260810
);

CREATE TABLE public.delivery_pedido_itens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pedido_id    uuid NOT NULL REFERENCES public.delivery_pedidos(id) ON DELETE CASCADE,
  produto_id   bigint REFERENCES public.products(id) ON DELETE SET NULL,
  combo_id     uuid   REFERENCES public.combos(id) ON DELETE SET NULL,
  nome         text NOT NULL,
  qtd          integer NOT NULL DEFAULT 1,
  preco_unit   numeric NOT NULL,
  complementos jsonb NOT NULL DEFAULT '[]',
  obs          text
);

-- Vitrine do produto no delivery: foto, descrição e disponibilidade
-- separadas do cadastro do PDV (o mesmo produto pode estar ativo no
-- salão e esgotado no delivery).
CREATE TABLE public.produto_delivery (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  produto_id bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  foto_url   text,
  descricao  text,
  disponivel boolean NOT NULL DEFAULT true,
  ordem      integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, produto_id)
);

-- ── complementos (adicionais do delivery) ─────────────────────
CREATE TABLE public.grupos_complemento (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  produto_id   bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  min_escolhas integer NOT NULL DEFAULT 0,
  max_escolhas integer NOT NULL DEFAULT 1,
  ordem        integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.complementos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  grupo_id   uuid NOT NULL REFERENCES public.grupos_complemento(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  preco      numeric NOT NULL DEFAULT 0,
  disponivel boolean NOT NULL DEFAULT true,
  ordem      integer NOT NULL DEFAULT 0,
  produto_id bigint REFERENCES public.products(id) ON DELETE SET NULL  -- 20260808
);

-- Reuso de grupo entre produtos (20260809) — antes cada grupo pertencia
-- a um produto só e era preciso recriar "Ponto da carne" em cada prato.
CREATE TABLE public.produto_grupos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  produto_id bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  grupo_id   uuid NOT NULL REFERENCES public.grupos_complemento(id) ON DELETE CASCADE,
  ordem      integer NOT NULL DEFAULT 0,
  UNIQUE (produto_id, grupo_id)
);

-- Subgrupos (20260822): grupo que abre outro grupo. O CHECK impede o
-- auto-vínculo; ciclos mais longos são barrados no código.
CREATE TABLE public.grupo_subgrupos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT public.tenant_atual_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  grupo_pai_id   uuid NOT NULL REFERENCES public.grupos_complemento(id) ON DELETE CASCADE,
  grupo_filho_id uuid NOT NULL REFERENCES public.grupos_complemento(id) ON DELETE CASCADE,
  ordem          integer NOT NULL DEFAULT 0,
  UNIQUE (grupo_pai_id, grupo_filho_id),
  CONSTRAINT grupo_subgrupos_sem_auto CHECK (grupo_pai_id <> grupo_filho_id)
);

-- =============================================================
-- FISCAL — NFC-e (F019 / S1-4)
-- A emissão em si depende de certificado A1 e do valor do CSC, que são
-- secret de servidor e ainda não existem. Estas tabelas guardam o que
-- foi (ou seria) transmitido.
-- =============================================================

CREATE TABLE public.nfce_emitidas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  venda_id      uuid,      -- null em reenvio avulso / sem venda
  chave         text,      -- 44 dígitos
  numero        integer,   -- nNF
  serie         integer,
  -- autorizada | rejeitada | pendente (fila de contingência) | cancelada
  status        text NOT NULL,
  tp_amb        smallint,  -- 1=produção, 2=homologação
  tp_emis       smallint,  -- 1=normal, 9=contingência offline
  protocolo     text,
  c_stat        text,
  x_motivo      text,
  v_nf          numeric(12,2),
  dh_emi        timestamptz,
  url_qrcode    text,      -- QR já hasheado no servidor — não expõe o CSC
  -- xml_tipo: 'proc' = nfeProc autorizado (reimpressão);
  --           'assinado' = aguardando retransmissão.
  xml           text,
  xml_tipo      text,
  tentativas    integer NOT NULL DEFAULT 0,
  motivo        text,              -- por que entrou na fila
  transmitida_em timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  cancelada_em                timestamptz,  -- 20260734
  justificativa_cancelamento  text,         -- 20260734
  protocolo_cancelamento      text,         -- 20260734
  xml_evento                  text,         -- 20260734
  CONSTRAINT nfce_emitidas_status_valido
    CHECK (status IN ('autorizada', 'rejeitada', 'pendente', 'cancelada')),
  CONSTRAINT nfce_emitidas_xml_tipo_valido
    CHECK (xml_tipo IS NULL OR xml_tipo IN ('proc', 'assinado')),
  -- Idempotência: uma nota (chave) por tenant. A Edge usa
  -- ON CONFLICT (tenant_id, chave) para não duplicar num reenvio.
  CONSTRAINT nfce_emitidas_chave_unica UNIQUE (tenant_id, chave)
);

CREATE TABLE public.nfce_inutilizacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL DEFAULT public.tenant_atual_id()
                  REFERENCES public.tenants(id) ON DELETE CASCADE,
  serie         integer  NOT NULL,
  nnf_ini       integer  NOT NULL,
  nnf_fin       integer  NOT NULL,
  ano           smallint NOT NULL,  -- AA (2 dígitos)
  justificativa text     NOT NULL,  -- 15–255 caracteres
  tp_amb        smallint,
  status        text NOT NULL,      -- inutilizada (cStat 102) | rejeitada
  protocolo     text,               -- nProt
  c_stat        text,
  x_motivo      text,
  xml           text,               -- procInutNFe
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nfce_inut_faixa_valida   CHECK (nnf_fin >= nnf_ini),
  CONSTRAINT nfce_inut_serie_valida   CHECK (serie >= 0),
  CONSTRAINT nfce_inut_tp_amb_valido  CHECK (tp_amb IS NULL OR tp_amb IN (1, 2)),
  CONSTRAINT nfce_inut_status_valido  CHECK (status IN ('inutilizada', 'rejeitada'))
);

-- =============================================================
-- TABELAS QUE JÁ EXISTIRAM E NÃO EXISTEM MAIS
-- =============================================================
-- public.logs → derrubada em 20260706_drop_logs.sql (substituída por
--   operator_logs). Não recriar: o guard falha se ela voltar a aparecer
--   descrita aqui sem uma migration que a recrie.

-- =============================================================
-- FUNÇÕES (definições completas nas migrações indicadas)
-- =============================================================
-- verificar_senha_admin(p_password text, p_username text)  → 20240106_rpc_verificar_senha.sql
--   (rate limit por auth_id em senha_admin_tentativas — 20260802)
-- registrar_tentativa_login(p_email text, p_senha text)    → 20260920_login_rate_limit_servidor.sql
--   (trava de login no servidor — TD008. Confere a senha com crypt para o
--    contador andar por falha REAL; senha certa sempre passa e zera o
--    contador, senão a trava viraria arma contra o próprio cliente.
--    `anon` executa de propósito: isto roda antes de existir sessão.)
-- custom_access_token_hook(event jsonb)                    → 20240105 + 20240108 (claim `role` no JWT)
--   (passou a injetar também tenant_id em app_metadata — 20260723)
-- limpar_reserva_mesa(mesa_numero text)                    → 20260702_rpc_limpar_reserva_mesa.sql
-- baixar_estoque(p_produto_id bigint, p_qtd numeric)       → 20260705_estoque_tabela.sql ; 20260712_estoque_alerta_minimo.sql
--   (SECURITY DEFINER com checagem de role caixa/gerente/admin)
--   RETURNS TABLE (quantidade numeric, minimo numeric) desde 20260712 — antes RETURNS void (F008)
--   Idempotente por op_id desde 20260830 (estoque_baixas_aplicadas)
-- jarvas_resumo_vendas(p_desde timestamptz, p_limite_produtos int) → 20260709_jarvas_resumo_vendas.sql
--   (agregação SQL de vendas 30d/top produtos para o assistente do Jarvas — TD009 etapa 2)
-- relatorio_vendas(p_inicio timestamptz, p_fim timestamptz, p_limite_produtos int) → 20260714_relatorio_vendas.sql
--   (faturamento/nº vendas/série diária/por método/top produtos por período — F011, Relatórios)
--
-- ── Multi-tenant ─────────────────────────────────────────────
-- tenant_atual_id()          → 20260716 ; lê app_metadata.tenant_id do JWT desde 20260725
-- is_super_admin()           → gastro_role = 'plataforma' (Leva 4 do Console)
-- plano_do_tenant() / tenant_tem_modulo(text) → 20260717_planos_modulos.sql
-- assinatura_ativa()         → 20260720 ; usada nas policies para bloquear tenant inadimplente
--
-- ── Console da plataforma (F022) — todas SECURITY DEFINER com
--    guarda is_super_admin() e REVOKE de PUBLIC/anon ───────────
-- provisionar_tenant(text, text, text, jsonb) → 20260727 ; slug em 20260741 ;
--   cria a assinatura junto desde 20260908 ; semeia grupos_categoria e
--   unidades_medida desde 20260917  (aplicada 2026-08-02)
-- alterar_plano_tenant / alterar_mensalidade_tenant           → 20260728 / 20260801
-- alterar_layout_tenant(uuid, text)                           → 20260801
-- confirmar_pagamento_assinatura(...)                         → 20260719 e sucessoras
-- confirmar_renovacao_assinatura(uuid, numeric, text)         → 20260911 (recusa p_valor <= 0)
-- analytics_plataforma(...)                                   → 20260912  (aplicada 2026-08-02)
-- estornar_pagamento_assinatura(uuid, text, text)             → 20260913  (aplicada 2026-08-02)
-- atualizar_identidade_tenant(text, text)                     → 20260914  (aplicada 2026-08-02)
--   sem parâmetro de tenant de propósito: o alvo é sempre tenant_do_usuario_atual()
-- alternar_addon_tenant(uuid, text, boolean)                  → 20260915  (aplicada 2026-08-02)

-- =============================================================
-- ROW LEVEL SECURITY
-- Definições completas: 20240107_rls_por_role.sql, 20260701_mesas.sql,
-- 20260703_jarvas.sql, 20260705_estoque_tabela.sql, 20260724 (isolamento
-- por tenant), 20260739 (users), 20260804 (delivery).
-- Toda tabela do núcleo operacional tem, ALÉM da policy de papel abaixo,
-- a policy RESTRICTIVE <tabela>_tenant_isolation descrita no cabeçalho.
-- =============================================================
-- users                 → users_{select,insert,update,delete}_admin (só admin) ; RLS por tenant em 20260739
-- products              → products_select_auth ; products_write_gerente_admin
-- pending               → pending_all_auth (qualquer logado)
-- sales                 → sales_all_caixa_up (caixa/gerente/admin)
-- vendas                → vendas_all_caixa_up (caixa/gerente/admin) — TD009 etapa 1
-- venda_itens           → venda_itens_all_caixa_up (caixa/gerente/admin) — TD009 etapa 1
-- venda_pagamentos      → venda_pagamentos_all_caixa_up (caixa/gerente/admin) — TD009 etapa 1
-- fechamentos           → fechamentos_all_caixa_up (caixa/gerente/admin)
-- caixa_movimentos      → caixa_movimentos_select_auth ; caixa_movimentos_insert_operacao (admin/gerente/caixa) ; caixa_movimentos_tenant_isolation (RESTRICTIVE) — 20260916 (F005). SEM policy de UPDATE/DELETE: razão append-only, a trilha da sangria não se apaga.
-- config                → config_select_auth ; config_write_gerente_admin ; config_write_caixa_sessao (caixa: só fundo_atual/caixa_aberto/sessao_aberta_em — 20260744)
-- operator_logs         → oplogs_insert_auth ; oplogs_select_gerente_admin
-- unidades_medida       → unidades_select_auth ; unidades_write_admin
-- notas_fiscais         → nf_all_gerente_admin
-- notas_fiscais_itens   → nf_itens_all_gerente_admin
-- estoque_entradas      → estoque_all_gerente_admin
-- itens_fiscal          → itens_fiscal_all_gerente_admin
-- subprodutos           → subprodutos_select_auth ; subprodutos_write_gerente_admin
-- combos                → combos_select_auth ; combos_write_gerente_admin
-- combo_subprodutos     → combo_subs_select_auth ; combo_subs_write_gerente_admin
-- combo_produtos        → allow_all_combo_produtos + combo_produtos_tenant_isolation (20260726)
-- locais_impressao      → impressao_select_auth ; impressao_write_admin
-- categorias_roteamento → roteamento_select_auth ; roteamento_write_admin
-- estacoes              → 20260823 (leitura auth, escrita gerência)
-- trabalhos_impressao   → 20260824 (a Ponte KORA consome com o próprio login do tenant)
-- mesas                 → mesas_select_auth ; mesas_write_gerente_admin
-- estoque               → estoque_select_auth ; estoque_{insert,update}_caixa_gerencia ; estoque_delete_gerencia
-- estoque_subprodutos   → 20260748 (mesmo desenho de estoque)
-- estoque_baixas_aplicadas → 20260830 (só a RPC baixar_estoque escreve)
-- grupos_categoria      → 20260732 ; isolamento por tenant em 20260743
-- categoria_grupo       → 20260732 ; isolamento por tenant em 20260743
-- role_permissions      → 20260828 (leitura auth do próprio tenant, escrita admin)
-- senha_admin_tentativas → sem policy: só a RPC verificar_senha_admin (SECURITY DEFINER) escreve
-- login_tentativas      → sem policy: só a RPC registrar_tentativa_login (SECURITY DEFINER) escreve
-- jarvas_eventos        → jarvas_eventos_insert_auth ; jarvas_eventos_{select,update}_gerencia
-- jarvas_insights       → jarvas_insights_select_{operacional,estrategico} ; jarvas_insights_{insert,update}_gerencia
-- ia_uso                → sem policy de escrita: só a Edge Function do Jarvas incrementa
-- lancamentos           → lancamentos_all_gerencia ; lancamentos_insert_venda_caixa (Financeiro fase 1)
-- clientes              → clientes_select_auth ; clientes_insert_update_operacional (garcom/caixa/gerente/admin) ; clientes_delete_gerencia (F010, 20260713_clientes.sql)
--
-- ── Plataforma ───────────────────────────────────────────────
-- tenants               → leitura do próprio tenant ; super-admin vê todos ; escrita só por RPC
-- planos / planos_modulos / addons → leitura para qualquer logado (catálogo), escrita só por RPC
-- tenant_addons         → SEM policy de escrita: só alternar_addon_tenant (20260915)
-- assinaturas           → leitura do próprio tenant (S1-3 "Minha assinatura") ; escrita só por RPC
-- assinaturas_pagamentos → idem: leitura do próprio tenant, escrita só por RPC
-- tenant_fiscal_config  → leitura/escrita do próprio tenant, papel admin (PainelFiscal)
-- nfce_emitidas / nfce_inutilizacoes → leitura gerência do próprio tenant ; escrita pela Edge fiscal
--
-- ── Delivery (20260804 e sucessoras) ─────────────────────────
-- config_delivery / produto_delivery / grupos_complemento / complementos /
-- produto_grupos / grupo_subgrupos → leitura PÚBLICA (anon) filtrada pelo
--   slug do tenant, para o cardápio abrir sem login ; escrita só gerência
--   do próprio tenant.
-- delivery_pedidos / delivery_pedido_itens → insert público (o cliente faz
--   o pedido sem conta) ; leitura e update só pelo tenant dono.

-- ── Realtime ──────────────────────────────────────────────────
-- Habilitado no dashboard para: pending, estoque, jarvas_insights, mesas,
-- delivery_pedidos, trabalhos_impressao
-- (Database → Replication → Tables)
