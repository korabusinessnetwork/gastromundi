import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor, gerarVariaveisTema, aplicarVariaveisTema, nomeExibicaoTenant } from "@/lib/tema";
import { resolverSlugTenant } from "@/lib/tenantSlug";
import { buscarBrandingPorSlug } from "@/lib/tenant";
import { sanitizeInput, MAX_ATTEMPTS } from "@/utils";
import { LuEye, LuEyeOff, LuShieldAlert, LuTriangleAlert } from "react-icons/lu";

export default function LoginPage() {
  const { login, currentUser, isMobile, loading: dbLoading } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);
  const navigate  = useNavigate();
  const location  = useLocation();
  const from      = location.state?.from?.pathname || "/app";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [attempts, setAttempts] = useState(0);
  // Marca do estabelecimento resolvida pelo subdomínio (ADR-009/ADR-007).
  // Pré-login não há JWT/tenant carregado; a marca vem por slug via RPC.
  const [marca, setMarca] = useState({ nome: "GASTROMUNDI", padrao: true });

  // ── White-label na porta de entrada: aplica o tema do tenant (--gm-*)
  //    e o nome ANTES do login. Como a tela toda usa var(--gm-*), ela se
  //    recolore sozinha. Sem subdomínio/tema (dev, apex, gastromundi),
  //    fica o padrão — idêntico a hoje. Fire-and-forget: falha na busca
  //    não trava o login, só mantém o visual padrão.
  useEffect(() => {
    let ativo = true;
    (async () => {
      const slug = resolverSlugTenant();
      const { data } = await buscarBrandingPorSlug(slug);
      if (!ativo || !data) return;
      if (data.tema) aplicarVariaveisTema(gerarVariaveisTema(data.tema));
      const nome = nomeExibicaoTenant(data.tema, data.nome || "GastroMundi");
      setMarca({ nome: nome.toUpperCase(), padrao: nome === "GastroMundi" });
    })();
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    // Super-admin da plataforma não opera estabelecimento — vai ao Console.
    if (currentUser.role === "plataforma") { navigate("/console", { replace: true }); return; }
    const p = currentUser.permissions;
    if (isMobile && p.palm && !p.pdv) { navigate("/palm",    { replace: true }); return; }
    if (isMobile && p.pdv  && p.palm) { navigate("/escolha", { replace: true }); return; }
    navigate(from, { replace: true });
  }, [currentUser]);

  const submit = async () => {
    if (loading || dbLoading) return;
    const u = sanitizeInput(username, 30);
    const p = password.slice(0, 100);
    if (!u || !p) return setError("Preencha usuário e senha");
    setLoading(true); setError("");
    const result = await login(u, p);
    setLoading(false);
    if (result?.error) { setError(result.error); setAttempts((a) => a + 1); setPassword(""); return; }
    // A rota final (Console p/ plataforma, app/palm/escolha p/ demais) é
    // decidida pelo efeito acima quando currentUser muda — evita bounce.
  };

  return (
    <div style={{ background: varColor(C.bg), minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',system-ui,sans-serif", color: varColor(C.text) }}>
      <div style={{ width: "100%", maxWidth: sz.checkoutResumo > 0 ? sz.checkoutResumo - 80 : 480, padding: `0 ${sz.pad}px`, boxSizing: "border-box" }}>
        <div style={{ textAlign: "center", marginBottom: sz.pad + 8 }}>
          <div style={{ fontWeight: 900, fontSize: sz.fontXl, letterSpacing: "-0.5px" }}>{marca.nome}</div>
          <div style={{ color: varColor(C.muted), fontSize: sz.fontBase - 1, marginTop: 4 }}>{marca.padrao ? "by Kora · Acesso ao Sistema" : "Acesso ao Sistema"}</div>
        </div>

        <div style={{ background: varColor(C.card), borderRadius: 20, padding: sz.pad + 4, border: `1px solid var(${C.border})` }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Usuário</label>
            <input type="text" value={username} placeholder="Digite seu usuário" maxLength={30} autoComplete="username" disabled={loading}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text), fontSize: 15, boxSizing: "border-box", outline: "none", fontFamily: "inherit" }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Senha</label>
            <div style={{ position: "relative" }}>
              <input type={showPass ? "text" : "password"} value={password} placeholder="Digite sua senha" maxLength={100} autoComplete="current-password" disabled={loading}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                style={{ width: "100%", padding: "12px 44px 12px 14px", borderRadius: 10, border: `1px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text), fontSize: 15, boxSizing: "border-box", outline: "none", fontFamily: "inherit" }}
              />
              <button onClick={() => setShowPass(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", display: "flex", alignItems: "center" }}>
                {showPass ? <LuEyeOff size={18} /> : <LuEye size={18} />}
              </button>
            </div>
          </div>

          {attempts > 0 && (
            <div style={{ marginBottom: 12, display: "flex", gap: 4 }}>
              {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < attempts ? varColor(C.red) : varColor(C.border) }} />
              ))}
            </div>
          )}

          {error && (
            <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: `${alfa(C.red, "15")}`, border: `1px solid ${alfa(C.red, "44")}`, color: varColor(C.red), fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <LuTriangleAlert size={15} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}

          <button onClick={submit} disabled={loading || dbLoading} style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: (loading || dbLoading) ? varColor(C.faint) : varColor(C.accent), color: "#fff", fontWeight: 800, fontSize: 16, cursor: (loading || dbLoading) ? "not-allowed" : "pointer" }}>
            {dbLoading ? "Conectando..." : loading ? "Verificando..." : "Entrar"}
          </button>
        </div>

        <div style={{ marginTop: 16, padding: "10px 16px", borderRadius: 10, background: `${alfa(C.blue, "11")}`, border: `1px solid ${alfa(C.blue, "33")}`, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <LuShieldAlert size={15} style={{ color: varColor(C.muted), flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11, color: varColor(C.muted), lineHeight: 1.5 }}>
            Sessão expira após <strong style={{ color: varColor(C.text) }}>30 min</strong> de inatividade. Bloqueio após <strong style={{ color: varColor(C.text) }}>5 tentativas</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}
