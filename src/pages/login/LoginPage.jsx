import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor, gerarVariaveisTema, aplicarVariaveisTema, limparVariaveisTema, aplicarTituloDocumento, nomeExibicaoTenant, logoUrlTenant, MARCA_PLATAFORMA } from "@/lib/tenant/tema";
import { layoutDoTema, varianteDoHorario, variaveisDoLayout } from "@/layouts";
import { resolverSlugTenant, slugDoSubdominio } from "@/lib/host/tenantSlug";
import { consoleAtivo } from "@/lib/host/consoleHost";
import { buscarBrandingPorSlug } from "@/lib/tenant/tenant";
import { lerBrandingCache, salvarBrandingCache } from "@/lib/tenant/brandingCache";
import { sanitizeInput, MAX_ATTEMPTS, getAttempts } from "@/utils";
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
  //
  // Sem cache e sem tenant resolvido, o fallback é a marca da PLATAFORMA —
  // era a marca de um cliente específico, ou seja: todo estabelecimento novo
  // via o nome de outro na própria porta de entrada (decisão 017).
  // `doTenant` diz se o que está na tela é a marca de um estabelecimento:
  // é ela que decide mostrar a assinatura "by Kora" embaixo, para a tela
  // neutra nunca ler "KORA / by Kora".
  const [marca, setMarca] = useState(() => {
    const cache = lerBrandingCache();
    if (cache?.nome || cache?.logo) return { nome: (cache.nome ?? "").toUpperCase(), logo: cache.logo, doTenant: true };
    return { nome: MARCA_PLATAFORMA.toUpperCase(), logo: null, doTenant: false };
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
      try {
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
      // Sem `nome_exibicao` e sem nome cadastrado, cai na marca da PLATAFORMA
      // (nunca na de outro cliente). `temNomeProprio` separa "este tenant tem
      // nome" de "ainda não sei o nome dele": no segundo caso a tela não
      // assina "by Kora" embaixo de "KORA", e o cache não grava a plataforma
      // como se fosse o nome do estabelecimento.
      const nome = nomeExibicaoTenant(data.tema, data.nome || MARCA_PLATAFORMA);
      const temNomeProprio = nome !== MARCA_PLATAFORMA;
      const logo = logoUrlTenant(data.tema);
      setMarca({ nome: nome.toUpperCase(), logo, doTenant: temNomeProprio || !!logo });
      aplicarTituloDocumento(nome); // aba do navegador com a marca do tenant
      // Cache por origem: a próxima abertura deste endereço já pinta com
      // esta marca antes de qualquer requisição (script do index.html).
      salvarBrandingCache({ nome: temNomeProprio ? nome : null, logo, variaveis });
      } catch (err) {
        // Aplicar tema / gravar cache (localStorage) pode lançar em modos
        // restritos do navegador. Nunca deixar virar unhandledrejection na
        // porta de entrada: cai no branding padrão e o login segue normal.
        if (ativo) setChecandoTenant(false);
        console.error("[login] falha ao resolver branding do tenant:", err?.message ?? err);
      }
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
      // de go-live) — encerra a sessão em vez de abrir o Console neste host.
      // Com o switch desligado, comportamento de sempre (vai ao Console no
      // mesmo host).
      //
      // A recusa PRECISA aparecer na tela: sem mensagem, quem digitou a senha
      // CERTA via o botão voltar de "Verificando..." para "Entrar" e mais
      // nada — nenhum erro, nenhuma tentativa gasta, nenhuma pista do que
      // fazer. Só quem já se autenticou como plataforma chega aqui, então a
      // mensagem não revela nada a quem não deveria saber; o que ela não diz
      // é a URL do painel.
      if (consoleAtivo()) {
        setError("Esta conta é da plataforma e não opera estabelecimento. Entre pelo endereço da plataforma.");
        setPassword("");
        logout();
        return;
      }
      navigate("/console", { replace: true });
      return;
    }
    const p = currentUser.permissions;
    // No mobile, quem tira pedido (palm) entra DIRETO no Palm — sem tela de
    // escolha (decisão do dono, 2026-07-26). A Frente de Caixa é operação de
    // balcão/desktop; no celular até o admin cai no Palm. Quem só tem PDV
    // (caixa, sem palm) segue o fluxo normal pro /app.
    if (isMobile && p.palm) { navigate("/palm", { replace: true }); return; }
    navigate(from, { replace: true });
  }, [currentUser]);

  // O contador de tentativas não é desta aba: mora no navegador (localStorage),
  // que é onde o bloqueio realmente conta. Os pips têm que mostrar o que ele
  // está contando para o usuário digitado — senão a tela diz "nenhuma
  // tentativa" e o clique seguinte responde "conta bloqueada".
  useEffect(() => {
    const u = sanitizeInput(username, 30);
    setAttempts(u ? (getAttempts(u).count || 0) : 0);
  }, [username]);

  const submit = async () => {
    if (loading || dbLoading) return;
    const u = sanitizeInput(username, 30);
    const p = password.slice(0, 100);
    if (!u || !p) return setError("Preencha usuário e senha");
    setLoading(true); setError("");
    const result = await login(u, p);
    setLoading(false);
    // Lê o contador em vez de somar um: nem todo erro é tentativa gasta (link do
    // estabelecimento torto, por exemplo, nem chega à senha).
    if (result?.error) { setError(result.error); setAttempts(getAttempts(u).count || 0); setPassword(""); return; }
    // A rota final (Console p/ plataforma, app/palm p/ demais) é
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
    <div className="login-page">
      <div className="login-page__container" style={{ maxWidth: sz.checkoutResumo > 0 ? sz.checkoutResumo - 80 : 420, padding: `0 ${sz.pad}px` }}>
        <div className="login-page__brand">
          {marca.logo ? (
            <img src={marca.logo} alt={marca.nome} className="login-page__brand-logo" />
          ) : (
            <div className="login-page__brand-title">{marca.nome}</div>
          )}
          {/* "by Kora" é a assinatura da PLATAFORMA embaixo da marca do
              estabelecimento. Sem estabelecimento resolvido a própria marca
              exibida já é a da plataforma — assinar de novo leria
              "KORA / by Kora". */}
          <div className="login-page__brand-subtitle">{marca.doTenant ? "by Kora · Acesso ao Sistema" : "Acesso ao Sistema"}</div>
        </div>

        <div className="login-page__card">
          <div className="login-page__field">
            <label className="login-page__label">Usuário</label>
            <input type="text" value={username} placeholder="Digite seu usuário" maxLength={30} autoComplete="username" disabled={loading}
              onChange={(e) => { setUsername(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="login-page__input"
            />
          </div>

          <div className="login-page__field login-page__field--senha">
            <label className="login-page__label">Senha</label>
            <div className="login-page__senha-wrap">
              <input type={showPass ? "text" : "password"} value={password} placeholder="Digite sua senha" maxLength={100} autoComplete="current-password" disabled={loading}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="login-page__input login-page__input--senha"
              />
              <button type="button" aria-label={showPass ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPass(s => !s)} className="login-page__olho">
                {showPass ? <LuEyeOff size={18} /> : <LuEye size={18} />}
              </button>
            </div>
          </div>

          {attempts > 0 && (
            <div className="login-page__attempts">
              {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                <div key={i} className={`login-page__attempt-pip${i < attempts ? " login-page__attempt-pip--usada" : ""}`} />
              ))}
            </div>
          )}

          {error && (
            <div className="login-page__error-message" style={{ background: `${alfa(C.red, "15")}`, border: `1px solid ${alfa(C.red, "44")}` }}>
              <LuTriangleAlert size={15} style={{ flexShrink: 0 }} /> {error}
            </div>
          )}

          <button onClick={submit} disabled={loading || dbLoading} className="login-page__button">
            {dbLoading ? "Conectando..." : loading ? "Verificando..." : "Entrar"}
          </button>
        </div>

        <div className="login-page__security" style={{ background: `${alfa(C.blue, "11")}`, border: `1px solid ${alfa(C.blue, "33")}` }}>
          <LuShieldAlert size={15} className="login-page__security-icon" />
          <div className="login-page__security-notice">
            Sessão expira após <strong>30 min</strong> de inatividade. Bloqueio após <strong>5 tentativas</strong>.
          </div>
        </div>

        {/* Documentos legais da plataforma: discretos (quem entra todo dia
            não precisa deles), mas presentes na única tela pública que todo
            estabelecimento tem — sem isso, o cliente não teria onde consultar
            o que aceitou. */}
        <div className="login-page__legal">
          <a href="/termos" className="login-page__legal-link" style={{ color: varColor(C.muted) }}>Termos de Uso</a>
          <span className="login-page__legal-sep" style={{ color: varColor(C.muted) }} aria-hidden="true">·</span>
          <a href="/privacidade" className="login-page__legal-link" style={{ color: varColor(C.muted) }}>Política de Privacidade</a>
        </div>
      </div>
    </div>
  );
}
