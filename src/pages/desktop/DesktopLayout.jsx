import { Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import Sidebar from "@/components/desktop/Sidebar";
import Notification, { useNotification } from "@/components/shared/Notification";
import FechamentoModal from "@/components/modals/FechamentoModal";
import AberturaCaixaModal from "@/components/modals/AberturaCaixaModal";
import C from "@/constants/colors";

export default function DesktopLayout() {
  const { currentUser, isMobile, mobileChoice, setMobileChoice, logout, caixaAberto, setCaixaAberto, setSessaoAbertaEm, sessaoAbertaEm, addFechamento, setFundoAtual, fundoAtual, sales } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { notif, notify } = useNotification();
  const navigate = useNavigate();

  const [showFechamento, setShowFechamento] = useState(false);
  const [showAbertura,   setShowAbertura]   = useState(false);
  const [menuAberto,     setMenuAberto]     = useState(false);

  const isMob = width < 768;
  // Largura do drawer: mínimo 200, máximo 260, nunca mais de 85% da tela
  const drawerWidth = Math.min(260, Math.max(200, Math.floor(width * 0.85)));

  const handleBackToChoice = isMobile && mobileChoice === "pdv"
    ? () => { setMobileChoice(null); navigate("/escolha", { replace: true }); }
    : null;

  return (
    <div style={{
      display: "flex", height: "100dvh",
      background: "#070b14", fontFamily: "'Inter',system-ui,sans-serif", color: "#eef2f7",
      overflow: "hidden",
    }}>
      <Notification notif={notif} />

      {/* ── Sidebar desktop (sempre visível) ─────────────────────── */}
      {!isMob && (
        <div style={{ width: sz.sidebarWidth, flexShrink: 0, overflow: "hidden" }}>
          <Sidebar
            caixaAberto={caixaAberto}
            onFechamento={() => setShowFechamento(true)}
            onAbertura={() => setShowAbertura(true)}
            onLogout={logout}
            onBackToChoice={handleBackToChoice}
          />
        </div>
      )}

      {/* ── Sidebar mobile (drawer overlay) ──────────────────────── */}
      {isMob && menuAberto && (
        <>
          <div
            onClick={() => setMenuAberto(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 299,
              background: "rgba(0,0,0,0.6)",
            }}
          />
          <div style={{
            position: "fixed", left: 0, top: 0,
            width: drawerWidth, height: "100dvh",
            zIndex: 300, overflow: "hidden",
          }}>
            <Sidebar
              caixaAberto={caixaAberto}
              onFechamento={() => { setShowFechamento(true); setMenuAberto(false); }}
              onAbertura={() => { setShowAbertura(true); setMenuAberto(false); }}
              onLogout={logout}
              onBackToChoice={handleBackToChoice}
              onClose={() => setMenuAberto(false)}
            />
          </div>
        </>
      )}

      {/* ── Área de conteúdo ─────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Top bar mobile */}
        {isMob && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: `env(safe-area-inset-top, 0px) 16px 0`,
            minHeight: 52, flexShrink: 0,
            background: C.card, borderBottom: `1px solid ${C.border}`,
          }}>
            <button
              onClick={() => setMenuAberto(true)}
              style={{
                background: "none", border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.text, cursor: "pointer",
                padding: "6px 10px", fontWeight: 700, fontSize: 17,
                lineHeight: 1,
              }}
            >
              ☰
            </button>
            <div style={{ flex: 1, fontWeight: 900, fontSize: 14, letterSpacing: "-0.3px" }}>
              GASTROMUNDI <span style={{ color: C.muted, fontWeight: 400 }}>by Kora</span>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 10,
              background: caixaAberto ? `${C.green}22` : `${C.red}22`,
              color: caixaAberto ? C.green : C.red,
            }}>
              {caixaAberto ? "● Aberto" : "● Fechado"}
            </span>
          </div>
        )}

        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Outlet context={{ notify }} />
        </main>
      </div>

      {showFechamento && (
        <FechamentoModal
          sales={sales}
          fundoAtual={fundoAtual}
          sessaoAbertaEm={sessaoAbertaEm}
          onConfirm={(data) => {
            addFechamento({ id: Date.now(), at: new Date().toISOString(), user: currentUser.name, role: currentUser.role, fundo: fundoAtual, ...data });
            logAction(currentUser.username, "caixa:fechar", { msg: `Caixa fechado · vendas R$ ${data.totalVendas.toFixed(2)} · conferido R$ ${data.totalConferido.toFixed(2)}`, name: currentUser.name, role: currentUser.role, conferido: data.totalConferido, totalVendas: data.totalVendas });
            setCaixaAberto(false);
            setShowFechamento(false);
          }}
          onClose={() => setShowFechamento(false)}
        />
      )}

      {showAbertura && (
        <AberturaCaixaModal
          onConfirm={(fundo) => {
            const agora = new Date().toISOString();
            setFundoAtual(fundo);
            setSessaoAbertaEm(agora);
            logAction(currentUser.username, "caixa:abrir", { msg: `Caixa aberto · fundo R$ ${fundo.toFixed(2)}`, name: currentUser.name, role: currentUser.role, fundo });
            setCaixaAberto(true);
            setShowAbertura(false);
          }}
          onClose={() => setShowAbertura(false)}
        />
      )}
    </div>
  );
}
