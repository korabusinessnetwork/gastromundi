import { LuSparkles } from "react-icons/lu";
import "./UpgradeNecessario.css";

/**
 * Tela exibida quando o papel do usuário permite a rota, mas o plano
 * do tenant não inclui o módulo (ADR-005, gating camada 1). Aparece
 * no lugar da view — nunca uma tela quebrada, nunca um erro técnico
 * (princípio nº 1, CLAUDE.md): é um convite claro a fazer upgrade.
 */
export default function UpgradeNecessario({ label }) {
  return (
    <div className="upgrade-necessario">
      <div className="upgrade-necessario__icone">
        <LuSparkles size={28} />
      </div>
      <div className="upgrade-necessario__titulo">
        {label} não está no seu plano atual
      </div>
      <div className="upgrade-necessario__texto">
        Fale com o suporte do Kora para habilitar esse recurso.
      </div>
    </div>
  );
}
