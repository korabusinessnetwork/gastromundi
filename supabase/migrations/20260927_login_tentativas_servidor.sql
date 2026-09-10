-- ══════════════════════════════════════════════════════════════════
-- Bloqueio de tentativas de login sai do navegador e vai para o banco (TD008)
--
-- ┌─ PROBLEMA ───────────────────────────────────────────────────────┐
-- │ A tela de login promete "Bloqueio após 5 tentativas", e quem     │
-- │ conta essas cinco é o `localStorage` do navegador de quem está   │
-- │ tentando entrar (`src/utils/session.js`, chave `kora_attempts`). │
-- │ Duas linhas no console apagam o contador e a promessa da tela    │
-- │ vira enfeite: dá para chutar senha sem nunca ver o bloqueio.     │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ┌─ POR QUE NÃO É SÓ COPIAR O `senha_admin_tentativas` ─────────────┐
-- │ A 20260802 conta as falhas da senha de gerente com               │
-- │ `auth_id = auth.uid()`. Funciona porque quem digita a senha de   │
-- │ gerente já está logado.                                          │
-- │                                                                  │
-- │ No login não existe `auth.uid()`: a chamada acontece ANTES da    │
-- │ sessão. Então a chave tem que vir do cliente e as funções têm    │
-- │ que ser alcançáveis pela role `anon`, como já é o rate limit do  │
-- │ delivery público (20260921).                                     │
-- │                                                                  │
-- │ A chave é o próprio e-mail que o login monta, `usuario@slug      │
-- │ .local` (`emailDoLogin`), guardado como md5: ele já separa por   │
-- │ tenant, o cliente não precisa mandar nada que não fosse mandar   │
-- │ ao Auth um instante depois, e o digest evita deixar no banco     │
-- │ uma lista de logins válidos legível.                             │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ┌─ POR QUE SÃO TRÊS FUNÇÕES, E NÃO UMA COM `p_sucesso` ────────────┐
-- │ Este é o ponto que decide se a migration serve para alguma       │
-- │ coisa. Uma única `registrar(chave, sucesso boolean)` aberta ao   │
-- │ `anon` deixaria qualquer um chamar com `sucesso => true` e ZERAR │
-- │ o próprio contador entre as tentativas, o que reconstrói o furo  │
-- │ do TD008 dentro do servidor.                                     │
-- │                                                                  │
-- │ Por isso o caminho que ZERA é separado, não aceita chave por     │
-- │ parâmetro e só é concedido a `authenticated`: ele tira a chave   │
-- │ do e-mail do próprio JWT. Só quem realmente entrou limpa o       │
-- │ contador, e limpa só o seu. Ao `anon` sobram ler o estado e      │
-- │ SOMAR falha, que são coisas que ele já consegue fazer errando    │
-- │ senha de verdade.                                                │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ┌─ LIMITE CONHECIDO, DECLARADO ────────────────────────────────────┐
-- │ Contagem por identidade tem um preço: quem souber um nome de     │
-- │ usuário pode gastar cinco tentativas erradas e deixar aquela     │
-- │ conta bloqueada por dois minutos. Aceito porque o bloqueio é     │
-- │ curto e se dissolve sozinho, e porque a alternativa (não ter     │
-- │ freio nenhum no servidor) é o próprio TD008. O remédio de        │
-- │ verdade é prova de humanidade no formulário, que é feature       │
-- │ própria e não entra aqui.                                        │
-- └──────────────────────────────────────────────────────────────────┘
--
-- Parâmetros: 5 falhas, janela de 15 minutos, bloqueio de 2 minutos.
-- São exatamente os do cliente hoje (`MAX_ATTEMPTS`, `JANELA_TENTATIVAS_MS`,
-- `LOCKOUT_MS`) e os que a tela promete, para esta rodada mudar o LUGAR da
-- regra sem mudar o comportamento visível.
--
-- ORDEM DE DEPLOY: esta migration ANTES do deploy do frontend. Sem ela o
-- app novo não quebra, ele cai no contador local de hoje (falha aberta,
-- de propósito: um problema no banco não pode impedir o caixa de abrir).
--
-- RLS: tabela com RLS ligada e NENHUMA policy. Só as funções
-- SECURITY DEFINER abaixo tocam nela; cliente nenhum lê nem escreve direto.
--
-- Idempotente: pode rodar mais de uma vez sem erro.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. A tabela ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.login_tentativas (
  chave         text        PRIMARY KEY,
  falhas        integer     NOT NULL DEFAULT 0,
  janela_inicio timestamptz NOT NULL DEFAULT now(),
  bloqueado_ate timestamptz
);

