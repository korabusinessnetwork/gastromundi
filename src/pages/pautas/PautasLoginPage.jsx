import { useState, useEffect } from "react";
import { LuEye, LuEyeOff, LuListChecks, LuTriangleAlert, LuShieldCheck } from "react-icons/lu";
import { usePautas } from "@/context/PautasContext";
import { sanitizeInput } from "@/utils";
import "./PautasLoginPage.css";

/**
 * Login das Pautas da Kora — host dedicado (ex.: pautas.kora.codes).
 *
 * Porta de entrada dos sócios. Isolamento de credencial: o e-mail é montado
 * como `${usuario}@pautas.local`, namespace que NÃO autentica em nenhum
 * estabelecimento — e credencial de estabelecimento não entra aqui.
 *
 * Esta tela é barreira de UX, NÃO a fronteira de segurança. A fronteira real
 * é a RLS (`public.eh_socio_pautas()`): sem um JWT @pautas.local, nenhuma
 * pauta é lida ou escrita, mesmo que a UI fosse forçada.
 *
 * Por que é intuitiva (Princípio nº1): uma tela, dois campos, uma ação
 * ("Entrar"). O título diz onde a pessoa está ("Pautas da Kora"), o botão
 * conta o que está acontecendo ("Entrando…") e o erro aparece em português
 * comum logo acima da ação, sem jargão.
 */
export default function PautasLoginPage() {
  const { entrar } = usePautas();

  const [usuario,  setUsuario]  = useState("");
  const [senha,    setSenha]    = useState("");
  const [erro,     setErro]     = useState("");
  const [entrando, setEntrando] = useState(false);
  const [verSenha, setVerSenha] = useState(false);

  useEffect(() => {
    if (typeof document !== "undefined") document.title = "Pautas da Kora";
  }, []);

  const enviar = async () => {
    if (entrando) return;
    const u = sanitizeInput(usuario, 30);
    const s = senha.slice(0, 100);
    if (!u || !s) { setErro("Preencha usuário e senha."); return; }
    setEntrando(true); setErro("");
    const resultado = await entrar(u, s);
    setEntrando(false);
    if (!resultado?.ok) { setErro(resultado?.error || "Não foi possível entrar."); setSenha(""); }
  };

  return (
    <div className="pautas-login">
      <div className="pautas-login__caixa">
        <div className="pautas-login__marca">
          <span className="pautas-login__marca-icone" aria-hidden>
            <LuListChecks size={26} />
          </span>
          <div className="pautas-login__marca-titulo">Pautas da Kora</div>
          <div className="pautas-login__marca-sub">O que vamos programar · acesso dos sócios</div>
        </div>

        <div className="pautas-login__card">
          <div className="pautas-login__campo">
            <label className="pautas-login__label" htmlFor="pautas-usuario">Usuário</label>
            <input
              id="pautas-usuario"
              className="pautas-login__input"
              type="text"
              value={usuario}
              placeholder="Seu nome de usuário"
              maxLength={30}
              autoComplete="username"
              disabled={entrando}
              onChange={(e) => { setUsuario(e.target.value); setErro(""); }}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
            />
          </div>

          <div className="pautas-login__campo">
            <label className="pautas-login__label" htmlFor="pautas-senha">Senha</label>
            <div className="pautas-login__senha-wrap">
              <input
                id="pautas-senha"
                className="pautas-login__input pautas-login__input--senha"
                type={verSenha ? "text" : "password"}
                value={senha}
                placeholder="Sua senha"
                maxLength={100}
                autoComplete="current-password"
                disabled={entrando}
                onChange={(e) => { setSenha(e.target.value); setErro(""); }}
                onKeyDown={(e) => e.key === "Enter" && enviar()}
              />
              <button
                type="button"
                className="pautas-login__olho"
                onClick={() => setVerSenha((v) => !v)}
                aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
              >
                {verSenha ? <LuEyeOff size={18} /> : <LuEye size={18} />}
              </button>
            </div>
          </div>

          {erro && (
            <div className="pautas-login__erro" role="alert">
              <LuTriangleAlert size={15} aria-hidden /> {erro}
            </div>
          )}

          <button
            type="button"
            className="pautas-login__entrar"
            onClick={enviar}
            disabled={entrando}
          >
            {entrando ? "Entrando…" : "Entrar"}
          </button>
        </div>

        <div className="pautas-login__aviso">
          <LuShieldCheck size={15} aria-hidden />
          <span>Área interna. Acesso exclusivo dos sócios da Kora.</span>
        </div>
      </div>
    </div>
  );
}
