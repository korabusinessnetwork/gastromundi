import { Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import Sidebar from "@/components/desktop/Sidebar";
import AssinaturaBanner from "@/components/desktop/AssinaturaBanner";
import Notification, { useNotification } from "@/components/shared/Notification";
import JarvasPanel from "@/components/shared/JarvasPanel";
import FechamentoModal from "@/components/modals/FechamentoModal";
import AberturaCaixaModal from "@/components/modals/AberturaCaixaModal";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { nomeExibicaoTenant } from "@/lib/tema";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";

export default function DesktopLayout() {
  const { currentUser, isMobile, mobileChoice, setMobileChoice, logout, caixaAberto, setCaixaAberto, setSessaoAbertaEm, sessaoAbertaEm, addFechamento, setFundoAtual, fundoAtual, sales, tenant } = useApp();
  const nomeEstabelecimento = nomeExibicaoTenant(tenant?.tema);
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { notif, notify } = useNotification();
  const navigate = useNavigate();

  const [showFechamento, setShowFechamento] = useState(false);
  const [showAbertura,   setShowAbertura]   = useState(false);
  const [menuAberto,     setMenuAberto]     = useState(false);

  const isMob = width < 768;
  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);
  // Largura do drawer: mínimo 200, máximo 260, nunca mais de 85% da tela
  const drawerWidth = Math.min(260, Math.max(200, Math.floor(width * 0.85)));

  const handleBackToChoice = isMobile && mobileChoice === "pdv"
    ? () => { setMobileChoice(null); navigate("/escolha", { replace: true }); }
    : null;

  return (
    <div style={{
      display: "flex", height: "100dvh",
      background: varColor(C.bg), fontFamily: "'Inter',system-ui,sans-serif", color: varColor(C.text),
      overflow: "hidden",
    }}>
      <Notification notif={notif} />
      <JarvasPanel />

      {/* ── Sidebar desktop (recolhível) ──────────────────────────── */}
      {!isMob && (
        <div style={{ position: "relative", flexShrink: 0 }}>
          {/* Painel da sidebar com transição de largura */}
          <div style={{
            width: sidebarRecolhida ? 0 : sz.sidebarWidth,
            overflow: "hidden",
            transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
          }}>
            <Sidebar
              caixaAberto={caixaAberto}
              onFechamento={() => setShowFechamento(true)}
              onAbertura={() => setShowAbertura(true)}
              onLogout={logout}
              onBackToChoice={handleBackToChoice}
            />
          </div>

          {/* Botão de recolher/expandir */}
          <button
            onClick={() => setSidebarRecolhida(v => !v)}
            title={sidebarRecolhida ? "Expandir sidebar" : "Recolher sidebar"}
            style={{
              position: "absolute", right: -13, top: "50%",
              transform: "translateY(-50%)",
              width: 26, height: 44,
              borderRadius: "0 8px 8px 0",
              background: varColor(C.card),
              border: `1px solid var(${C.border})`,
              borderLeft: "none",
              color: varColor(C.muted),
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 20,
              transition: "background 0.15s, color 0.15s",
              padding: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = varColor(C.surface); e.currentTarget.style.color = varColor(C.text); }}
            onMouseLeave={e => { e.currentTarget.style.background = varColor(C.card); e.currentTarget.style.color = varColor(C.muted); }}
          >
            {sidebarRecolhida
              ? <LuChevronRight size={14} />
              : <LuChevronLeft size={14} />}
          </button>
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
            background: varColor(C.card), borderBottom: `1px solid var(${C.border})`,
          }}>
            <button
              onClick={() => setMenuAberto(true)}
              style={{
                background: "none", border: `1px solid var(${C.border})`,
                borderRadius: 8, color: varColor(C.text), cursor: "pointer",
                padding: "6px 10px", fontWeight: 700, fontSize: 17,
                lineHeight: 1,
              }}
            >
              ☰
            </button>
            <div style={{ flex: 1, fontWeight: 900, fontSize: 14, letterSpacing: "-0.3px", overflowWrap: "break-word" }}>
              {nomeEstabelecimento.toUpperCase()}
              {nomeEstabelecimento === "GastroMundi" && <span style={{ color: varColor(C.muted), fontWeight: 400 }}> by Kora</span>}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 10,
              background: caixaAberto ? `${alfa(C.green, "22")}` : `${alfa(C.red, "22")}`,
              color: caixaAberto ? varColor(C.green) : varColor(C.red),
            }}>
              {caixaAberto ? "● Aberto" : "● Fechado"}
            </span>
          </div>
        )}

        <AssinaturaBanner />

        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Outlet context={{ notify }} />
        </main>
      </div>

      {showFechamento && (
        <FechamentoModal
          sales={sales}
          fundoAtual={fundoAtual}
          sessaoAbertaEm={sessaoAbertaEm}
          onConfirm={async (data) => {
            // Só fecha o caixa de verdade se o fechamento persistiu no banco —
            // evita marcar caixa como fechado com o registro financeiro perdido.
            const res = await addFechamento({ id: Date.now(), at: new Date().toISOString(), user: currentUser.name, role: currentUser.role, fundo: fundoAtual, ...data });
            if (res?.error) {
              notify("Não foi possível salvar o fechamento. Tente novamente.", "err");
              return;
            }
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