ALTER TABLE public.login_tentativas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.login_tentativas IS
  'TD008: contador de tentativas de login por identidade (md5 de usuario@slug.local). Sem policy: só as funções login_tentativas_* (SECURITY DEFINER) escrevem. Linhas são descartáveis, some tudo sem prejuízo.';

-- Serve a limpeza oportunista de linhas velhas feita a cada chamada.
CREATE INDEX IF NOT EXISTS login_tentativas_janela_idx
  ON public.login_tentativas (janela_inicio);

-- ── 2. Leitura do estado (anon, pré-login) ───────────────────────
-- Consulta, não conta. Devolve a mesma forma para chave conhecida e
-- desconhecida, então não serve para descobrir se um usuário existe.
CREATE OR REPLACE FUNCTION public.login_tentativas_estado(p_chave text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_max     constant integer  := 5;
  v_janela  constant interval := interval '15 minutes';
  v_chave   text;
  v_linha   public.login_tentativas%ROWTYPE;
BEGIN
  IF p_chave IS NULL OR length(p_chave) = 0 OR length(p_chave) > 200 THEN
    RETURN jsonb_build_object('bloqueado', false, 'restantes', v_max, 'segundos', 0);
  END IF;

  v_chave := md5(lower(p_chave));
  SELECT * INTO v_linha FROM public.login_tentativas WHERE chave = v_chave;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('bloqueado', false, 'restantes', v_max, 'segundos', 0);
  END IF;

  IF v_linha.bloqueado_ate IS NOT NULL AND v_linha.bloqueado_ate > now() THEN
    RETURN jsonb_build_object(
      'bloqueado', true,
      'restantes', 0,
      'segundos',  ceil(extract(epoch FROM (v_linha.bloqueado_ate - now())))::integer
    );
  END IF;

  -- Bloqueio vencido, ou janela vencida: começa de novo com o limite cheio.
  IF v_linha.bloqueado_ate IS NOT NULL OR v_linha.janela_inicio < now() - v_janela THEN
    RETURN jsonb_build_object('bloqueado', false, 'restantes', v_max, 'segundos', 0);
  END IF;

  RETURN jsonb_build_object(
    'bloqueado', false,
    'restantes', greatest(v_max - v_linha.falhas, 0),
    'segundos',  0
  );
END;
$fn$;

-- ── 3. Somar uma falha (anon, pré-login) ─────────────────────────
-- Só SOMA. Não existe caminho por aqui que diminua o contador.
CREATE OR REPLACE FUNCTION public.login_tentativas_falha(p_chave text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_max      constant integer  := 5;
  v_janela   constant interval := interval '15 minutes';
  v_bloqueio constant interval := interval '2 minutes';
  v_chave    text;
  v_linha    public.login_tentativas%ROWTYPE;
  v_falhas   integer;
  v_inicio   timestamptz;
  v_ate      timestamptz;
BEGIN
  IF p_chave IS NULL OR length(p_chave) = 0 OR length(p_chave) > 200 THEN
    RAISE EXCEPTION 'Identificador de login inválido.' USING ERRCODE = 'check_violation';
  END IF;

  -- Limpeza oportunista: a tabela é alcançável pelo `anon`, então ela não
  -- pode crescer para sempre com chaves inventadas. Linha parada há mais de
  -- uma hora não tem mais efeito nenhum sobre a regra.
  DELETE FROM public.login_tentativas
   WHERE janela_inicio < now() - interval '1 hour'
     AND (bloqueado_ate IS NULL OR bloqueado_ate < now());

  v_chave := md5(lower(p_chave));

  SELECT * INTO v_linha FROM public.login_tentativas WHERE chave = v_chave FOR UPDATE;

  IF NOT FOUND THEN
    v_falhas := 1;
    v_inicio := now();
  ELSIF v_linha.bloqueado_ate IS NOT NULL AND v_linha.bloqueado_ate <= now() THEN
    -- Cumpriu o bloqueio: janela nova, esta falha é a primeira dela.
    v_falhas := 1;
    v_inicio := now();
  ELSIF v_linha.janela_inicio < now() - v_janela THEN
    v_falhas := 1;
    v_inicio := now();
  ELSE
    v_falhas := v_linha.falhas + 1;
    v_inicio := v_linha.janela_inicio;
  END IF;

  IF v_falhas >= v_max THEN
    v_ate := now() + v_bloqueio;
  ELSE
    v_ate := NULL;
  END IF;

  INSERT INTO public.login_tentativas (chave, falhas, janela_inicio, bloqueado_ate)
  VALUES (v_chave, v_falhas, v_inicio, v_ate)
  ON CONFLICT (chave) DO UPDATE
    SET falhas        = EXCLUDED.falhas,
        janela_inicio = EXCLUDED.janela_inicio,
        bloqueado_ate = EXCLUDED.bloqueado_ate;

  RETURN jsonb_build_object(
    'bloqueado', v_ate IS NOT NULL,
    'restantes', greatest(v_max - v_falhas, 0),
    'segundos',  CASE WHEN v_ate IS NULL THEN 0
                      ELSE ceil(extract(epoch FROM (v_ate - now())))::integer END
  );
END;
$fn$;

-- ── 4. Zerar no acerto (só authenticated, chave vinda do JWT) ────
-- Sem parâmetro de propósito: a chave sai do e-mail do próprio token, então
-- ninguém zera o contador de outra pessoa e o `anon` não zera coisa nenhuma.
CREATE OR REPLACE FUNCTION public.login_tentativas_sucesso()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_email text;
BEGIN
  v_email := nullif(auth.jwt() ->> 'email', '');
  IF v_email IS NULL THEN
    RETURN;  -- sem token não há o que limpar; não é erro do usuário
  END IF;

  DELETE FROM public.login_tentativas WHERE chave = md5(lower(v_email));
END;
$fn$;

-- ── 5. Concessões ────────────────────────────────────────────────
-- `anon` precisa das duas primeiras porque login é pré-autenticação. É a
-- mesma exceção que a 20260742 já abre para `branding_por_slug`: função que
-- roda antes de existir sessão. A terceira NÃO vai para `anon`, e é isso que
-- impede o zerar-o-próprio-contador descrito no cabeçalho.
REVOKE ALL ON FUNCTION public.login_tentativas_estado(text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_tentativas_falha(text)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.login_tentativas_sucesso()     FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.login_tentativas_estado(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_tentativas_falha(text)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_tentativas_sucesso()    TO authenticated;

-- ── 6. Conferência ───────────────────────────────────────────────
DO $verificacao$
DECLARE
  v_rls        boolean;
  v_policies   integer;
  v_anon_zera  boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls
    FROM pg_class WHERE oid = 'public.login_tentativas'::regclass;

  SELECT count(*) INTO v_policies
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'login_tentativas';

  SELECT has_function_privilege('anon', 'public.login_tentativas_sucesso()', 'EXECUTE')
    INTO v_anon_zera;

  IF NOT v_rls THEN
    RAISE EXCEPTION 'login_tentativas ficou sem RLS.';
  END IF;
  IF v_policies > 0 THEN
    RAISE EXCEPTION 'login_tentativas ganhou % policy: a tabela é só das funções definer.', v_policies;
  END IF;
  IF v_anon_zera THEN
    RAISE EXCEPTION 'anon consegue executar login_tentativas_sucesso(): o bloqueio seria zeravel pelo atacante.';
  END IF;

  RAISE NOTICE 'TD008 aplicado: login_tentativas com RLS, sem policy, e anon sem acesso ao caminho que zera.';
END;
$verificacao$;
