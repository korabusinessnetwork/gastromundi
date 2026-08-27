-- ══════════════════════════════════════════════════════════════════
-- Pautas da Kora — pautas_pessoas + pautas
-- docs/03_REGRAS_DE_NEGOCIO/PAUTAS.md · ADR-011 · decisão 034
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ O dono precisa estipular o que os sócios vão programar. Hoje    │
-- │ isso vive em conversa de WhatsApp: some, ninguém sabe o que já  │
-- │ foi feito e todo mundo pergunta "isso é pra quê mesmo?".        │
-- │                                                                  │
-- │ Uma pauta guarda as três coisas que a conversa perde: o que é   │
-- │ (título), PARA QUE serve (intuito), o que já se sabe            │
-- │ (contexto) — mais quem está envolvido e em que pé está.         │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ⚠️ ISTO NÃO É DADO DE ESTABELECIMENTO. É a ferramenta INTERNA da Kora,
-- servida no host dedicado pautas.<dominio> (mesmo desenho de host do
-- Console, ADR-008 §7). Por isso NÃO tem tenant_id e NÃO entra no
-- isolamento por tenant: nenhum estabelecimento lê ou escreve aqui.
--
-- Quem entra: só quem autentica no namespace de e-mail `@pautas.local`.
-- O login monta o e-mail como `${usuario}@${slug}.local` (tenantSlug.js)
-- e, neste host, o slug é "pautas". Credencial de tenant não autentica
-- aqui, e a credencial de sócio não autentica em nenhum estabelecimento.
-- A fronteira REAL é esta RLS — a separação de host é só UX.
--
-- Os sócios NÃO nascem no código: nascem nesta tabela. Um quarto sócio é
-- uma linha em pautas_pessoas + um usuário no Auth, não um deploy
-- (white-label, decisão 017).
--
-- PRÉ-REQUISITO: criar os 3 usuários no Supabase Auth com e-mail
-- `<slug>@pautas.local` (Authentication → Users → Add user, "Auto
-- Confirm User" ligado). O `slug` da pessoa aqui tem que ser IGUAL à
-- parte antes do @ — é por ele que a tela sabe quem está logado.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS,
-- seed com ON CONFLICT DO NOTHING.
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase.
-- ⚠️ RLS: as policies abaixo restringem tudo ao namespace @pautas.local —
--    confira no painel (Authentication → Policies) que RLS ficou
--    habilitada nas duas tabelas.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Quem é sócio ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pautas_pessoas (
  -- slug = parte do e-mail antes do @ (matheus, guilherme, bonato)
  slug       text        PRIMARY KEY,
  -- nome como aparece na tela — é o que o dono pediu ver na pauta
  nome       text        NOT NULL,
  -- sócio que saiu vira ativo=false: some dos formulários, mas as pautas
  -- antigas continuam mostrando o nome de quem participou
  ativo      boolean     NOT NULL DEFAULT true,
  -- ordem fixa na tela; sem ela a lista muda de posição a cada carga
  ordem      smallint    NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.pautas_pessoas (slug, nome, ordem) VALUES
  ('matheus',   'Matheus',   1),
  ('guilherme', 'Guilherme', 2),
  ('bonato',    'Bonato',    3)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. A pauta ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pautas (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- o que é, em uma linha
  titulo         text        NOT NULL,
  -- PARA QUE serve — o campo que a conversa de WhatsApp sempre perde
  intuito        text        NOT NULL,
  -- o que já se sabe: links, decisões anteriores, restrições
  contexto       text        NOT NULL DEFAULT '',
  -- slugs de pautas_pessoas. Array porque uma pauta pode ser de dois ou
  -- dos três — a decisão foi "vários envolvidos por pauta".
  envolvidos     text[]      NOT NULL DEFAULT '{}',
  -- 'pendente' | 'em_progresso' | 'finalizado'
  status         text        NOT NULL DEFAULT 'pendente',
  -- slug de quem criou e de quem mexeu por último (o "quem mudou isso?")
  criada_por     text,
  atualizada_por text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- carimbo do fim; volta a NULL se a pauta reabrir
  finalizada_em  timestamptz
);

-- status restrito ao conjunto conhecido: os três botões da tela são a
-- regra inteira, e escrita torta aqui vira card sem estado na lista.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pautas_status_check'
      AND conrelid = 'public.pautas'::regclass
  ) THEN
    ALTER TABLE public.pautas
      ADD CONSTRAINT pautas_status_check
      CHECK (status IN ('pendente', 'em_progresso', 'finalizado'));
  END IF;
END $$;

-- título vazio deixaria um card anônimo na lista.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pautas_titulo_check'
      AND conrelid = 'public.pautas'::regclass
  ) THEN
    ALTER TABLE public.pautas
      ADD CONSTRAINT pautas_titulo_check
      CHECK (length(btrim(titulo)) > 0);
  END IF;
