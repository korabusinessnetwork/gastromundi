import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { ROLES } from "@/constants/roles";
import C from "@/constants/colors";
import { getSizes } from "@/constants/sizes";
import { useResponsive } from "@/utils/hooks";
import { LuBellRing, LuReceipt } from "react-icons/lu";

export default function ChoicePage() {
  const { currentUser, setMobileChoice, logout } = useApp();
  const navigate = useNavigate();
  const { width } = useResponsive();
  const sz = getSizes(width);
  const role = ROLES[currentUser?.role] || ROLES.admin;

  const choose = (mode) => {
    setMobileChoice(mode);
    navigate(mode === "palm" ? "/palm" : "/app/pdv", { replace: true });
  };

  return (
    <div style={{ background: C.bg, minHeight: "100dvh", fontFamily: "'Inter',system-ui,sans-serif", color: C.text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: sz.pad }}>
      <div style={{ textAlign: "center", marginBottom: sz.pad + 8 }}>
        <div style={{ fontWeight: 900, fontSize: sz.fontXl, letterSpacing: "-0.5px" }}>GASTROMUNDI</div>
        <div style={{ color: C.muted, fontSize: sz.fontSm - 1, marginTop: 4 }}>by Kora</div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${role.color}22`, border: `1px solid ${role.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: role.color }}>
            {currentUser?.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>{currentUser?.name}</div>
            <div style={{ fontSize: sz.fontSm - 2, color: role.color, fontWeight: 600 }}>{role.label}</div>
          </div>
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: Math.min(340, width - sz.pad * 2), display: "flex", flexDirection: "column", gap: sz.gap + 4 }}>
        <div style={{ fontSize: sz.fontSm - 3, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, textAlign: "center", marginBottom: 4 }}>
          Como deseja usar o sistema?
        </div>

        <button onClick={() => choose("palm")} style={{ background: C.card, border: `2px solid ${C.border}`, borderRadius: 16, padding: `${sz.padSm + 4}px ${sz.padSm}px`, cursor: "pointer", textAlign: "left", color: C.text, display: "flex", alignItems: "center", gap: sz.gap + 6 }}>
          <div style={{ width: sz.isMini ? 40 : 52, height: sz.isMini ? 40 : 52, borderRadius: 14, background: `${C.blue}22`, border: `1px solid ${C.blue}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.blue }}>
            <LuBellRing size={sz.isMini ? 20 : 26} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1, marginBottom: 4 }}>Tirar Pedidos</div>
            <div style={{ fontSize: sz.fontSm - 2, color: C.muted, lineHeight: 1.4 }}>Modo garçom — seleciona itens e envia para o caixa</div>
          </div>
        </button>

        <button onClick={() => choose("pdv")} style={{ background: C.card, border: `2px solid ${C.border}`, borderRadius: 16, padding: `${sz.padSm + 4}px ${sz.padSm}px`, cursor: "pointer", textAlign: "left", color: C.text, display: "flex", alignItems: "center", gap: sz.gap + 6 }}>
          <div style={{ width: sz.isMini ? 40 : 52, height: sz.isMini ? 40 : 52, borderRadius: 14, background: `${C.accent}22`, border: `1px solid ${C.accent}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: C.accent }}>
            <LuReceipt size={sz.isMini ? 20 : 26} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1, marginBottom: 4 }}>Frente de Caixa</div>
            <div style={{ fontSize: sz.fontSm - 2, color: C.muted, lineHeight: 1.4 }}>Gestão completa — PDV, relatórios e configurações</div>
          </div>
        </button>
      </div>

      <button onClick={logout} style={{ marginTop: 32, background: "none", border: "none", color: C.faint, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
        Sair da conta
      </button>
    </div>
  );
}
