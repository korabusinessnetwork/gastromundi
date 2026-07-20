// ──────────────────────────────────────────────────────────────────
// Confirmacao — sucesso: nº do pedido + total + tempo estimado. Fecha e
// volta ao cardápio com a sacola já limpa (feedback humano de sucesso).
// ──────────────────────────────────────────────────────────────────
import { formatarPreco } from "@/lib/delivery";

export default function Confirmacao({ resultado, tempoPreparo, onFechar }) {
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-corpo">
          <div className="confirma">
            <div className="confirma__check">✓</div>
            <h2 className="confirma__titulo">Pedido enviado!</h2>
            <p className="confirma__numero">
              Nº do pedido: <strong>{resultado?.numero}</strong>
            </p>
            {resultado?.total != null && (
              <p className="confirma__total">{formatarPreco(resultado.total)}</p>
            )}
            <p className="linha-sacola__extra">
              O estabelecimento já recebeu seu pedido
              {tempoPreparo ? ` · preparo em ~${tempoPreparo} min` : ""}. O pagamento
              é na entrega.
            </p>
            <button
              className="btn btn--fantasma"
              onClick={onFechar}
              style={{ marginTop: 24 }}
            >
              Voltar ao cardápio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
