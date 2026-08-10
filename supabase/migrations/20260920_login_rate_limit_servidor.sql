-- ══════════════════════════════════════════════════════════════════
-- Trava de tentativas de login — do navegador para o servidor
-- Pré-venda §1.9 · TD008
--
-- O QUE ESTAVA FURADO
-- O bloqueio por tentativas vivia inteiro no navegador: `getAttempts` /
-- `setAttempts` (src/utils/session.js) contam falhas em `localStorage` e o
-- `login` (src/context/AppContext.jsx) decide bloquear olhando esse contador.
-- Quem quer adivinhar a senha do gerente não usa a tela: chama a API do Auth
-- direto, ou simplesmente limpa o `localStorage` entre as tentativas. Ou seja,
-- os "5 erros e 2 minutos de bloqueio" protegiam apenas quem já estava se
-- comportando. Sobrava só a proteção genérica do Supabase Auth, que é por IP e
-- bem mais frouxa do que a promessa que a tela faz.
--
-- O DESENHO
-- Uma tabela de contagem no banco e UMA função que o front chama ANTES de
-- mandar a senha ao Auth. A função recebe a senha porque é isso que dá dente à
-- trava: ela mesma confere a senha contra `auth.users` (mesma técnica de
-- `verificar_senha_admin`, 20260802), então o contador anda por FALHA REAL —
-- não por o cliente ter tido a gentileza de avisar que errou.
--
-- SENHA CERTA NUNCA É BARRADA. Este é o ponto mais importante do arquivo e
-- não é detalhe de implementação: trava por usuário, num sistema onde o
-- username é público (está no cartão de primeiro acesso e na boca de toda a
-- equipe), abriria uma porta nova — qualquer um erra a senha do gerente cinco
-- vezes de propósito e o restaurante fica sem gerente no meio do almoço.
-- Como aqui a senha é conferida de verdade, a trava só alcança quem está
-- chutando: quem sabe a senha entra mesmo estando "bloqueado", e o contador é
-- zerado no ato. O ataque de negação de serviço morre no desenho, não numa
-- mitigação.
--
-- O QUE A FUNÇÃO NÃO DEVOLVE, DE PROPÓSITO
-- Só `{ pode_tentar, segundos }`. Nunca se a senha estava certa, nunca se o
-- e-mail existe, nunca quantas tentativas restam. Fosse ela responder "senha
-- correta", viraria um segundo endereço de login sem sessão, sem log e sem as
-- proteções do Auth — e a contagem de tentativas restantes contaria a um
-- atacante exatamente quanto orçamento ainda tem. Quem chama continua tendo
-- que passar pelo `signInWithPassword` para de fato entrar.
--
-- E O CONTADOR DO NAVEGADOR, MORRE?
-- Não. Ele fica como primeira linha: responde na hora, funciona offline e é o
-- que desenha as bolinhas de "tentativas restantes" na tela de login. O que
-- muda é que ele deixou de ser a ÚNICA linha. O front também falha ABERTO se
-- esta RPC não responder (ver AppContext): um erro de rede ou uma migração não
-- aplicada não pode trancar o estabelecimento para fora do próprio PDV.
--
-- NÚMEROS (os mesmos da tela, src/utils/session.js):
--   5 falhas · janela de 15 minutos · bloqueio de 2 minutos.
--
-- SEGURANÇA
-- • SECURITY DEFINER + SET search_path = public, auth, extensions (precisa de
--   `auth.users` e de `crypt`, da pgcrypto em `extensions`).
-- • A tabela nasce com RLS LIGADA e SEM policy nenhuma — mesmo desenho de
--   `senha_admin_tentativas` (20260802): nenhum papel do app lê ou escreve
--   direto, só esta função (que roda como dona). Isso importa porque a linha
--   diz quais e-mails erraram senha e quando.
-- • A senha não é gravada, não é devolvida e não entra em RAISE nenhum. Ela é
--   comparada em memória com `crypt` e descartada.
-- • EXECUTE para `anon` É INTENCIONAL: isto roda antes de existir sessão. É a
--   exceção da 20260802 (junto com `branding_por_slug`), e é segura porque a
--   função não lê dado de negócio e não afirma nada sobre a senha.
--
-- Idempotente (CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION).
-- ⚠️ EXECUÇÃO MANUAL: rodar no SQL Editor do Supabase.
-- PRÉ-REQUISITOS: pgcrypto (`crypt`) — já usada por 20260802.
-- RLS: nenhuma configuração no painel. A tabela sai daqui com RLS ligada e
-- sem policies DE PROPÓSITO; criar policy para ela seria abrir o que este
-- arquivo está fechando.
-- ══════════════════════════════════════════════════════════════════

