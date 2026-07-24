import { useState } from "react";
import "./Sidebar.css";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { ROLES } from "@/constants/roles";
import { verificarSenhaUsuario, verificarSenhaAdmin } from "@/lib/adminAuth";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { getSizes } from "@/constants/sizes";
import { useResponsive } from "@/utils/hooks";
import { normalizarPagamentos, totalTroco, rotuloMetodo } from "@/utils/pagamentos";
import MODULOS from "@/constants/modulos";
import SidebarBranding from "./SidebarBranding";
import {
  LuReceipt, LuPackage, LuChartBar, LuArchive, LuSettings, LuBriefcase,
  LuLock, LuLockOpen, LuLogOut, LuChevronLeft, LuCircle,
  LuHistory, LuX, LuUser, LuArrowLeft, LuShieldAlert, LuWallet, LuChefHat, LuUsers,
  LuSparkles, LuFileText, LuFileCheck, LuTrash2, LuBike,
} from "react-icons/lu";

const NAV_ICONS = {
  "/app/pdv":           LuReceipt,
  "/app/produtos":      LuPackage,
  "/app/delivery":      LuBike,
  "/app/relatorio":     LuChartBar,
  "/app/estoque":       LuArchive,
  "/app/financeiro":    LuWallet,
  "/app/cozinha":       LuChefHat,
  "/app/clientes":      LuUsers,
  "/app/notas-fiscais": LuFileText,
  "/app/fiscal":        LuFileCheck,
  "/app/configuracoes": LuSettings,
  "/app/admin":         LuBriefcase,
};

