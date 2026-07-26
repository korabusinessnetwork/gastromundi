import { LuLock } from "react-icons/lu";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import "./SemAcesso.css";

/**
 * Tela exibida quando o usuário está autenticado mas não tem permissão para
 * NENHUMA rota de destino (caso raro: override de funcionário removeu tudo).
 * Aparece no lugar de redirecionar — é o que quebra o laço de redirecionamento
 * quando não há "casa" acessível (rotaInicialPermitida === null).
 *
 * Nunca uma tela quebrada nem um erro técnico (princípio nº 1, CLAUDE.md):
 * mensagem humana orientando a falar com o responsável. White-label (decisão
 * 017) — só tokens de tema, nada de marca hardcoded.
 */
export default function SemAcesso() {
  return (
    <div className="sem-acesso" style={{ background: varColor(C.bg) }}>
      <div
        className="sem-acesso__icone"
        style={{ background: `${alfa(C.muted, "18")}`, border: `1.5px solid ${alfa(C.muted, "44")}` }}
      >
        <LuLock size={28} color={varColor(C.muted)} />
      </div>
      <div className="sem-acesso__titulo" style={{ color: varColor(C.text) }}>
        Você ainda não tem acesso a nenhuma tela
      </div>
      <div className="sem-acesso__texto" style={{ color: varColor(C.muted) }}>
        Peça ao responsável pelo estabelecimento para liberar suas permissões.
      </div>
    </div>
  );
}
