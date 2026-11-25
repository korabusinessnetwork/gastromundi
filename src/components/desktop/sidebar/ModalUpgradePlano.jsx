import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import { LuSparkles } from "react-icons/lu";

// Convite a trocar de plano quando o módulo não está no plano atual.
export default function ModalUpgradePlano({ tela }) {
  const {
    upgradeInfo, setUpgradeInfo,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setUpgradeInfo(null))}
          className="sidebar-janela__overlay sidebar-janela__overlay--escuro sidebar-janela__overlay--margem"
        >
          <div className="sidebar-janela sidebar-janela--plano">
            <div className="sidebar-janela__topo">
              <div className="sidebar-janela__icone">
                <LuSparkles size={22} />
              </div>
              <div>
                <div className="sidebar__modal-titulo sidebar-janela__titulo">{upgradeInfo.label} não está no seu plano</div>
                <div className="sidebar__modal-subtitulo sidebar-janela__subtitulo">
                  Fale com o suporte para habilitar esse recurso no seu plano.
                </div>
              </div>
            </div>
            <button
              onClick={() => setUpgradeInfo(null)}
              className="sidebar__modal-btn sidebar-janela__btn sidebar-janela__btn--confirmar"
            >
              Entendi
            </button>
          </div>
        </div>,
        document.body
  );
}