-- ── Contador de falhas por endereço de login ──────────────────────
-- A chave é o e-mail montado por `emailDoLogin` (usuario@slug.local), então a
-- contagem é por usuário E por estabelecimento: o "matheus" de um restaurante
-- nunca bloqueia o "matheus" do outro.
CREATE TABLE IF NOT EXISTS public.login_tentativas (
  email         text        PRIMARY KEY,
  falhas        integer     NOT NULL DEFAULT 0,
  janela_inicio timestamptz NOT NULL DEFAULT now(),
  bloqueado_ate timestamptz
);
ALTER TABLE public.login_tentativas ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.registrar_tentativa_login(
  p_email text,
  p_senha text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  -- Os mesmos três números da tela (src/utils/session.js). Divergir daqui
  -- faria a tela prometer uma coisa e o servidor cumprir outra.
  c_max_falhas constant integer  := 5;
  c_janela     constant interval := interval '15 minutes';
  c_bloqueio   constant interval := interval '2 minutes';

  v_email    text;
  v_ok       boolean := false;
  v_falhas   integer;
  v_inicio   timestamptz;
  v_ate      timestamptz;
  v_segundos integer := 0;
BEGIN
  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');

  -- Sem endereço não há o que contar. Falha ABERTO: o `signInWithPassword`
  -- logo adiante recusa sozinho, e travar aqui só esconderia o motivo real.
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('pode_tentar', true, 'segundos', 0);
  END IF;

  -- Campo em branco não é chute de senha: é a pessoa batendo Enter cedo
  -- demais. Contar isso gastaria o orçamento de tentativas de quem não
  -- tentou nada — e cinco Enters distraídos trancariam o caixa por 2 minutos.
  IF nullif(btrim(coalesce(p_senha, '')), '') IS NULL THEN
    RETURN jsonb_build_object('pode_tentar', true, 'segundos', 0);
  END IF;

  -- ── A senha está certa? ──────────────────────────────────────────
  -- Só a comparação; nada daqui vai para o retorno. `crypt` com o hash
  -- gravado como sal é a forma canônica de conferir (igual 20260802).
  SELECT (au.encrypted_password = crypt(p_senha, au.encrypted_password))
  INTO v_ok
  FROM auth.users au
  WHERE lower(au.email) = v_email
  LIMIT 1;

  v_ok := coalesce(v_ok, false);

  -- ── Senha certa: passa sempre e zera o contador ──────────────────
  -- É isto que impede que a trava vire arma contra o próprio dono do sistema.
  IF v_ok THEN
    DELETE FROM public.login_tentativas WHERE email = v_email;
    RETURN jsonb_build_object('pode_tentar', true, 'segundos', 0);
  END IF;

  -- ── Senha errada: ler o estado atual e decidir ───────────────────
  SELECT falhas, janela_inicio, bloqueado_ate
  INTO v_falhas, v_inicio, v_ate
  FROM public.login_tentativas
  WHERE email = v_email
  FOR UPDATE;

  -- Já bloqueado: devolve o que falta e NÃO estende o castigo. Estender a
  -- cada chute deixaria um bloqueio eterno enquanto o atacante insistisse —
  -- e o legítimo, que erraria a senha uma vez e esperaria, nunca sairia.
  IF FOUND AND v_ate IS NOT NULL AND v_ate > now() THEN
    v_segundos := ceil(extract(epoch FROM (v_ate - now())))::integer;
    RETURN jsonb_build_object('pode_tentar', false, 'segundos', greatest(v_segundos, 1));
  END IF;

  -- Janela vencida (ou bloqueio já cumprido) recomeça do zero: quatro erros
  -- de duas horas atrás não podem fazer um erro de digitação de agora
  -- bloquear a conta.
  IF NOT FOUND OR v_inicio IS NULL OR v_inicio <= now() - c_janela
     OR (v_ate IS NOT NULL AND v_ate <= now()) THEN
    v_falhas := 0;
    v_inicio := now();
  END IF;

  v_falhas := coalesce(v_falhas, 0) + 1;
  v_ate    := CASE WHEN v_falhas >= c_max_falhas THEN now() + c_bloqueio END;

  INSERT INTO public.login_tentativas AS t (email, falhas, janela_inicio, bloqueado_ate)
  VALUES (v_email, v_falhas, v_inicio, v_ate)
  ON CONFLICT (email) DO UPDATE
    SET falhas        = excluded.falhas,
        janela_inicio = excluded.janela_inicio,
        bloqueado_ate = excluded.bloqueado_ate;

  -- Faxina barata: sem isto a tabela guardaria para sempre cada e-mail que
  -- alguém inventou. Só linhas frias, e nunca a que acabou de ser escrita.
  DELETE FROM public.login_tentativas
   WHERE janela_inicio < now() - interval '1 day'
     AND (bloqueado_ate IS NULL OR bloqueado_ate < now());

  IF v_ate IS NOT NULL THEN
    v_segundos := ceil(extract(epoch FROM (v_ate - now())))::integer;
    RETURN jsonb_build_object('pode_tentar', false, 'segundos', greatest(v_segundos, 1));
  END IF;

  -- Ainda dentro do orçamento: quem decide a mensagem é a tela (que conta as
  -- bolinhas). Aqui só se diz que pode tentar.
  RETURN jsonb_build_object('pode_tentar', true, 'segundos', 0);
END;
$$;

-- Ordem importa: o REVOKE depois do GRANT tiraria de todo mundo.
-- `anon` entra de propósito — isto roda ANTES de existir sessão.
REVOKE EXECUTE ON FUNCTION public.registrar_tentativa_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_tentativa_login(text, text) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_oid oid;
  v_def text;
  v_cfg text[];
BEGIN
  IF to_regclass('public.login_tentativas') IS NULL THEN
    RAISE EXCEPTION 'login_tentativas não existe após a migração.';
  END IF;

  -- A tabela diz quais e-mails erraram senha e quando. Sem RLS, a anon key
  -- lê isso inteiro.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = 'public.login_tentativas'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'login_tentativas precisa de RLS ligada.';
  END IF;

  -- E sem policy: quem toca a tabela é só a função (definer). Uma policy
  -- aqui seria reabrir o que este arquivo fecha.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'login_tentativas') THEN
    RAISE EXCEPTION 'login_tentativas não deve ter policy — só a função definer a acessa.';
  END IF;

  v_oid := to_regprocedure('public.registrar_tentativa_login(text, text)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'registrar_tentativa_login(text, text) não existe após a migração.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND prosecdef) THEN
    RAISE EXCEPTION 'registrar_tentativa_login precisa ser SECURITY DEFINER.';
  END IF;

  -- CREATE OR REPLACE descarta proconfig em silêncio; conferir de fato.
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_oid;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'registrar_tentativa_login ficou sem SET search_path.';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  -- Sem a conferência por crypt o contador voltaria a andar por palavra do
  -- cliente — que é exatamente o furo do TD008.
  IF v_def NOT LIKE '%crypt(p_senha%' THEN
    RAISE EXCEPTION 'registrar_tentativa_login precisa conferir a senha com crypt().';
  END IF;

  -- Senha certa tem que zerar e passar; sem isso a trava vira negação de
  -- serviço contra o próprio estabelecimento.
  IF v_def NOT LIKE '%DELETE FROM public.login_tentativas WHERE email = v_email%' THEN
    RAISE EXCEPTION 'registrar_tentativa_login precisa liberar e zerar quando a senha está certa.';
  END IF;

  -- Login acontece antes de existir sessão: sem anon, a trava nunca é
  -- consultada e o front cai no fail-open para sempre.
  IF NOT has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon precisa poder executar registrar_tentativa_login (roda antes do login).';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated precisa poder executar registrar_tentativa_login.';
  END IF;

  RAISE NOTICE 'registrar_tentativa_login instalada. A trava de tentativas agora vive no servidor (5 falhas / 15 min / 2 min de bloqueio) e quem sabe a senha nunca é barrado.';
END $conf$;
