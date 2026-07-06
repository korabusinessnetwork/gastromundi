import { LuTriangleAlert } from "react-icons/lu";
import C from "@/constants/colors";
import "./AssinaturaBloqueada.css";

/**
 * Tela cheia de bloqueio por mensalidade atrasada — Fase 5 (ADR-006 §4,
 * decisão do founder: bloqueio TOTAL). `PrivateRoute` renderiza isto no
 * lugar de QUALQUER rota quando `assinatura.status === 'bloqueado'`.
 *
 * É só cortesia de UX: a fonte de verdade do bloqueio é o Postgres
 * (RLS via `assinatura_ativa`/`assinatura_atual_ativa`,
 * `supabase/migrations/20260720_assinatura_enforcement.sql`) — mesmo
 * que essa tela falhasse em aparecer, nenhuma leitura/escrita
 * operacional passaria no banco.
 */
export default function AssinaturaBloqueada() {
  return (
    <div className="assinatura-bloqueada" style={{ background: C.bg }}>
      <div className="assinatura-bloqueada__icone" style={{ background: `${C.red}18`, border: `1.5px solid ${C.red}44` }}>
        <LuTriangleAlert size={32} color={C.red} />
      </div>
      <div className="assinatura-bloqueada__titulo" style={{ color: C.text }}>
        Sua mensalidade está atrasada
      </div>
      <div className="assinatura-bloqueada__texto" style={{ color: C.muted }}>
        O acesso ao GastroMundi fica suspenso até a renovação ser confirmada.
        Regularize o pagamento com o suporte para voltar a usar o sistema normalmente.
      </div>
    </div>
  );
}
