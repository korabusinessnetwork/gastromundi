import { useState, useEffect, useMemo } from "react";
import { LuX, LuClipboardList, LuMapPin, LuPhone, LuMessageCircle, LuChevronRight, LuChevronDown, LuBanknote, LuBike, LuCheck } from "react-icons/lu";
import { rotuloAcao, ehTerminal, podeCancelar, resumoEndereco, formatarTelefone, resumoPagamento, tempoDecorrido, carregarItensPedido, STATUS_CANCELADO, linkWhatsAppDoPedido } from "@/features/delivery/dados/deliveryPedidos";
import {
  formatarReais
} from "@/features/delivery/deliveryAdmin";
import { baseCorStatus, cssCor } from "./corStatus";
import { sanitizarValorEntrega, valorPadraoParaPedido } from "@/features/delivery/dados/entregadores";
import BotaoReimprimirPedido from "@/features/delivery/desktop/BotaoReimprimirPedido";

export default function CardPedido({
  pedido,
  isAdmin,
  ehAddon: _ehAddon,
  entregadores = [],
  entregadoresAtivos: ativos = [],
  loja = {},
  onAvancar,
  onCancelar,
  onAtribuirEntregador,
}) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState(null); // null = ainda não buscou
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);

  const base = baseCorStatus(pedido.status);
  const acao = rotuloAcao(pedido.status);
  const endereco = resumoEndereco(pedido);
  // ── Entregador atribuído a este pedido ──────────────────────────
  const cancelado = pedido.status === STATUS_CANCELADO;
  const atribuidoId = pedido.entregador_id ? String(pedido.entregador_id) : "";
  const entregadorAtual = atribuidoId
    ? entregadores.find((e) => String(e.id) === atribuidoId) || null
    : null;
  const nomeAtual = entregadorAtual?.nome || (atribuidoId ? "Entregador removido" : "");

  // O botão é um só; quem escolhe o texto é o ESTADO do pedido (confirmação
  // enquanto está em preparo, "saiu para entrega" depois). Operador não
  // devia ter de escolher qual mensagem mandar — ele já sabe onde o pedido
  // está, e a tela também.
  //
  // Os itens só entram depois que o cartão foi aberto (é quando eles são
  // buscados). Fechado, a mensagem sai sem a lista em vez de não sair.
  const zap = linkWhatsAppDoPedido(
    pedido,
    { ...loja, entregador: nomeAtual || undefined },
    itens ?? [],
  );

  // Opções do seletor: os ativos + o já atribuído (mesmo se desativado depois),
  // pra não sumir com quem está tocando este pedido.
  const opcoes = useMemo(() => {
    const lista = [...ativos];
    if (atribuidoId && !lista.some((e) => String(e.id) === atribuidoId)) {
      lista.push(entregadorAtual || { id: atribuidoId, nome: nomeAtual });
    }
    return lista;
  }, [ativos, atribuidoId, entregadorAtual, nomeAtual]);

  // Valor da corrida (fotografado). Campo editável espelha o salvo e
  // ressincroniza quando a fonte muda (troca de entregador / realtime).
  const valorSalvo = sanitizarValorEntrega(pedido.valor_entregador);
  const [valorTxt, setValorTxt] = useState(valorSalvo ? String(valorSalvo) : "");
  useEffect(() => {
    setValorTxt(valorSalvo ? String(valorSalvo) : "");
  }, [atribuidoId, valorSalvo]);
  const valorMudou = !!atribuidoId && sanitizarValorEntrega(valorTxt) !== valorSalvo;

  const escolherEntregador = (id) => {
    if (!onAtribuirEntregador) return;
    if (!id) return onAtribuirEntregador(pedido, null);
    const ent = entregadores.find((e) => String(e.id) === String(id));
    onAtribuirEntregador(pedido, id, valorPadraoParaPedido(ent));
  };

  const salvarValor = () => {
    if (!onAtribuirEntregador || !atribuidoId) return;
    onAtribuirEntregador(pedido, atribuidoId, sanitizarValorEntrega(valorTxt));
  };

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
        {/* Sem esta etiqueta o pedido de retirada era idêntico a um de
            entrega, com o endereço da PRÓPRIA loja no lugar do endereço do
            cliente — e alguém sairia para entregar no balcão de onde saiu. */}
        {pedido.tipo_entrega === "retirada" && (
          <span className="delivery-view__pedido-retirada">Retirada</span>
        )}
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

      {/* Itens (sob demanda) + reimpressão da via.
          A via sai sozinha quando o pedido chega, mas a impressora fica sem
          papel, alguém joga o papel fora, a bancada precisa de outra cópia.
          Antes a única saída era achar a comanda na tela da Cozinha — e ela
          nem aparece mais nas comandas do PDV. */}
      <div className="delivery-view__pedido-acoes-linha">
        <button onClick={toggleItens} className="delivery-view__pedido-itens-toggle">
          {aberto ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
          {aberto ? "Ocultar itens" : "Ver itens"}
        </button>
        <BotaoReimprimirPedido pedido={pedido} />
      </div>
      {aberto && (
        <div className="delivery-view__pedido-itens">
          {carregandoItens ? (
            <div className="delivery-view__pedido-itens-aviso">Carregando itens…</div>
          ) : itens && itens.length > 0 ? (
            itens.map((it) => (
              <div key={it.id} className="delivery-view__pedido-item">
                <span>{it.qtd}× {it.nome}</span>
                {it.obs && <span className="delivery-view__pedido-item-obs">, {it.obs}</span>}
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

      {/* Entregador — quem leva o pedido (atribuição + valor da corrida).
          Oculto em pedido cancelado. Admin escolhe e ajusta o valor; demais
          veem só quem está com o pedido. */}
      {!cancelado && (
        <div className="delivery-view__pedido-entregador">
          <span className="delivery-view__pedido-entregador-rotulo">
            <LuBike size={13} /> Entregador
          </span>

          {isAdmin && onAtribuirEntregador ? (
            opcoes.length === 0 ? (
              <span className="delivery-view__entregador-vazio">
                Cadastre entregadores na aba “Entregadores”.
              </span>
            ) : (
              <select
                className="delivery-view__entregador-select"
                value={atribuidoId}
                onChange={(e) => escolherEntregador(e.target.value)}
                title="Escolha quem vai levar este pedido"
              >
                <option value="">Sem entregador</option>
                {opcoes.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
            )
          ) : (
            <span className="delivery-view__entregador-nome">
              {nomeAtual || "Sem entregador"}
            </span>
          )}

          {isAdmin && atribuidoId && (
            <div className="delivery-view__entregador-valor">
              <span className="delivery-view__entregador-valor-cifrao">R$</span>
              <input
                type="text"
                inputMode="decimal"
                className="delivery-view__entregador-valor-input"
                value={valorTxt}
                onChange={(e) => setValorTxt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && valorMudou) salvarValor(); }}
                title="Quanto pagar ao entregador por esta corrida"
                aria-label="Valor desta corrida"
              />
              <span className="delivery-view__entregador-valor-legenda">por esta entrega</span>
              {valorMudou && (
                <button
                  type="button"
                  className="delivery-view__btn delivery-view__btn--sm delivery-view__entregador-valor-salvar"
                  onClick={salvarValor}
                  title="Salvar o valor desta corrida"
                >
                  <LuCheck size={13} />
                </button>
              )}
            </div>
          )}

          {!isAdmin && atribuidoId && valorSalvo > 0 && (
            <span className="delivery-view__entregador-valor-ro">
              {formatarReais(valorSalvo)}
            </span>
          )}
        </div>
      )}

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
