import { useState } from "react";
import {
  LuX, LuClipboardList, LuMapPin, LuPhone, LuMessageCircle, LuChevronRight, LuChevronDown, LuBanknote
} from "react-icons/lu";
import {
  rotuloAcao, ehTerminal, podeCancelar, resumoEndereco, formatarTelefone, linkWhatsApp, resumoPagamento, tempoDecorrido, carregarItensPedido
} from "@/lib/deliveryPedidos";
import {
  formatarReais
} from "@/lib/deliveryAdmin";
import { baseCorStatus, cssCor } from "./corStatus";

export default function CardPedido({ pedido, isAdmin, onAvancar, onCancelar }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState(null); // null = ainda não buscou
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);

  const base = baseCorStatus(pedido.status);
  const acao = rotuloAcao(pedido.status);
  const endereco = resumoEndereco(pedido);
  const zap = linkWhatsApp(
    pedido.cliente_telefone,
    `Olá! Aqui é do delivery, sobre o seu pedido ${pedido.numero}.`
  );

  const toggleItens = async () => {
    const proximo = !aberto;
    setAberto(proximo);
    if (proximo && itens === null && !carregandoItens) {
      setCarregandoItens(true);
      const { data } = await carregarItensPedido(pedido.id);
      setItens(Array.isArray(data) ? data : []);
      setCarregandoItens(false);
    }
  };

  return (
    <div className="delivery-view__pedido">
      {/* Cabeçalho: número + tempo */}
      <div className="delivery-view__pedido-topo">
        <span className="delivery-view__pedido-num">
          <LuClipboardList size={14} color={cssCor(base)} /> {pedido.numero}
        </span>
        <span className="delivery-view__pedido-tempo">
          {tempoDecorrido(pedido.created_at)}
        </span>
      </div>

      {/* Cliente */}
      <div className="delivery-view__pedido-cliente">
        {pedido.cliente_nome || "Cliente"}
      </div>

      {/* Telefone → WhatsApp (só toque; número é do cliente) */}
      {pedido.cliente_telefone && (
        <div className="delivery-view__pedido-linha">
          <LuPhone size={13} /> {formatarTelefone(pedido.cliente_telefone)}
          {zap && (
            <a
              href={zap}
              target="_blank"
              rel="noopener noreferrer"
              className="delivery-view__zap"
              title="Falar com o cliente no WhatsApp"
            >
              <LuMessageCircle size={13} /> WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Endereço */}
      {endereco && (
        <div className="delivery-view__pedido-linha">
          <LuMapPin size={13} /> {endereco}
        </div>
      )}

      {/* Pagamento */}
      <div className="delivery-view__pedido-linha">
        <LuBanknote size={13} /> {resumoPagamento(pedido)}
      </div>

      {/* Itens (sob demanda) */}
      <button onClick={toggleItens} className="delivery-view__pedido-itens-toggle">
        {aberto ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
        {aberto ? "Ocultar itens" : "Ver itens"}
      </button>
      {aberto && (
        <div className="delivery-view__pedido-itens">
          {carregandoItens ? (
            <div className="delivery-view__pedido-itens-aviso">Carregando itens…</div>
          ) : itens && itens.length > 0 ? (
            itens.map((it) => (
              <div key={it.id} className="delivery-view__pedido-item">
                <span>{it.qtd}× {it.nome}</span>
                {it.obs && <span className="delivery-view__pedido-item-obs"> — {it.obs}</span>}
              </div>
            ))
          ) : (
            <div className="delivery-view__pedido-itens-aviso">Sem itens detalhados.</div>
          )}
        </div>
      )}

      {/* Total */}
      <div className="delivery-view__pedido-total">
        Total <strong>{formatarReais(pedido.total)}</strong>
      </div>

      {/* Ações — só admin/gerente toca o pedido */}
      {isAdmin && !ehTerminal(pedido.status) && (
        <div className="delivery-view__pedido-acoes">
          {acao && (
            <button
              onClick={onAvancar}
              className="delivery-view__btn delivery-view__btn--sm delivery-view__pedido-avancar"
            >
              {acao}
            </button>
          )}
          {podeCancelar(pedido.status) && (
            confirmarCancelar ? (
              <>
                <button
                  onClick={onCancelar}
                  className="delivery-view__btn delivery-view__btn--sm delivery-view__pedido-cancelar-confirma"
                >
                  Cancelar mesmo
                </button>
                <button
                  onClick={() => setConfirmarCancelar(false)}
                  className="delivery-view__btn delivery-view__btn--sm delivery-view__pedido-voltar"
                >
                  Voltar
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmarCancelar(true)}
                className="delivery-view__btn delivery-view__btn--sm delivery-view__pedido-cancelar"
                title="Cancelar este pedido"
              >
                <LuX size={13} />
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