END $$;

-- pauta sem intuito é exatamente o que este sistema existe para evitar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pautas_intuito_check'
      AND conrelid = 'public.pautas'::regclass
  ) THEN
    ALTER TABLE public.pautas
      ADD CONSTRAINT pautas_intuito_check
      CHECK (length(btrim(intuito)) > 0);
  END IF;
END $$;

-- A tela abre na lista inteira, mais nova primeiro.
CREATE INDEX IF NOT EXISTS pautas_recentes_idx
  ON public.pautas (created_at DESC);

-- Filtro "só as minhas" (contém o slug da pessoa).
CREATE INDEX IF NOT EXISTS pautas_envolvidos_idx
  ON public.pautas USING GIN (envolvidos);

-- updated_at nunca fica velho, mesmo que a tela esqueça de mandar.
CREATE OR REPLACE FUNCTION public.pautas_marcar_atualizacao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pautas_updated_at ON public.pautas;
CREATE TRIGGER pautas_updated_at
  BEFORE UPDATE ON public.pautas
  FOR EACH ROW EXECUTE FUNCTION public.pautas_marcar_atualizacao();

-- ── 3. Quem é sócio, do ponto de vista do banco ────────────────────
-- A sessão veio do namespace @pautas.local? É a única credencial que
-- existe neste host. STABLE + SQL puro: roda dentro de cada policy.
CREATE OR REPLACE FUNCTION public.eh_socio_pautas()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth.role() = 'authenticated'
     AND coalesce(auth.jwt() ->> 'email', '') LIKE '%@pautas.local';
$$;

-- ── 4. RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.pautas_pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pautas         ENABLE ROW LEVEL SECURITY;

-- Os sócios LEEM a lista de sócios (é o que preenche os nomes na tela).
-- Sem policy de escrita: entrar/sair da sociedade é ato manual no painel,
-- não botão na tela.
DROP POLICY IF EXISTS pautas_pessoas_select_socio ON public.pautas_pessoas;
CREATE POLICY pautas_pessoas_select_socio
  ON public.pautas_pessoas FOR SELECT
  USING (public.eh_socio_pautas());

-- Pauta é combinada entre os três: todos leem tudo. Esconder pauta de
-- sócio seria o oposto do propósito.
DROP POLICY IF EXISTS pautas_select_socio ON public.pautas;
CREATE POLICY pautas_select_socio
  ON public.pautas FOR SELECT
  USING (public.eh_socio_pautas());

DROP POLICY IF EXISTS pautas_insert_socio ON public.pautas;
CREATE POLICY pautas_insert_socio
  ON public.pautas FOR INSERT
  WITH CHECK (public.eh_socio_pautas());

-- Qualquer sócio move o status: quem está fazendo é quem sabe que
-- começou ou terminou — pedir permissão ao dono travaria o fluxo.
DROP POLICY IF EXISTS pautas_update_socio ON public.pautas;
CREATE POLICY pautas_update_socio
  ON public.pautas FOR UPDATE
  USING      (public.eh_socio_pautas())
  WITH CHECK (public.eh_socio_pautas());

-- Nenhuma policy de DELETE: com RLS habilitada e sem policy, o banco
-- NEGA. Pauta encerrada vira 'finalizado' e continua no histórico —
-- apagar levaria junto o motivo pelo qual se decidiu algo.
