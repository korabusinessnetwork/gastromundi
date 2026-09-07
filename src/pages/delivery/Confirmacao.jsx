// ──────────────────────────────────────────────────────────────────
// Confirmacao — sucesso: nº do pedido + total + tempo estimado. Fecha e
// volta ao cardápio com a sacola já limpa (feedback humano de sucesso).
// ──────────────────────────────────────────────────────────────────
import { formatarPreco } from "@/lib/delivery";
import "./Confirmacao.css";

export default function Confirmacao({ resultado, tempoPreparo, onFechar }) {
  const retirada = resultado?.tipo === "retirada";
  return (
    // Sem fechar no fundo, ao contrário de todos os outros modais da vitrine.
    // Aqui o número do pedido é a ÚNICA cópia que o cliente tem: não existe
    // acompanhamento, comprovante nem histórico, e a sacola já foi apagada no
    // aceite. Um toque fora do cartão — o lugar onde o polegar cai no celular
    // — apagava o número para sempre. A saída continua sendo a mais visível
    // da tela, que é o botão. (Prevenção de erro > mensagem de erro.)
    <div className="modal-fundo">
      <div className="modal-painel">
        <div className="modal-corpo">
          <div className="confirma">
            <div className="confirma__check">✓</div>
            <h2 className="confirma__titulo">Pedido enviado!</h2>
            {retirada && <p className="confirma__tipo">Retirada no local</p>}
            <p className="confirma__numero">
              Nº do pedido: <strong>{resultado?.numero}</strong>
            </p>
            {resultado?.total != null && (
              <p className="confirma__total">{formatarPreco(resultado.total)}</p>
            )}
            <p className="linha-sacola__extra">
              O estabelecimento já recebeu seu pedido
              {tempoPreparo ? ` · preparo em ~${tempoPreparo} min` : ""}.{" "}
              {retirada ? "O pagamento é na hora de retirar." : "O pagamento é na entrega."}
            </p>
            {/* Onde buscar, na tela que o cliente guarda. O número do pedido
                sozinho não serve para quem ainda precisa sair de casa. */}
            {retirada && resultado?.endereco_retirada && (
              <p className="confirma__retirada">
                Retire em <strong>{resultado.endereco_retirada}</strong>
              </p>
            )}
            <button
              className="btn btn--fantasma confirma__voltar"
              onClick={onFechar}
            >
              Voltar ao cardápio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
