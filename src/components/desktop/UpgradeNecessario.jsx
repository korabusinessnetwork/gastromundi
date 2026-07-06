import { LuSparkles } from "react-icons/lu";
import C from "@/constants/colors";
import "./UpgradeNecessario.css";

/**
 * Tela exibida quando o papel do usuário permite a rota, mas o plano
 * do tenant não inclui o módulo (ADR-005, gating camada 1). Aparece
 * no lugar da view — nunca uma tela quebrada, nunca um erro técnico
 * (princípio nº 1, CLAUDE.md): é um convite claro a fazer upgrade.
 */
export default function UpgradeNecessario({ label }) {
  return (
    <div className="upgrade-necessario" style={{ background: C.bg }}>
      <div className="upgrade-necessario__icone" style={{ background: `${C.accent}18`, border: `1.5px solid ${C.accent}44` }}>
        <LuSparkles size={28} color={C.accent} />
      </div>
      <div className="upgrade-necessario__titulo" style={{ color: C.text }}>
        {label} não está no seu plano atual
      </div>
      <div className="upgrade-necessario__texto" style={{ color: C.muted }}>
        Fale com o suporte do GastroMundi para habilitar esse recurso.
      </div>
    </div>
  );
}