export default function Sidebar({ caixaAberto, onFechamento, onAbertura, onLogout, onBackToChoice, onClose }) {
  const { currentUser, pending, sales, sessaoAbertaEm, users, moduloHabilitado, cancelarVendaFechada } = useApp();
  const [upgradeInfo, setUpgradeInfo] = useState(null); // { label } — módulo bloqueado pelo plano atual
  const { width } = useResponsive();
  const sz = getSizes(width);
  const role    = ROLES[currentUser?.role] || ROLES.garcom;
  const abertas  = pending.filter(o => o.status !== "closed");
  // Leva 15.3 — vendas canceladas saem da lista (ficam só na trilha de auditoria)
  const naoCanceladas = sales.filter(s => s && !s.cancelada);
  const fechadas = sessaoAbertaEm
    ? naoCanceladas.filter(s => new Date(s.at) >= new Date(sessaoAbertaEm))
    : naoCanceladas;

  const [showFechadas,    setShowFechadas]   = useState(false);
  const [fechadaDetalhe, setFechadaDetalhe] = useState(null);

  // Leva 15.3 — cancelamento de venda fechada (motivo + senha de gerente/admin)
  const [cancelVenda,     setCancelVenda]     = useState(null);
  const [cancelMotivo,    setCancelMotivo]    = useState("");
  const [cancelSenha,     setCancelSenha]     = useState("");
  const [cancelSenhaErro, setCancelSenhaErro] = useState(false);
  const [cancelErro,      setCancelErro]      = useState("");
  const [cancelando,      setCancelando]      = useState(false);

  const abrirCancelamento = () => {
    setCancelVenda(fechadaDetalhe);
    setCancelMotivo(""); setCancelSenha(""); setCancelSenhaErro(false); setCancelErro("");
  };

  const confirmarCancelamento = async () => {
    if (cancelando || !cancelMotivo.trim() || !cancelSenha.trim()) return;
    setCancelando(true); setCancelErro(""); setCancelSenhaErro(false);
    try {
      const autorizado = await verificarSenhaAdmin(cancelSenha);
      if (!autorizado) { setCancelSenhaErro(true); return; }
      const { error } = await cancelarVendaFechada(cancelVenda.id, cancelMotivo.trim());
      if (error) { setCancelErro("Não foi possível cancelar a venda. Tente novamente."); return; }
      setCancelVenda(null);
      setFechadaDetalhe(null);
    } finally { setCancelando(false); }
  };

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
    { to: "/app/pdv",       label: "Frente de Caixa",  perm: "pdv",      badge: pending.length || null, modulo: MODULOS.PDV },
    // Cozinha removida do menu a pedido do dono (rota /app/cozinha segue no
    // router; para voltar, recolocar o item aqui).
    { to: "/app/clientes",  label: "Clientes",          perm: "clientes", modulo: MODULOS.CLIENTES },
    { to: "/app/produtos",  label: "Cadastro Produtos", perm: "produtos", modulo: MODULOS.CARDAPIO },
    { to: "/app/estoque",   label: "Estoque",           perm: "estoque",  modulo: MODULOS.ESTOQUE },
    { to: "/app/delivery",  label: "Delivery",          perm: "produtos", modulo: MODULOS.DELIVERY },
    { to: "/app/relatorio", label: "Relatório",         perm: "relatorio", extra: relatorioVisivel, modulo: MODULOS.RELATORIOS },
  ].filter(item => currentUser?.permissions?.[item.perm] || item.extra);

  // Financeiro, Notas Fiscais e Config. Fiscal saíram daqui: agora vivem dentro
  // da Área Admin (a sidebar estava lotada). Ver AdminView (SECOES com `to`).
  const bottomItems = [
    { to: "/app/admin",         label: "Área Admin",    perm: "configuracoes" },
    { to: "/app/configuracoes", label: "Configurações", perm: "configuracoes" },
  ].filter(item => currentUser?.permissions?.[item.perm]);

  // Fase 2 (ADR-005) — gating por plano: item com permissão de papel OK mas
  // módulo fora do plano do tenant aparece bloqueado (convite a upgrade),
  // nunca escondido nem quebrado (princípio nº 1 — intuitividade).
  const bloqueadoPorPlano = (item) => !!item.modulo && !moduloHabilitado(item.modulo);

  const linkStyle = (isActive) => ({
    width: "100%", padding: "12px 20px", background: isActive ? varColor(C.alow) : "none",
    border: "none", borderLeft: `3px solid ${isActive ? varColor(C.accent) : "transparent"}`,
    color: isActive ? varColor(C.accent) : varColor(C.muted),
    cursor: "pointer", textAlign: "left", fontWeight: 600,
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
        className="sidebar__nav-item"
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
          <span className="sidebar__badge-contagem" style={{ background: varColor(C.red), color: "#fff", borderRadius: 10, padding: "2px 7px", fontWeight: 800 }}>
            {item.badge}
          </span>
        ) : null}
      </NavLink>
    );
  };

  // Item fora do plano atual: visível, mas bloqueado com convite a upgrade
  // (nunca escondido, nunca leva a tela quebrada — princípio nº 1).
  const LockedByPlanoItem = ({ item }) => {
    const Icon = NAV_ICONS[item.to] ?? LuReceipt;
    return (
      <button
        onClick={() => setUpgradeInfo({ label: item.label })}
        className="sidebar__nav-item"
        style={{ ...linkStyle(false), opacity: 0.55, cursor: "pointer" }}
      >
        <Icon size={sz.fontBase} />
        <span style={{ flex: 1 }}>{item.label}</span>
        <LuSparkles size={13} style={{ opacity: 0.8 }} />
      </button>
    );
  };

  return (
    <aside style={{ background: varColor(C.card), borderRight: `1px solid var(${C.border})`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100dvh", width: "100%", overflowX: "hidden" }}>

      {/* Logo/marca — lê tenant.tema (Fase 6, ADR-007); fallback "GastroMundi" */}
      <SidebarBranding />

      {/* Fechar drawer (mobile) */}
      {onClose && (
        <div style={{ padding: "10px 16px 0", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} className="sidebar__btn-fechar" style={{ background: "none", border: `1px solid var(${C.border})`, borderRadius: 8, color: varColor(C.muted), cursor: "pointer", padding: "4px 10px", fontWeight: 700 }}>
            ✕
          </button>
        </div>
      )}

      {/* Usuário */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid var(${C.border})`, display: "flex", alignItems: "center", gap: 10 }}>
<div style={{ flex: 1, minWidth: 0 }}>
          <div className="sidebar__usuario-nome" style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {currentUser?.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span className="sidebar__usuario-handle" style={{ color: varColor(C.muted) }}>{currentUser?.username}</span>
            <span className="sidebar__status-badge" style={{ padding: "1px 6px", borderRadius: 10, fontWeight: 700, background: caixaAberto ? `${alfa(C.green, "22")}` : `${alfa(C.red, "22")}`, color: caixaAberto ? varColor(C.green) : varColor(C.red), display: "flex", alignItems: "center", gap: 3 }}>
              <LuCircle size={5} fill="currentColor" /> {caixaAberto ? "Aberto" : "Fechado"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {onBackToChoice && (
            <button onClick={onBackToChoice} title="Voltar à escolha" style={{ background: "none", border: `1px solid var(${C.border})`, borderRadius: 6, color: varColor(C.muted), cursor: "pointer", padding: "5px 7px", display: "flex", alignItems: "center" }}>
              <LuChevronLeft size={14} />
            </button>
          )}
          <button onClick={onLogout} title="Sair" style={{ background: "none", border: `1px solid var(${C.border})`, borderRadius: 6, color: varColor(C.muted), cursor: "pointer", padding: "5px 7px", display: "flex", alignItems: "center" }}>
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
                className="sidebar__nav-item"
                style={{ ...linkStyle(isActive), color: isActive ? varColor(C.accent) : varColor(C.muted) }}
              >
                <LuChartBar size={17} />
                <span style={{ flex: 1 }}>{item.label}</span>
                <LuLock size={13} style={{ opacity: 0.6 }} />
              </button>
            ) : bloqueadoPorPlano(item) ? (
              <LockedByPlanoItem item={item} />
            ) : (
              <NavItem item={item} />
            )}
            {/* Botão Comandas Fechadas — logo abaixo de Frente de Caixa */}
            {item.to === "/app/pdv" && fechadas.length > 0 && (
              <button
                onClick={() => setShowFechadas(true)}
                className="sidebar__subitem"
                style={{
                  width: "100%", padding: "9px 20px 9px 44px",
                  background: "none", border: "none", borderLeft: "3px solid transparent",
                  color: varColor(C.muted), cursor: "pointer", textAlign: "left",
                  fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 8,
                  transition: "color 0.15s",
                }}
                onMouseEnter={e => e.currentTarget.style.color = varColor(C.text)}
                onMouseLeave={e => e.currentTarget.style.color = varColor(C.muted)}
              >
                <LuHistory size={14} />
                <span style={{ flex: 1 }}>Comandas fechadas</span>
                <span className="sidebar__badge-contagem" style={{
                  background: varColor(C.surface), color: varColor(C.muted), borderRadius: 10,
                  padding: "1px 7px", fontWeight: 700,
                  border: `1px solid var(${C.border})`,
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
          {...fecharAoClicarFora(() => setShowAuthRel(false))}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20, padding: 32,
            width: "90%", maxWidth: 400, border: `1px solid var(${C.border})`,
            display: "flex", flexDirection: "column", gap: 20,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: `${alfa(C.accent, "18")}`, border: `1.5px solid ${alfa(C.accent, "44")}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <LuShieldAlert size={22} color={varColor(C.accent)} />
              </div>
              <div>
                <div className="sidebar__modal-titulo" style={{ fontWeight: 800 }}>Acesso Restrito</div>
                <div className="sidebar__modal-subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>
                  Informe as credenciais de um administrador ou gerente
                </div>
              </div>
            </div>

            {/* Campos */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div className="sidebar__form-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Usuário</div>
                <input
                  autoFocus
                  value={authUser}
                  onChange={e => { setAuthUser(e.target.value); setAuthError(""); }}
                  onKeyDown={e => e.key === "Enter" && document.getElementById("auth-rel-pass")?.focus()}
                  placeholder="nome de usuário"
                  autoComplete="off"
                  className="sidebar__input"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: `1.5px solid ${authError ? varColor(C.red) + "88" : "var(--gm-input-border)"}`,
                    background: "var(--gm-input-bg)", color: varColor(C.text),
                    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <div className="sidebar__form-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Senha</div>
                <input
                  id="auth-rel-pass"
                  type="password"
                  value={authPass}
                  onChange={e => { setAuthPass(e.target.value); setAuthError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleAuthRelatorio()}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="sidebar__input"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: `1.5px solid ${authError ? varColor(C.red) + "88" : "var(--gm-input-border)"}`,
                    background: "var(--gm-input-bg)", color: varColor(C.text),
                    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              {authError && (
                <div className="sidebar__alerta" style={{ color: varColor(C.red), fontWeight: 600, padding: "8px 12px", background: `${alfa(C.red, "12")}`, borderRadius: 8, border: `1px solid ${alfa(C.red, "33")}` }}>
                  {authError}
                </div>
              )}
            </div>

            {/* Botões */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowAuthRel(false)}
                className="sidebar__modal-btn"
                style={{
                  flex: 1, padding: 12, borderRadius: 10,
                  border: `1px solid var(${C.border})`, background: "none",
                  color: varColor(C.muted), cursor: "pointer", fontWeight: 600,
                  fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAuthRelatorio}
                disabled={!authUser.trim() || !authPass || authLoading}
                className="sidebar__modal-btn"
                style={{
                  flex: 2, padding: 12, borderRadius: 10, border: "none",
                  background: authUser.trim() && authPass && !authLoading ? varColor(C.accent) : varColor(C.surface),
                  color: authUser.trim() && authPass && !authLoading ? "#fff" : varColor(C.muted),
                  cursor: authUser.trim() && authPass && !authLoading ? "pointer" : "not-allowed",
                  fontWeight: 700, fontFamily: "inherit",
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
          {...fecharAoClicarFora(() => { setShowFechadas(false); setFechadaDetalhe(null); })}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20,
            width: "100%", maxWidth: fechadaDetalhe ? 480 : 560,
            maxHeight: "80vh", display: "flex", flexDirection: "column",
            border: `1px solid var(${C.border})`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: varColor(C.text), overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              padding: "20px 24px", borderBottom: `1px solid var(${C.border})`,
              display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
            }}>
              {fechadaDetalhe && (
                <button
                  onClick={() => setFechadaDetalhe(null)}
                  className="sidebar__modal-btn"
                  style={{
                    background: varColor(C.surface), border: `1px solid var(${C.border})`,
                    borderRadius: 8, color: varColor(C.text), cursor: "pointer",
                    padding: "6px 12px", fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <LuArrowLeft size={14} /> Voltar
                </button>
              )}
              <div style={{ flex: 1 }}>
                <div className="sidebar__modal-titulo" style={{ fontWeight: 900 }}>
                  {fechadaDetalhe
                    ? (/^\d+$/.test(String(fechadaDetalhe.comanda ?? "").trim()) ? `Comanda ${fechadaDetalhe.comanda}` : fechadaDetalhe.comanda)
                    : "Comandas Fechadas"}
                </div>
                <div className="sidebar__modal-subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>
                  {fechadaDetalhe
                    ? new Date(fechadaDetalhe.at).toLocaleString("pt-BR")
                    : `${fechadas.length} comanda${fechadas.length !== 1 ? "s" : ""} encerrada${fechadas.length !== 1 ? "s" : ""}`}
                </div>
              </div>
              <button
                onClick={() => { setShowFechadas(false); setFechadaDetalhe(null); }}
                style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
              >
                <LuX size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {fechadaDetalhe ? (
                <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ background: varColor(C.surface), borderRadius: 12, padding: "14px 16px", border: `1px solid var(${C.border})`, display: "flex", flexDirection: "column", gap: 8 }}>
                    {fechadaDetalhe.cashier && (
                      <div className="sidebar__cashier-info" style={{ display: "flex", alignItems: "center", gap: 6, color: varColor(C.muted) }}>
                        <LuUser size={13} /> {fechadaDetalhe.cashier}
                      </div>
                    )}
                    {normalizarPagamentos(fechadaDetalhe).map((p, i) => p.metodo ? (
                      <div key={i} className="sidebar__cashier-info" style={{ display: "flex", alignItems: "center", gap: 6, color: varColor(C.muted) }}>
                        <LuReceipt size={13} />
                        Pagamento: <strong style={{ color: varColor(C.text) }}>
                          {rotuloMetodo(p.metodo)}
                        </strong>
                      </div>
                    ) : null)}
                    {totalTroco(fechadaDetalhe) > 0 && (
                      <div className="sidebar__cashier-info" style={{ color: varColor(C.muted) }}>
                        Troco: <strong style={{ color: varColor(C.text) }}>R$ {Number(totalTroco(fechadaDetalhe)).toFixed(2)}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ background: varColor(C.surface), borderRadius: 12, border: `1px solid var(${C.border})`, overflow: "hidden" }}>
                    <div className="sidebar__form-label" style={{ padding: "10px 16px", borderBottom: `1px solid var(${C.border})`, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1 }}>
                      Itens consumidos
                    </div>
                    {(Array.isArray(fechadaDetalhe.items) ? fechadaDetalhe.items : []).length === 0 ? (
                      <div className="sidebar__vazio" style={{ padding: 16, color: varColor(C.muted) }}>Nenhum item registrado.</div>
                    ) : (
                      (Array.isArray(fechadaDetalhe.items) ? fechadaDetalhe.items : []).map((it, idx, arr) => {
                        const obsArr = Array.isArray(it.obs) ? it.obs : (it.obs ? [it.obs] : []);
                        return (
                          <div key={idx} style={{ padding: "10px 16px", borderBottom: idx < arr.length - 1 ? `1px solid var(${C.border})` : "none" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span className="sidebar__item-nome" style={{ fontWeight: 600 }}>
                                {it.emoji && <span style={{ marginRight: 6 }}>{it.emoji}</span>}
                                {it.name}
                                {it.qty > 1 && <span style={{ color: varColor(C.muted), fontWeight: 500 }}> × {it.qty}</span>}
                              </span>
                              <span className="sidebar__item-preco" style={{ fontWeight: 700, color: varColor(C.green) }}>
                                R$ {(it.price * (it.qty ?? 1)).toFixed(2)}
                              </span>
                            </div>
                            {obsArr.map((obs, j) => (
                              <div key={j} className="sidebar__item-obs" style={{ color: varColor(C.accent), marginTop: 3 }}>↳ {obs}</div>
                            ))}
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderRadius: 12, background: `${alfa(C.green, "10")}`, border: `1px solid ${alfa(C.green, "33")}` }}>
                    <span className="sidebar__total-label" style={{ fontWeight: 700 }}>Total</span>
                    <span className="sidebar__total-valor" style={{ fontWeight: 900, color: varColor(C.green) }}>R$ {Number(fechadaDetalhe.total ?? 0).toFixed(2)}</span>
                  </div>

                  {/* Leva 15.3 — cancelar venda fechada (ação destrutiva: motivo + senha) */}
                  <button
                    onClick={abrirCancelamento}
                    className="sidebar__modal-btn"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      padding: "12px 16px", borderRadius: 12, cursor: "pointer",
                      background: alfa(varColor(C.red), "10"), border: `1.5px solid ${alfa(varColor(C.red), "55")}`,
                      color: varColor(C.red), fontWeight: 700,
                    }}
                  >
                    <LuTrash2 size={16} /> Cancelar venda
                  </button>
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
                          background: varColor(C.surface), border: `1px solid var(${C.border})`,
                          borderRadius: 12, padding: "14px 16px",
                          cursor: "pointer", textAlign: "left", color: varColor(C.text),
                          display: "flex", alignItems: "center", gap: 12,
                          transition: "border-color 0.15s, background 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = varColor(C.accent) + "66"; e.currentTarget.style.background = varColor(C.alow); }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = varColor(C.border); e.currentTarget.style.background = varColor(C.surface); }}
                      >
                        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: varColor(C.card), border: `1px solid var(${C.border})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <LuReceipt size={18} color={varColor(C.muted)} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="sidebar__fechada-nome" style={{ fontWeight: 700 }}>{nome || `#${String(o.id).slice(-6).toUpperCase()}`}</div>
                          <div className="sidebar__fechada-meta" style={{ color: varColor(C.muted), marginTop: 2 }}>
                            {o.cashier && <><LuUser size={11} style={{ marginRight: 3 }} />{o.cashier} · </>}
                            {qtdTotal} {qtdTotal === 1 ? "item" : "itens"} · {new Date(o.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                        <div className="sidebar__fechada-valor" style={{ fontWeight: 800, color: varColor(C.green), flexShrink: 0 }}>
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

      {/* Leva 15.3 — confirmação de cancelamento de venda fechada */}
      {cancelVenda && createPortal(
        <div
          {...fecharAoClicarFora(() => setCancelVenda(null), !cancelando)}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20, width: "100%", maxWidth: 440,
            border: `1px solid var(${C.border})`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: varColor(C.text), padding: 24, display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div>
              <div className="sidebar__modal-titulo" style={{ fontWeight: 900, color: varColor(C.red), display: "flex", alignItems: "center", gap: 8 }}>
                <LuTrash2 size={18} /> Cancelar venda
              </div>
              <div className="sidebar__modal-subtitulo" style={{ color: varColor(C.muted), marginTop: 4 }}>
                {(/^\d+$/.test(String(cancelVenda.comanda ?? "").trim()) ? `Comanda ${cancelVenda.comanda}` : cancelVenda.comanda) || `#${String(cancelVenda.id).slice(-6).toUpperCase()}`}
                {" · "}R$ {Number(cancelVenda.total ?? 0).toFixed(2)}
              </div>
              <div className="sidebar__aviso-irreversivel" style={{ color: varColor(C.muted), marginTop: 8 }}>
                A venda sai do saldo do dia, dos relatórios e do financeiro. Essa ação não pode ser desfeita.
              </div>
            </div>

            <div>
              <div className="sidebar__form-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Motivo (obrigatório)</div>
              <textarea
                value={cancelMotivo}
                onChange={e => setCancelMotivo(e.target.value)}
                placeholder="Ex: cobrança duplicada, pagamento não confirmado..."
                maxLength={200}
                rows={2}
                className="sidebar__input"
                style={{
                  width: "100%", boxSizing: "border-box", resize: "none",
                  background: "var(--gm-input-bg)", border: "1px solid var(--gm-input-border)",
                  borderRadius: 10, padding: "10px 12px", color: varColor(C.text),
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div>
              <div className="sidebar__form-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <LuLock size={12} /> Senha de gerente ou admin
              </div>
              <input
                type="password"
                value={cancelSenha}
                onChange={e => { setCancelSenha(e.target.value); setCancelSenhaErro(false); }}
                onKeyDown={e => { if (e.key === "Enter") confirmarCancelamento(); }}
                placeholder="Senha"
                className="sidebar__input"
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "var(--gm-input-bg)",
                  border: `1.5px solid ${cancelSenhaErro ? varColor(C.red) : "var(--gm-input-border)"}`,
                  borderRadius: 10, padding: "10px 12px", color: varColor(C.text),
                }}
              />
              {cancelSenhaErro && (
                <div className="sidebar__campo-erro" style={{ color: varColor(C.red), marginTop: 6, fontWeight: 600 }}>
                  Senha incorreta. Apenas admin ou gerente pode cancelar vendas.
                </div>
              )}
            </div>

            {cancelErro && (
              <div role="alert" className="sidebar__erro-generico" style={{ color: varColor(C.red), fontWeight: 600 }}>{cancelErro}</div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { if (!cancelando) setCancelVenda(null); }}
                disabled={cancelando}
                className="sidebar__modal-btn"
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 10, cursor: cancelando ? "default" : "pointer",
                  background: varColor(C.surface), border: `1px solid var(${C.border})`,
                  color: varColor(C.text), fontWeight: 700, opacity: cancelando ? 0.6 : 1,
                }}
              >
                Voltar
              </button>
              <button
                onClick={confirmarCancelamento}
                disabled={cancelando || !cancelMotivo.trim() || !cancelSenha.trim()}
                className="sidebar__modal-btn"
                style={{
                  flex: 2, padding: "12px 0", borderRadius: 10,
                  cursor: (cancelando || !cancelMotivo.trim() || !cancelSenha.trim()) ? "default" : "pointer",
                  background: (!cancelMotivo.trim() || !cancelSenha.trim()) ? varColor(C.surface) : varColor(C.red),
                  border: `1px solid ${(!cancelMotivo.trim() || !cancelSenha.trim()) ? `var(${C.border})` : varColor(C.red)}`,
                  color: (!cancelMotivo.trim() || !cancelSenha.trim()) ? varColor(C.muted) : "#fff",
                  fontWeight: 800,
                }}
              >
                {cancelando ? "Cancelando..." : "Cancelar venda"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Estoque + Configurações */}
      {bottomItems.length > 0 && (
        <div style={{ borderTop: `1px solid var(${C.border})`, padding: "8px 0" }}>
          {bottomItems.map(item => bloqueadoPorPlano(item)
            ? <LockedByPlanoItem key={item.to} item={item} />
            : <NavItem key={item.to} item={item} />
          )}
        </div>
      )}

      {/* Modal — módulo fora do plano atual (convite a upgrade, princípio nº 1) */}
      {upgradeInfo && createPortal(
        <div
          {...fecharAoClicarFora(() => setUpgradeInfo(null))}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20, padding: 28,
            width: "100%", maxWidth: 400, border: `1px solid var(${C.border})`,
            display: "flex", flexDirection: "column", gap: 16,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: `${alfa(C.accent, "18")}`, border: `1.5px solid ${alfa(C.accent, "44")}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <LuSparkles size={22} color={varColor(C.accent)} />
              </div>
              <div>
                <div className="sidebar__modal-titulo" style={{ fontWeight: 800 }}>{upgradeInfo.label} não está no seu plano</div>
                <div className="sidebar__modal-subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>
                  Fale com o suporte para habilitar esse recurso no seu plano.
                </div>
              </div>
            </div>
            <button
              onClick={() => setUpgradeInfo(null)}
              className="sidebar__modal-btn"
              style={{
                padding: 12, borderRadius: 10, border: "none",
                background: varColor(C.accent), color: "#fff", cursor: "pointer",
                fontWeight: 700, fontFamily: "inherit",
              }}
            >
              Entendi
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Fechar/Abrir Caixa */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid var(${C.border})` }}>
        {caixaAberto ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {abertas.length > 0 && (
              <div className="sidebar__aviso-comandas-abertas" style={{ fontWeight: 600, color: varColor(C.red), textAlign: "center", padding: "4px 8px", background: `${alfa(C.red, "12")}`, borderRadius: 8, border: `1px solid ${alfa(C.red, "33")}` }}>
                {abertas.length} comanda{abertas.length !== 1 ? "s" : ""} em aberto
              </div>
            )}
            <button
              onClick={abertas.length === 0 ? onFechamento : undefined}
              disabled={abertas.length > 0}
              title={abertas.length > 0 ? `Feche as ${abertas.length} comanda(s) abertas antes de fechar o caixa` : "Fechar Caixa"}
              className="sidebar__caixa-btn"
              style={{
                width: "100%", padding: "11px 0", borderRadius: 10,
                border: `1px solid ${abertas.length > 0 ? varColor(C.border) : `${alfa(C.red, "55")}`}`,
                background: abertas.length > 0 ? varColor(C.surface) : `${alfa(C.red, "0f")}`,
                color: abertas.length > 0 ? varColor(C.muted) : varColor(C.red),
                cursor: abertas.length > 0 ? "not-allowed" : "pointer",
                fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                opacity: abertas.length > 0 ? 0.6 : 1,
              }}
            >
              <LuLock size={15} /> Fechar Caixa
            </button>
          </div>
        ) : (
          <button onClick={onAbertura} className="sidebar__caixa-btn" style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: `1px solid ${alfa(C.green, "55")}`, background: `${alfa(C.green, "0f")}`, color: varColor(C.green), cursor: "pointer", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <LuLockOpen size={15} /> Abrir Caixa
          </button>
        )}
      </div>
    </aside>
  );
}
