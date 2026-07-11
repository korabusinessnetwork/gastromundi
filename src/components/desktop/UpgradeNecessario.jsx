import { LuSparkles } from "react-icons/lu";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import "./UpgradeNecessario.css";

/**
 * Tela exibida quando o papel do usuário permite a rota, mas o plano
 * do tenant não inclui o módulo (ADR-005, gating camada 1). Aparece
 * no lugar da view — nunca uma tela quebrada, nunca um erro técnico
 * (princípio nº 1, CLAUDE.md): é um convite claro a fazer upgrade.
 */
export default function UpgradeNecessario({ label }) {
  return (
    <div className="upgrade-necessario" style={{ background: varColor(C.bg) }}>
      <div className="upgrade-necessario__icone" style={{ background: `${alfa(C.accent, "18")}`, border: `1.5px solid ${alfa(C.accent, "44")}` }}>
        <LuSparkles size={28} color={varColor(C.accent)} />
      </div>
      <div className="upgrade-necessario__titulo" style={{ color: varColor(C.text) }}>
        {label} não está no seu plano atual
      </div>
      <div className="upgrade-necessario__texto" style={{ color: varColor(C.muted) }}>
        Fale com o suporte do GastroMundi para habilitar esse recurso.
      </div>
    </div>
  );
}
