import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor, gerarVariaveisTema, aplicarVariaveisTema, limparVariaveisTema, aplicarTituloDocumento, nomeExibicaoTenant, logoUrlTenant } from "@/lib/tema";
import { layoutDoTema, varianteDoHorario, variaveisDoLayout } from "@/layouts";
import { resolverSlugTenant, slugDoSubdominio } from "@/lib/tenantSlug";
import { consoleAtivo } from "@/lib/consoleHost";
import { buscarBrandingPorSlug } from "@/lib/tenant";
import { lerBrandingCache, salvarBrandingCache } from "@/lib/brandingCache";
import { sanitizeInput, MAX_ATTEMPTS } from "@/utils";
import { LuEye, LuEyeOff, LuShieldAlert, LuTriangleAlert, LuSearchX } from "react-icons/lu";
import "./LoginPage.css";

export default function LoginPage() {
  const { login, logout, currentUser, isMobile, loading: dbLoading } = useApp();
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
  // O cache por origem (brandingCache) dá a marca certa já na 1ª pintura —
  // sem ele, a tela abria com a marca do fallback até a RPC responder.
  const [marca, setMarca] = useState(() => {
    const cache = lerBrandingCache();
    if (cache?.nome || cache?.logo) return { nome: (cache.nome ?? "").toUpperCase(), logo: cache.logo };
    return { nome: "GASTROMUNDI", logo: null };
  });
  // Subdomínio digitado que NÃO corresponde a nenhum estabelecimento —
  // mostra a tela de "endereço não encontrado" em vez do login (nunca
  // cair silenciosamente no login de outro tenant).
  const [subdominioInvalido, setSubdominioInvalido] = useState("");
  // Enquanto valida um subdomínio reivindicado, não renderiza o login
  // padrão (evita flash da marca errada e login no tenant errado).
  // Com marca em cache desta origem, o endereço já foi validado numa
  // visita anterior: renderiza direto com ela e a RPC revalida por trás
  // (subdomínio digitado errado nunca tem cache — continua na tela neutra).
  const [checandoTenant, setChecandoTenant] = useState(() => !!slugDoSubdominio() && !lerBrandingCache());

  // ── White-label na porta de entrada: aplica o tema do tenant (--gm-*)
  //    e o nome ANTES do login. Como a tela toda usa var(--gm-*), ela se
  //    recolore sozinha. Sem subdomínio/tema (dev, apex, gastromundi),
  //    fica o padrão — idêntico a hoje.
  //
  //    Com subdomínio na URL, a busca também VALIDA o endereço: a RPC
  //    respondendo "não existe" (sem erro de rede) bloqueia o login e
  //    mostra a tela de endereço não encontrado. Falha de REDE não
  //    bloqueia (fail-open): o login segue com o visual padrão e a
  //    autenticação real continua protegida pelo namespace do slug + RLS.
  useEffect(() => {
    let ativo = true;
    (async () => {
      const reivindicado = slugDoSubdominio();
      // Com subdomínio na URL e SEM cache, a aba fica neutra ("Kora") até
      // confirmar o tenant. Com cache, o script do index.html já pôs a
      // marca certa na aba — não voltar ao neutro (evita piscar o título).
      if (reivindicado && !lerBrandingCache() && typeof document !== "undefined") document.title = "Kora";
      const slug = reivindicado ?? resolverSlugTenant();
      const { data, error } = await buscarBrandingPorSlug(slug);
      if (!ativo) return;
      // Tenant não existe (RPC ok, sem linha): endereço inválido — e limpa
      // qualquer cache velho desta origem (ex.: estabelecimento removido).
      if (reivindicado && !data && !error) { salvarBrandingCache(null); setSubdominioInvalido(reivindicado); setChecandoTenant(false); return; }
      setChecandoTenant(false);
      if (!data) return;
      // Mesma composição do AppContext: variáveis do LAYOUT do tenant
      // (tema.layout, na variante do horário atual) por baixo, overrides
      // finos do tema por cima. Sem isso, um tenant que só define layout
      // (ex.: casa) pintava o visual default no pré-login e gravava um
      // cache vazio — o flash de marca errada que não pode acontecer.
      const variaveis = {
        ...variaveisDoLayout(layoutDoTema(data.tema), varianteDoHorario(new Date().getHours())),
        ...gerarVariaveisTema(data.tema),
      };
      if (Object.keys(variaveis).length > 0) {
        limparVariaveisTema();
        aplicarVariaveisTema(variaveis);
      }
      const nome = nomeExibicaoTenant(data.tema, data.nome || "GastroMundi");
      setMarca({ nome: nome.toUpperCase(), logo: logoUrlTenant(data.tema) });
      aplicarTituloDocumento(nome); // aba do navegador com a marca do tenant
      // Cache por origem: a próxima abertura deste endereço já pinta com
      // esta marca antes de qualquer requisição (script do index.html).
      salvarBrandingCache({ nome, logo: logoUrlTenant(data.tema), variaveis });
    })();
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    // Super-admin da plataforma não opera estabelecimento.
    if (currentUser.role === "plataforma") {
      // Console em subdomínio próprio LIGADO: a plataforma NÃO entra pela
      // porta do estabelecimento. Uma sessão `plataforma` aqui só é possível
      // enquanto a credencial ainda estiver no namespace de tenant (transição
      // de go-live) — encerra a sessão em vez de abrir o Console neste host,
      // sem revelar a existência/URL do painel. Com o switch desligado,
      // comportamento de sempre (vai ao Console no mesmo host).
      if (consoleAtivo()) { logout(); return; }
      navigate("/console", { replace: true });
      return;
    }
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

  // Subdomínio digitado errado: erro claro, sem formulário de login —
  // não existe estabelecimento aqui, logo não existe onde entrar.
  if (subdominioInvalido) {
    const endereco = typeof window !== "undefined" ? window.location.hostname : subdominioInvalido;
    return (
      <div style={{ background: varColor(C.bg), minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--gm-font-texto)", color: varColor(C.text) }}>
        <div style={{ width: "100%", maxWidth: 440, padding: `0 ${sz.pad}px`, boxSizing: "border-box", textAlign: "center" }}>
          <div style={{ background: varColor(C.card), borderRadius: 20, padding: sz.pad + 12, border: `1px solid var(${C.border})` }}>
            <LuSearchX size={40} style={{ color: varColor(C.muted) }} />
            <div className="login-page__error-title" style={{ fontWeight: 900, marginTop: 12, fontFamily: "var(--gm-font-titulo)" }}>Endereço não encontrado</div>
            <div className="login-page__error-text" style={{ color: varColor(C.muted), marginTop: 10 }}>
              Não existe nenhum estabelecimento em<br />
              <strong style={{ color: varColor(C.text), wordBreak: "break-all" }}>{endereco}</strong>
            </div>
            <div className="login-page__error-caption" style={{ color: varColor(C.muted), marginTop: 14 }}>
              Confira se o endereço foi digitado certo — o nome do estabelecimento vem antes do primeiro ponto. Se o erro continuar, fale com quem te passou o link.
            </div>
          </div>
          <div className="login-page__footer-text" style={{ color: varColor(C.muted), marginTop: 14 }}>Kora</div>
        </div>
      </div>
    );
  }

  // Validando o subdomínio: tela neutra, sem marca de nenhum tenant
  // (evita mostrar o visual de um estabelecimento que pode não ser o certo).
  if (checandoTenant) {
    return (
      <div className="login-page__loading" style={{ background: varColor(C.bg), minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--gm-font-texto)", color: varColor(C.muted) }}>
        Carregando…
      </div>
    );
  }

  return (
    <div style={{ background: varColor(C.bg), minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--gm-font-texto)", color: varColor(C.text) }}>
      <div style={{ width: "100%", maxWidth: sz.checkoutResumo > 0 ? sz.checkoutResumo - 80 : 480, padding: `0 ${sz.pad}px`, boxSizing: "border-box" }}>
        <div style={{ textAlign: "center", marginBottom: sz.pad + 8 }}>
          {marca.logo ? (
            <img src={marca.logo} alt={marca.nome} style={{ maxWidth: "min(280px, 70%)", maxHeight: 72, objectFit: "contain", display: "inline-block" }} />
          ) : (
            <div className="login-page__brand-title" style={{ fontWeight: 900, letterSpacing: "-0.5px", fontFamily: "var(--gm-font-titulo)" }}>{marca.nome}</div>
          )}
          <div className="login-page__brand-subtitle" style={{ color: varColor(C.muted), marginTop: 4 }}>by Kora · Acesso ao Sistema</div>
        </div>

        <div style={{ background: varColor(C.card), borderRadius: 20, padding: sz.pad + 4, border: `1px solid var(${C.border})` }}>
          <div style={{ marginBottom: 16 }}>
            <label className="login-page__label" style={{ display: "block", fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Usuário</label>
            <input type="text" value={username} placeholder="Digite seu usuário" maxLength={30} autoComplete="username" disabled={loading}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="login-page__input"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text), boxSizing: "border-box", outline: "none", fontFamily: "inherit" }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="login-page__label" style={{ display: "block", fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Senha</label>
            <div style={{ position: "relative" }}>
              <input type={showPass ? "text" : "password"} value={password} placeholder="Digite sua senha" maxLength={100} autoComplete="current-password" disabled={loading}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="login-page__input"
                style={{ width: "100%", padding: "12px 44px 12px 14px", borderRadius: 10, border: `1px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text), boxSizing: "border-box", outline: "none", fontFamily: "inherit" }}
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
            <div className="login-page__error-message" style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: `${alfa(C.red, "15")}`, border: `1px solid ${alfa(C.red, "44")}`, color: varColor(C.red), fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <LuTriangleAlert size={15} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}

          <button onClick={submit} disabled={loading || dbLoading} className="login-page__button" style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: (loading || dbLoading) ? varColor(C.faint) : varColor(C.accent), color: "#fff", fontWeight: 800, cursor: (loading || dbLoading) ? "not-allowed" : "pointer" }}>
            {dbLoading ? "Conectando..." : loading ? "Verificando..." : "Entrar"}
          </button>
        </div>

        <div style={{ marginTop: 16, padding: "10px 16px", borderRadius: 10, background: `${alfa(C.blue, "11")}`, border: `1px solid ${alfa(C.blue, "33")}`, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <LuShieldAlert size={15} style={{ color: varColor(C.muted), flexShrink: 0, marginTop: 1 }} />
          <div className="login-page__security-notice" style={{ color: varColor(C.muted) }}>
            Sessão expira após <strong style={{ color: varColor(C.text) }}>30 min</strong> de inatividade. Bloqueio após <strong style={{ color: varColor(C.text) }}>5 tentativas</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}
