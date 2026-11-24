import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import {
  LuSparkles
} from "react-icons/lu";

// Convite a trocar de plano quando o módulo não está no plano atual.
export default function ModalUpgradePlano({ tela }) {
  const {
    upgradeInfo, setUpgradeInfo,
  } = tela;
  return createPortal(
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
  );
}
