import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { sanitizeInput } from "@/utils";
import { LuEye, LuEyeOff, LuShieldCheck, LuTriangleAlert, LuTerminal } from "react-icons/lu";
import "./ConsoleLoginPage.css";

/**
 * Login do Console da Plataforma — host dedicado (ex.: console.kora.codes).
 *
 * Este é o "login de desenvolvedor" que o dono pediu: porta de entrada da
 * PLATAFORMA, separada da porta dos estabelecimentos. Diferenças em relação
 * ao LoginPage de tenant:
 *   • marca NEUTRA da Kora — nunca resolve/aplica branding de tenant, nunca
 *     lê o cache de marca por origem, nunca mostra "endereço não encontrado";
 *   • não faz nenhuma RPC de branding por slug;
 *   • só o papel `plataforma` entra — qualquer outra sessão é encerrada.
 *
 * Isolamento de credencial: o `login()` monta o e-mail como
 * `${username}@${slug}.local` e, neste host, o slug é o rótulo do console
 * (ex.: "console") → namespace `@console.local`. A credencial do super-admin,
 * criada nesse namespace, NÃO autentica em nenhum subdomínio de tenant; e as
 * credenciais de tenant (`@casacoffee.local` etc.) NÃO autenticam aqui.
 *
 * IMPORTANTE: esta tela é barreira de UX/superfície de login, NÃO a fronteira
 * de segurança. A fronteira REAL é o banco: RLS `is_super_admin()` + RPCs
 * SECURITY DEFINER + REVOKE FROM PUBLIC. Mesmo que esta UI fosse forçada,
 * nenhuma leitura/escrita de plataforma passa sem o claim
 * `gastro_role='plataforma'` no JWT.
 *
 * Por que é intuitiva (Princípio nº1): uma tela, dois campos, uma ação
 * ("Entrar"). Estados de carregando/erro têm feedback humano imediato e a
 * identidade deixa claro onde a pessoa está ("Console da Plataforma ·
 * acesso restrito"), sem jargão técnico na tela.
 */
export default function ConsoleLoginPage() {
  const { login, currentUser, logout, loading: dbLoading } = useApp();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Aba SEMPRE neutra da plataforma — nunca herda a marca de um tenant.
  useEffect(() => {
    if (typeof document !== "undefined") document.title = "KORA · Console";
  }, []);

  // Já autenticado: só a plataforma entra no Console. Qualquer outra sessão
  // que porventura tenha autenticado aqui (não deveria — o namespace de
  // e-mail é @console.local) é encerrada, sem revelar o destino do painel.
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "plataforma") { navigate("/console", { replace: true }); return; }
    logout();
    setError("Esta conta não tem acesso ao Console.");
  }, [currentUser]);

  const submit = async () => {
    if (loading || dbLoading) return;
    const u = sanitizeInput(username, 30);
    const p = password.slice(0, 100);
    if (!u || !p) { setError("Preencha usuário e senha."); return; }
    setLoading(true); setError("");
    const result = await login(u, p);
    setLoading(false);
    if (result?.error) { setError(result.error); setPassword(""); return; }
    // Navegação decidida pelo efeito acima quando currentUser muda — evita
    // bounce (mesmo padrão do LoginPage de tenant).
  };

  return (
    <div className="console-login">
      <div className="console-login__caixa">
        <div className="console-login__marca">
          <span className="console-login__marca-icone" aria-hidden>
            <LuTerminal size={26} />
          </span>
          <div className="console-login__marca-titulo">KORA</div>
          <div className="console-login__marca-sub">Console da Plataforma · acesso restrito</div>
        </div>

        <div className="console-login__card">
          <div className="console-login__campo">
            <label className="console-login__label" htmlFor="console-usuario">Usuário</label>
            <input
              id="console-usuario"
              className="console-login__input"
              type="text"
              value={username}
              placeholder="Digite seu usuário"
              maxLength={30}
              autoComplete="username"
              disabled={loading}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          <div className="console-login__campo">
            <label className="console-login__label" htmlFor="console-senha">Senha</label>
            <div className="console-login__senha-wrap">
              <input
                id="console-senha"
                className="console-login__input console-login__input--senha"
                type={showPass ? "text" : "password"}
                value={password}
                placeholder="Digite sua senha"
                maxLength={100}
                autoComplete="current-password"
                disabled={loading}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <button
                type="button"
                className="console-login__olho"
                onClick={() => setShowPass((s) => !s)}
                aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPass ? <LuEyeOff size={18} /> : <LuEye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="console-login__erro" role="alert">
              <LuTriangleAlert size={15} aria-hidden /> {error}
            </div>
          )}

          <button
            type="button"
            className="console-login__entrar"
            onClick={submit}
            disabled={loading || dbLoading}
          >
            {dbLoading ? "Conectando…" : loading ? "Verificando…" : "Entrar"}
          </button>
        </div>

        <div className="console-login__aviso">
          <LuShieldCheck size={15} aria-hidden />
          <span>Área da plataforma. Acesso exclusivo da equipe KORA.</span>
        </div>
      </div>
    </div>
  );
}
