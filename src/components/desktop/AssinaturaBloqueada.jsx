import { LuTriangleAlert, LuLogOut, LuHeadset } from "react-icons/lu";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { useApp } from "@/context/AppContext";
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
 *
 * A tela NUNCA pode ser um beco sem saída (Princípio nº1). Antes ela
 * mostrava só o aviso: quem caísse aqui — com razão ou por engano — não
 * tinha nem como sair da conta nem como falar com o suporte, e no
 * relatório de testes isso apareceu como "tela travada sem botão
 * nenhum". Por isso as três saídas abaixo: sair, tentar de novo e falar
 * com o suporte.
 */
export default function AssinaturaBloqueada() {
  const { logout } = useApp();
  const contatoUrl = import.meta.env.VITE_CONTATO_URL || "";

  return (
    <div className="assinatura-bloqueada" style={{ background: varColor(C.bg) }}>
      <div className="assinatura-bloqueada__icone" style={{ background: `${alfa(C.red, "18")}`, border: `1.5px solid ${alfa(C.red, "44")}` }}>
        <LuTriangleAlert size={32} color={varColor(C.red)} />
      </div>
      <div className="assinatura-bloqueada__titulo" style={{ color: varColor(C.text) }}>
        Sua mensalidade está atrasada
      </div>
      <div className="assinatura-bloqueada__texto" style={{ color: varColor(C.muted) }}>
        O acesso ao sistema fica suspenso até a renovação ser confirmada.
        Regularize o pagamento com o suporte para voltar a usar o sistema normalmente.
      </div>

      <div className="assinatura-bloqueada__acoes">
        {contatoUrl ? (
          <a
            className="assinatura-bloqueada__botao assinatura-bloqueada__botao--primario"
            href={contatoUrl}
            target="_blank"
            rel="noreferrer"
            style={{ background: varColor(C.primary), color: varColor(C.bg) }}
          >
            <LuHeadset size={18} /> Falar com o suporte
          </a>
        ) : null}
        <button
          type="button"
          className="assinatura-bloqueada__botao"
          onClick={() => window.location.reload()}
          style={{ border: `1.5px solid ${alfa(C.text, "33")}`, color: varColor(C.text) }}
        >
          Já paguei — verificar de novo
        </button>
        <button
          type="button"
          className="assinatura-bloqueada__botao"
          onClick={() => { logout?.(); }}
          style={{ border: `1.5px solid ${alfa(C.text, "33")}`, color: varColor(C.text) }}
        >
          <LuLogOut size={18} /> Sair
        </button>
      </div>

      {!contatoUrl ? (
        <div className="assinatura-bloqueada__rodape" style={{ color: varColor(C.muted) }}>
          Fale com o suporte do seu estabelecimento para regularizar o pagamento.
        </div>
      ) : null}
    </div>
  );
}
