import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { ROLES } from "@/constants/roles";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor, nomeExibicaoTenant } from "@/lib/tema";
import { getSizes } from "@/constants/sizes";
import { useResponsive } from "@/utils/hooks";
import { LuBellRing, LuReceipt } from "react-icons/lu";
import "./ChoicePage.css";

export default function ChoicePage() {
  const { currentUser, setMobileChoice, logout, tenant } = useApp();
  const navigate = useNavigate();
  const { width } = useResponsive();
  const sz = getSizes(width);
  const role = ROLES[currentUser?.role] || ROLES.admin;

  const choose = (mode) => {
    setMobileChoice(mode);
    navigate(mode === "palm" ? "/palm" : "/app/pdv", { replace: true });
  };

  return (
    <div style={{ background: varColor(C.bg), minHeight: "100dvh", fontFamily: "'Inter',system-ui,sans-serif", color: varColor(C.text), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: sz.pad }}>
      <div style={{ textAlign: "center", marginBottom: sz.pad + 8 }}>
        <div className="choice-page__titulo" style={{ fontWeight: 900, letterSpacing: "-0.5px" }}>{nomeExibicaoTenant(tenant?.tema).toUpperCase()}</div>
        <div className="choice-page__assinatura" style={{ color: varColor(C.muted), marginTop: 4 }}>by Kora</div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div className="choice-page__avatar-inicial" style={{ width: 36, height: 36, borderRadius: "50%", background: `${role.color}22`, border: `1px solid ${role.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: role.color }}>
            {currentUser?.name?.[0]?.toUpperCase()}
          </div>
          <div style={{ textAlign: "left" }}>
            <div className="choice-page__nome-usuario" style={{ fontWeight: 700 }}>{currentUser?.name}</div>
            <div className="choice-page__role-label" style={{ color: role.color, fontWeight: 600 }}>{role.label}</div>
          </div>
        </div>
      </div>

      <div style={{ width: "100%", maxWidth: Math.min(340, width - sz.pad * 2), display: "flex", flexDirection: "column", gap: sz.gap + 4 }}>
        <div className="choice-page__pergunta" style={{ color: varColor(C.muted), fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, textAlign: "center", marginBottom: 4 }}>
          Como deseja usar o sistema?
        </div>

        <button onClick={() => choose("palm")} style={{ background: varColor(C.card), border: `2px solid var(${C.border})`, borderRadius: 16, padding: `${sz.padSm + 4}px ${sz.padSm}px`, cursor: "pointer", textAlign: "left", color: varColor(C.text), display: "flex", alignItems: "center", gap: sz.gap + 6 }}>
          <div style={{ width: sz.isMini ? 40 : 52, height: sz.isMini ? 40 : 52, borderRadius: 14, background: `${alfa(C.blue, "22")}`, border: `1px solid ${alfa(C.blue, "44")}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: varColor(C.blue) }}>
            <LuBellRing size={sz.isMini ? 20 : 26} />
          </div>
          <div>
            <div className="choice-page__titulo-opcao" style={{ fontWeight: 800, marginBottom: 4 }}>Tirar Pedidos</div>
            <div className="choice-page__descricao-opcao" style={{ color: varColor(C.muted) }}>Modo garçom — seleciona itens e envia para o caixa</div>
          </div>
        </button>

        <button onClick={() => choose("pdv")} style={{ background: varColor(C.card), border: `2px solid var(${C.border})`, borderRadius: 16, padding: `${sz.padSm + 4}px ${sz.padSm}px`, cursor: "pointer", textAlign: "left", color: varColor(C.text), display: "flex", alignItems: "center", gap: sz.gap + 6 }}>
          <div style={{ width: sz.isMini ? 40 : 52, height: sz.isMini ? 40 : 52, borderRadius: 14, background: `${alfa(C.accent, "22")}`, border: `1px solid ${alfa(C.accent, "44")}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: varColor(C.accent) }}>
            <LuReceipt size={sz.isMini ? 20 : 26} />
          </div>
          <div>
            <div className="choice-page__titulo-opcao" style={{ fontWeight: 800, marginBottom: 4 }}>Frente de Caixa</div>
            <div className="choice-page__descricao-opcao" style={{ color: varColor(C.muted) }}>Gestão completa — PDV, relatórios e configurações</div>
          </div>
        </button>
      </div>

      <button onClick={logout} className="choice-page__logout-btn" style={{ marginTop: 32, background: "none", border: "none", color: varColor(C.faint), cursor: "pointer", fontWeight: 600 }}>
        Sair da conta
      </button>
    </div>
  );
}
