import { useApp } from "@/context/AppContext";
import { LuCircleAlert, LuTriangleAlert } from "react-icons/lu";
import C from "@/constants/colors";
import "./AssinaturaBanner.css";

const DIAS_AVISO_PRE_VENCIMENTO = 5;

/**
 * Banner informativo de assinatura — Fase 4 da camada de comercialização
 * (ADR-006). SEM bloqueio: só avisa. O enforcement real (Fase 5) é
 * decidido no backend (RLS), nunca por este componente.
 *
 * Só aparece para quem pode agir sobre isso (gerente/admin) — evitar
 * expor jargão de faturamento para quem opera o caixa/cozinha
 * (princípio nº 1: rótulos claros, sem alarme desnecessário).
 */
export default function AssinaturaBanner() {
  const { assinatura, currentUser } = useApp();
  const podeVer = currentUser?.role === "gerente" || currentUser?.role === "admin";

  if (!podeVer || !assinatura) return null;

  const { status, diasParaVencer, carenciaDias } = assinatura;

  if (status === "ativo") {
    if (diasParaVencer == null || diasParaVencer > DIAS_AVISO_PRE_VENCIMENTO) return null;
    return (
      <div className="assinatura-banner assinatura-banner--aviso" style={{ background: `${C.accent}14`, borderColor: `${C.accent}44`, color: C.text }}>
        <LuCircleAlert size={16} color={C.accent} />
        <span>
          {diasParaVencer === 0
            ? "Sua mensalidade vence hoje."
            : `Sua mensalidade vence em ${diasParaVencer} dia${diasParaVencer === 1 ? "" : "s"}.`}
        </span>
      </div>
    );
  }

  if (status === "carencia") {
    const diasAtraso = Math.abs(diasParaVencer ?? 0);
    const diasRestantes = Math.max(0, (carenciaDias ?? 0) - diasAtraso);
    return (
      <div className="assinatura-banner assinatura-banner--carencia" style={{ background: "#f59e0b1a", borderColor: "#f59e0b55", color: C.text }}>
        <LuTriangleAlert size={16} color="#f59e0b" />
        <span>
          Sua mensalidade está atrasada. Regularize em até {diasRestantes} dia{diasRestantes === 1 ? "" : "s"} para não perder o acesso.
        </span>
      </div>
    );
  }

  if (status === "bloqueado") {
    return (
      <div className="assinatura-banner assinatura-banner--bloqueado" style={{ background: `${C.red}14`, borderColor: `${C.red}55`, color: C.text }}>
        <LuTriangleAlert size={16} color={C.red} />
        <span>Sua mensalidade está atrasada. Regularize para continuar usando o GastroMundi.</span>
      </div>
    );
  }

  return null;
}
