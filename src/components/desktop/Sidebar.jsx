import { NavLink } from "react-router-dom";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import SidebarBranding from "./SidebarBranding";
import {
  LuReceipt, LuChartBar, LuLock, LuLockOpen, LuLogOut, LuChevronLeft, LuCircle, LuHistory, LuSparkles
} from "react-icons/lu";
import { NAV_ICONS } from "./sidebar/apoio";
import { useSidebar } from "@/app/hooks/useSidebar";
import ModalSenhaRelatorio from "./sidebar/ModalSenhaRelatorio";
import ModalComandasFechadas from "./sidebar/ModalComandasFechadas";
import ConfirmarCancelamentoVenda from "./sidebar/ConfirmarCancelamentoVenda";
import ModalUpgradePlano from "./sidebar/ModalUpgradePlano";
import "./Sidebar.css";

export default function Sidebar({ caixaAberto, onFechamento, onAbertura, onMovimentoCaixa, onLogout, onBackToChoice, onClose }) {
  const tela = useSidebar({ caixaAberto, onFechamento, onAbertura, onMovimentoCaixa, onLogout, onBackToChoice, onClose });
  const {
    upgradeInfo, setUpgradeInfo, showFechadas, setShowFechadas, cancelVenda, showAuthRel, currentUser, sz, podeMovimentarCaixa, abertas, fechadas, openAuthRel, temRelatorio, allItems, bottomItems, bloqueadoPorPlano, navigate, location,
  } = tela;

  const linkStyle = (isActive) => ({
    width: "100%", padding: "12px 20px", background: isActive ? varColor(C.alow) : "none",
    border: "none", borderLeft: `3px solid ${isActive ? varColor(C.accent) : "transparent"}`,
    color: isActive ? varColor(C.accent) : varColor(C.muted),
    cursor: "pointer", textAlign: "left", fontWeight: 600,
    display: "flex", alignItems: "center", gap: 10, transition: "all 0.15s",
    textDecoration: "none",
  });


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
      {showAuthRel && <ModalSenhaRelatorio tela={tela} />}

      {/* Modal Comandas Fechadas */}
      {showFechadas && <ModalComandasFechadas tela={tela} />}

      {/* Leva 15.3 — confirmação de cancelamento de venda fechada */}
      {cancelVenda && <ConfirmarCancelamentoVenda tela={tela} />}

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
      {upgradeInfo && <ModalUpgradePlano tela={tela} />}

      {/* Fechar/Abrir Caixa */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid var(${C.border})` }}>
        {caixaAberto ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {abertas.length > 0 && (
              <div className="sidebar__aviso-comandas-abertas" style={{ fontWeight: 600, color: varColor(C.red), textAlign: "center", padding: "4px 8px", background: `${alfa(C.red, "12")}`, borderRadius: 8, border: `1px solid ${alfa(C.red, "33")}` }}>
                {abertas.length} comanda{abertas.length !== 1 ? "s" : ""} em aberto
              </div>
            )}
            {/* F005 — sangria/suprimento: só com o caixa aberto e só para
                quem opera a gaveta. */}
            {onMovimentoCaixa && podeMovimentarCaixa && (
              <button
                onClick={onMovimentoCaixa}
                title="Registrar retirada ou reforço de troco"
                className="sidebar__caixa-btn"
                style={{
                  width: "100%", padding: "11px 0", borderRadius: 10,
                  border: `1px solid ${alfa(C.accent, "55")}`,
                  background: `${alfa(C.accent, "0f")}`,
                  color: varColor(C.accent), cursor: "pointer", fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                }}
              >
                Retirar / Colocar Dinheiro
              </button>
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
