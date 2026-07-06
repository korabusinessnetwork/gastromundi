import { useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { ROLES } from "@/constants/roles";
import { verificarSenhaUsuario } from "@/lib/adminAuth";
import C from "@/constants/colors";
import { getSizes } from "@/constants/sizes";
import { useResponsive } from "@/utils/hooks";
import { normalizarPagamentos, totalTroco } from "@/utils/pagamentos";
import {
  LuReceipt, LuPackage, LuChartBar, LuArchive, LuSettings, LuBriefcase,
  LuLock, LuLockOpen, LuLogOut, LuChevronLeft, LuCircle,
  LuHistory, LuX, LuUser, LuArrowLeft, LuShieldAlert, LuWallet, LuChefHat, LuUsers,
} from "react-icons/lu";

const NAV_ICONS = {
  "/app/pdv":           LuReceipt,
  "/app/produtos":      LuPackage,
  "/app/relatorio":     LuChartBar,
  "/app/estoque":       LuArchive,
  "/app/financeiro":    LuWallet,
  "/app/cozinha":       LuChefHat,
  "/app/clientes":      LuUsers,
  "/app/configuracoes": LuSettings,
  "/app/admin":         LuBriefcase,
};

export default function Sidebar({ caixaAberto, onFechamento, onAbertura, onLogout, onBackToChoice, onClose }) {
  const { currentUser, pending, sales, sessaoAbertaEm, users } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);
  const role    = ROLES[currentUser?.role] || ROLES.garcom;
  const abertas  = pending.filter(o => o.status !== "closed");
  const fechadas = sessaoAbertaEm
    ? sales.filter(s => s && new Date(s.at) >= new Date(sessaoAbertaEm))
    : sales;

  const [showFechadas,    setShowFechadas]   = useState(false);
  const [fechadaDetalhe, setFechadaDetalhe] = useState(null);

  // Auth guard para Relatório (caixa)
  const [showAuthRel, setShowAuthRel] = useState(false);
  const [authUser,    setAuthUser]    = useState("");
  const [authPass,    setAuthPass]    = useState("");
  const [authError,   setAuthError]   = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const openAuthRel = () => { setAuthUser(""); setAuthPass(""); setAuthError(""); setShowAuthRel(true); };

  const handleAuthRelatorio = async () => {
    if (authLoading) return;
    const username = authUser.trim().toLowerCase();
    setAuthLoading(true);
    try {
      const ok = await verificarSenhaUsuario(username, authPass);
      if (!ok) { setAuthError("Usuário, senha ou permissão incorretos."); return; }
      setShowAuthRel(false);
      navigate("/app/relatorio", { state: { ts: Date.now() } });
      onClose?.();
    } finally {
      setAuthLoading(false);
    }
  };

  const temRelatorio = !!currentUser?.permissions?.relatorio;
  const relatorioVisivel = temRelatorio || !!currentUser?.permissions?.pdv;

  const allItems = [
    { to: "/app/pdv",       label: "Frente de Caixa",  perm: "pdv",      badge: pending.length || null },
    { to: "/app/cozinha",   label: "Cozinha",          perm: "cozinha"   },
    { to: "/app/clientes",  label: "Clientes",          perm: "clientes"  },
    { to: "/app/produtos",  label: "Cadastro Produtos", perm: "produtos"  },
    { to: "/app/relatorio", label: "Relatório",         perm: "relatorio", extra: relatorioVisivel },
  ].filter(item => currentUser?.permissions?.[item.perm] || item.extra);

  const bottomItems = [
    { to: "/app/estoque",       label: "Estoque",        perm: "estoque"       },
    { to: "/app/financeiro",    label: "Financeiro",     perm: "financeiro"    },
    { to: "/app/admin",         label: "Área Admin",     perm: "configuracoes" },
    { to: "/app/configuracoes", label: "Configurações",  perm: "configuracoes" },
  ].filter(item => currentUser?.permissions?.[item.perm]);

  const linkStyle = (isActive) => ({
    width: "100%", padding: "12px 20px", background: isActive ? C.alow : "none",
    border: "none", borderLeft: `3px solid ${isActive ? C.accent : "transparent"}`,
    color: isActive ? C.accent : C.muted,
    cursor: "pointer", textAlign: "left", fontSize: sz.fontBase, fontWeight: 600,
    display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s",
    textDecoration: "none",
  });

  const navigate  = useNavigate();
  const location  = useLocation();

  const NavItem = ({ item }) => {
    const Icon = NAV_ICONS[item.to] ?? LuReceipt;
    const isActive = location.pathname === item.to;
    return (
      <NavLink
        to={item.to}
        style={linkStyle(isActive)}
        onClick={e => {
          e.preventDefault();
          navigate(item.to, { state: { ts: Date.now() } });
          onClose?.();
        }}
      >
        <Icon size={sz.fontBase} />
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.badge ? (
          <span style={{ background: C.red, color: "#fff", borderRadius: 10, padding: "2px 7px", fontSize: sz.fontSm, fontWeight: 800 }}>
            {item.badge}
          </span>
        ) : null}
      </NavLink>
    );
  };

  return (
    <aside style={{ background: C.card, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100dvh", width: "100%", overflowX: "hidden" }}>

      {/* Logo */}
      <div style={{ padding: "20px 20px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 900, fontSize: sz.fontBase + 1, letterSpacing: "-0.3px", lineHeight: 1.2 }}>
          GASTROMUNDI<br />
          <span style={{ color: C.muted, fontWeight: 400, fontSize: sz.fontSm }}>by Kora</span>
        </div>
      </div>

      {/* Fechar drawer (mobile) */}
      {onClose && (
        <div style={{ padding: "10px 16px 0", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: "pointer", padding: "4px 10px", fontSize: 17, fontWeight: 700 }}>
            ✕
          </button>
        </div>
      )}

      {/* Usuário */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
<div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: sz.fontBase, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {currentUser?.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span style={{ fontSize: sz.fontSm, color: C.muted }}>{currentUser?.username}</span>
            <span style={{ fontSize: sz.fontSm - 1, padding: "1px 6px", borderRadius: 10, fontWeight: 700, background: caixaAberto ? `${C.green}22` : `${C.red}22`, color: caixaAberto ? C.green : C.red, display: "flex", alignItems: "center", gap: 3 }}>
              <LuCircle size={5} fill="currentColor" /> {caixaAberto ? "Aberto" : "Fechado"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {onBackToChoice && (
            <button onClick={onBackToChoice} title="Voltar à escolha" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", padding: "5px 7px", display: "flex", alignItems: "center" }}>
              <LuChevronLeft size={14} />
            </button>
          )}
          <button onClick={onLogout} title="Sair" style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, cursor: "pointer", padding: "5px 7px", display: "flex", alignItems: "center" }}>
            <LuLogOut size={14} />
          </button>
        </div>
      </div>

      {/* Navegação principal */}
      <nav style={{ flex: 1, padding: "10px 0", overflowY: "auto" }}>
        {allItems.map(item => {
          const guardado = item.to === "/app/relatorio" && !temRelatorio;
          const isActive = location.pathname === item.to;
          return (
          <div key={item.to}>
            {guardado ? (
              <button
                onClick={openAuthRel}
                style={{ ...linkStyle(isActive), color: isActive ? C.accent : C.muted }}
              >
                <LuChartBar size={17} />
                <span style={{ flex: 1 }}>{item.label}</span>
                <LuLock size={13} style={{ opacity: 0.6 }} />
              </button>
            ) : (
              <NavItem item={item} />
            )}
            {/* Botão Comandas Fechadas — logo abaixo de Frente de Caixa */}
            {item.to === "/app/pdv" && fechadas.length > 0 && (
              <button
                onClick={() => setShowFechadas(true)}
                style={{
                  width: "100%", padding: "9px 20px 9px 44px",
                  background: "none", border: "none", borderLeft: "3px solid transparent",
                  color: C.muted, cursor: "pointer", textAlign: "left",
                  fontSize: sz.fontBase, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "color 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.color = C.text}
                onMouseLeave={e => e.currentTarget.style.color = C.muted}
              >
                <LuHistory size={14} />
                <span style={{ flex: 1 }}>Comandas fechadas</span>
                <span style={{
                  background: C.surface, color: C.muted, borderRadius: 10,
                  padding: "1px 7px", fontSize: sz.fontSm, fontWeight: 700,
                  border: `1px solid ${C.border}`,
                }}>
                  {fechadas.length}
                </span>
              </button>
            )}
          </div>
          );
        })}
      </nav>

      {/* Modal Auth — Relatório (caixa) */}
      {showAuthRel && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowAuthRel(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: C.card, borderRadius: 20, padding: 32,
            width: "90%", maxWidth: 400, border: `1px solid ${C.border}`,
            display: "flex", flexDirection: "column", gap: 20,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: `${C.accent}18`, border: `1.5px solid ${C.accent}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <LuShieldAlert size={22} color={C.accent} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17 }}>Acesso Restrito</div>
                <div style={{ fontSize: 16, color: C.muted, marginTop: 2 }}>
                  Informe as credenciais de um administrador ou gerente
                </div>
              </div>
            </div>

            {/* Campos */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Usuário</div>
                <input
                  autoFocus
                  value={authUser}
                  onChange={e => { setAuthUser(e.target.value); setAuthError(""); }}
                  onKeyDown={e => e.key === "Enter" && document.getElementById("auth-rel-pass")?.focus()}
                  placeholder="nome de usuário"
                  autoComplete="off"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: `1.5px solid ${authError ? C.red + "88" : C.border}`,
                    background: C.surface, color: C.text, fontSize: 17,
                    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Senha</div>
                <input
                  id="auth-rel-pass"
                  type="password"
                  value={authPass}
                  onChange={e => { setAuthPass(e.target.value); setAuthError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleAuthRelatorio()}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: `1.5px solid ${authError ? C.red + "88" : C.border}`,
                    background: C.surface, color: C.text, fontSize: 17,
                    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              {authError && (
                <div style={{ fontSize: 16, color: C.red, fontWeight: 600, padding: "8px 12px", background: `${C.red}12`, borderRadius: 8, border: `1px solid ${C.red}33` }}>
                  {authError}
                </div>
              )}
            </div>

            {/* Botões */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowAuthRel(false)}
                style={{
                  flex: 1, padding: 12, borderRadius: 10,
                  border: `1px solid ${C.border}`, background: "none",
                  color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17,
                  fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAuthRelatorio}
                disabled={!authUser.trim() || !authPass || authLoading}
                style={{
                  flex: 2, padding: 12, borderRadius: 10, border: "none",
                  background: authUser.trim() && authPass && !authLoading ? C.accent : C.surface,
                  color: authUser.trim() && authPass && !authLoading ? "#fff" : C.muted,
                  cursor: authUser.trim() && authPass && !authLoading ? "pointer" : "not-allowed",
                  fontWeight: 700, fontSize: 17, fontFamily: "inherit",
                  transition: "background 0.15s",
                }}
              >
                {authLoading ? "Verificando..." : "Acessar Relatório"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Comandas Fechadas */}
      {showFechadas && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) { setShowFechadas(false); setFechadaDetalhe(null); } }}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: C.card, borderRadius: 20,
            width: "100%", maxWidth: fechadaDetalhe ? 480 : 560,
            maxHeight: "80vh", display: "flex", flexDirection: "column",
            border: `1px solid ${C.border}`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: C.text, overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "20px 24px", borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
            }}>
              {fechadaDetalhe && (
                <button
                  onClick={() => setFechadaDetalhe(null)}
                  style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 8, color: C.text, cursor: "pointer",
                    padding: "6px 12px", fontWeight: 600, fontSize: 16,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <LuArrowLeft size={14} /> Voltar
                </button>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 17 }}>
                  {fechadaDetalhe
                    ? (/^\d+$/.test(String(fechadaDetalhe.comanda ?? "").trim()) ? `Comanda ${fechadaDetalhe.comanda}` : fechadaDetalhe.comanda)
                    : "Comandas Fechadas"}
                </div>
                <div style={{ fontSize: 18, color: C.muted, marginTop: 2 }}>
                  {fechadaDetalhe
                    ? new Date(fechadaDetalhe.at).toLocaleString("pt-BR")
                    : `${fechadas.length} comanda${fechadas.length !== 1 ? "s" : ""} encerrada${fechadas.length !== 1 ? "s" : ""}`}
                </div>
              </div>
              <button
                onClick={() => { setShowFechadas(false); setFechadaDetalhe(null); }}
                style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
              >
                <LuX size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {fechadaDetalhe ? (
                <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ background: C.surface, borderRadius: 12, padding: "14px 16px", border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
                    {fechadaDetalhe.cashier && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 16, color: C.muted }}>
                        <LuUser size={13} /> {fechadaDetalhe.cashier}
                      </div>
                    )}
                    {normalizarPagamentos(fechadaDetalhe).map((p, i) => p.metodo ? (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 16, color: C.muted }}>
                        <LuReceipt size={13} />
                        Pagamento: <strong style={{ color: C.text }}>
                          {{ dinheiro: "Dinheiro", credito: "Crédito", debito: "Débito", pix: "Pix" }[p.metodo] ?? p.metodo}
                        </strong>
                      </div>
                    ) : null)}
                    {totalTroco(fechadaDetalhe) > 0 && (
                      <div style={{ fontSize: 16, color: C.muted }}>
                        Troco: <strong style={{ color: C.text }}>R$ {Number(totalTroco(fechadaDetalhe)).toFixed(2)}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
                      Itens consumidos
                    </div>
                    {(Array.isArray(fechadaDetalhe.items) ? fechadaDetalhe.items : []).length === 0 ? (
                      <div style={{ padding: 16, color: C.muted, fontSize: 16 }}>Nenhum item registrado.</div>
                    ) : (
                      (Array.isArray(fechadaDetalhe.items) ? fechadaDetalhe.items : []).map((it, idx, arr) => {
                        const obsArr = Array.isArray(it.obs) ? it.obs : (it.obs ? [it.obs] : []);
                        return (
                          <div key={idx} style={{ padding: "10px 16px", borderBottom: idx < arr.length - 1 ? `1px solid ${C.border}` : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontWeight: 600, fontSize: 17 }}>
                                {it.emoji && <span style={{ marginRight: 6 }}>{it.emoji}</span>}
                                {it.name}
                                {it.qty > 1 && <span style={{ color: C.muted, fontWeight: 500 }}> × {it.qty}</span>}
                              </span>
                              <span style={{ fontWeight: 700, fontSize: 17, color: C.green }}>
                                R$ {(it.price * (it.qty ?? 1)).toFixed(2)}
                              </span>
                            </div>
                            {obsArr.map((obs, j) => (
                              <div key={j} style={{ fontSize: 18, color: C.accent, marginTop: 3 }}>↳ {obs}</div>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderRadius: 12, background: `${C.green}10`, border: `1px solid ${C.green}33` }}>
                    <span style={{ fontWeight: 700, fontSize: 18 }}>Total</span>
                    <span style={{ fontWeight: 900, fontSize: 22, color: C.green }}>R$ {Number(fechadaDetalhe.total ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {[...fechadas].sort((a, b) => new Date(b.at) - new Date(a.at)).map(o => {
                    const items    = Array.isArray(o.items) ? o.items : [];
                    const qtdTotal = items.reduce((s, i) => s + (i.qty || 1), 0);
                    const nome     = /^\d+$/.test(String(o.comanda ?? "").trim()) ? `Comanda ${o.comanda}` : o.comanda;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setFechadaDetalhe(o)}
                        style={{
                          background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 12, padding: "14px 16px",
                          cursor: "pointer", textAlign: "left", color: C.text,
                          display: "flex", alignItems: "center", gap: 12,
                          transition: "border-color 0.15s, background 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent + "66"; e.currentTarget.style.background = C.alow; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; }}
                      >
                        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: C.card, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <LuReceipt size={18} color={C.muted} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 17 }}>{nome || `#${String(o.id).slice(-6).toUpperCase()}`}</div>
                          <div style={{ fontSize: 18, color: C.muted, marginTop: 2 }}>
                            {o.cashier && <><LuUser size={11} style={{ marginRight: 3 }} />{o.cashier} · </>}
                            {qtdTotal} {qtdTotal === 1 ? "item" : "itens"} · {new Date(o.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 18, color: C.green, flexShrink: 0 }}>
                          R$ {Number(o.total ?? 0).toFixed(2)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Estoque + Configurações */}
      {bottomItems.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "8px 0" }}>
          {bottomItems.map(item => <NavItem key={item.to} item={item} />)}
        </div>
      )}

      {/* Fechar/Abrir Caixa */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
        {caixaAberto ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {abertas.length > 0 && (
              <div style={{ fontSize: sz.fontSm, fontWeight: 600, color: C.red, textAlign: "center", padding: "4px 8px", background: `${C.red}12`, borderRadius: 8, border: `1px solid ${C.red}33` }}>
                {abertas.length} comanda{abertas.length !== 1 ? "s" : ""} em aberto
              </div>
            )}
            <button
              onClick={abertas.length === 0 ? onFechamento : undefined}
              disabled={abertas.length > 0}
              title={abertas.length > 0 ? `Feche as ${abertas.length} comanda(s) abertas antes de fechar o caixa` : "Fechar Caixa"}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 10,
                border: `1px solid ${abertas.length > 0 ? C.border : `${C.red}55`}`,
                background: abertas.length > 0 ? C.surface : `${C.red}0f`,
                color: abertas.length > 0 ? C.muted : C.red,
                cursor: abertas.length > 0 ? "not-allowed" : "pointer",
                fontSize: sz.fontBase, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                opacity: abertas.length > 0 ? 0.6 : 1,
              }}
            >
              <LuLock size={15} /> Fechar Caixa
            </button>
          </div>
        ) : (
          <button onClick={onAbertura} style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: `1px solid ${C.green}55`, background: `${C.green}0f`, color: C.green, cursor: "pointer", fontSize: sz.fontBase, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <LuLockOpen size={15} /> Abrir Caixa
          </button>
        )}
      </div>
    </aside>
  );
}
