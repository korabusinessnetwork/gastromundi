import { LuLock } from "react-icons/lu";
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
    <div className="sem-acesso">
      <div className="sem-acesso__icone">
        <LuLock size={28} />
      </div>
      <div className="sem-acesso__titulo">
        Você ainda não tem acesso a nenhuma tela
      </div>
      <div className="sem-acesso__texto">
        Peça ao responsável pelo estabelecimento para liberar suas permissões.
      </div>
    </div>
  );
}
