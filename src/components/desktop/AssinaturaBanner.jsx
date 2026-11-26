import { useSessao } from "@/context/AppContext";
import { LuCircleAlert, LuTriangleAlert } from "react-icons/lu";
import { DIAS_AVISO_PRE_VENCIMENTO } from "@/features/assinatura/dados/assinatura";
import "./AssinaturaBanner.css";

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
  const { assinatura, currentUser } = useSessao();
  const podeVer = currentUser?.role === "gerente" || currentUser?.role === "admin";

  if (!podeVer || !assinatura) return null;

  const { status, diasParaVencer, carenciaDias } = assinatura;

  if (status === "ativo") {
    if (diasParaVencer == null || diasParaVencer > DIAS_AVISO_PRE_VENCIMENTO) return null;
    return (
      <div className="assinatura-banner assinatura-banner--aviso">
        <LuCircleAlert size={16} className="assinatura-banner__icone" />
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
      <div className="assinatura-banner assinatura-banner--carencia">
        <LuTriangleAlert size={16} className="assinatura-banner__icone" />
        <span>
          Sua mensalidade está atrasada. Regularize em até {diasRestantes} dia{diasRestantes === 1 ? "" : "s"} para não perder o acesso.
        </span>
      </div>
    );
  }

  if (status === "bloqueado") {
    return (
      <div className="assinatura-banner assinatura-banner--bloqueado">
        <LuTriangleAlert size={16} className="assinatura-banner__icone" />
        <span>Sua mensalidade está atrasada. Regularize para continuar usando o sistema.</span>
      </div>
    );
  }

  return null;
}
