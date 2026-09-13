-- ══════════════════════════════════════════════════════════════════
-- Opção de grupo de escolha pode ser DESLIGADA sem ser apagada
-- 20260927
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ Acabou a cerveja da casa. Hoje o dono só tem uma saída: apagar  │
-- │ a opção do grupo. Ao apagar, some junto o acréscimo que ele     │
-- │ tinha configurado para ela — e amanhã, quando a cerveja voltar, │
-- │ ele precisa lembrar quanto era e cadastrar de novo.             │
-- │                                                                  │
-- │ Com a coluna, desligar é um clique e ligar de volta é outro. O  │
-- │ que estava configurado continua lá.                             │
-- └─────────────────────────────────────────────────────────────────┘
--
-- SEM RISCO PARA QUEM JÁ TEM DADOS: a coluna nasce NOT NULL DEFAULT
-- true, então toda opção que já existe continua ligada, exatamente
-- como está hoje. Ninguém precisa reconfigurar nada.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS. Rodar de novo não faz nada.
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.grupo_escolha_itens
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.grupo_escolha_itens.ativo IS
  'Opção desligada continua cadastrada (com o acréscimo dela) mas não aparece para o operador escolher. É o "acabou hoje" sem perder a configuração.';

-- ══════════════════════════════════════════════════════════════════
-- Autoteste — falha alto se a coluna não ficou como o app espera.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_tipo    text;
  v_nulo    text;
  v_default text;
BEGIN
  SELECT c.data_type, c.is_nullable, c.column_default
    INTO v_tipo, v_nulo, v_default
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'grupo_escolha_itens'
     AND c.column_name = 'ativo';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHA: a coluna public.grupo_escolha_itens.ativo não foi criada. A tabela existe? Rode a 20260918_grupos_escolha.sql antes desta.';
  END IF;

  IF v_tipo <> 'boolean' THEN
    RAISE EXCEPTION 'FALHA: ativo deveria ser boolean, é %.', v_tipo;
  END IF;

  -- NOT NULL com default é o que garante que opção antiga continue
  -- ligada. Sem isso, as que já existem viriam NULL e o app teria de
  -- adivinhar o que fazer com elas.
  IF v_nulo <> 'NO' THEN
    RAISE EXCEPTION 'FALHA: ativo aceita NULL — opção antiga ficaria sem resposta sobre estar ligada ou não.';
  END IF;

  IF v_default IS NULL OR v_default NOT LIKE '%true%' THEN
    RAISE EXCEPTION 'FALHA: ativo deveria nascer com DEFAULT true, veio %.', coalesce(v_default, 'sem default');
  END IF;

  RAISE NOTICE 'grupo_escolha_itens.ativo conferida: desligar uma opção não apaga mais a configuração dela.';
END $conf$;
