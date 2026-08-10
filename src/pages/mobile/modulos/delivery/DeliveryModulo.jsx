import { useEffect, useMemo, useState } from "react";
import {
  LuArrowLeft,
  LuBike,
  LuChevronDown,
  LuChevronRight,
  LuCircleCheck,
  LuClock,
  LuMessageCircle,
  LuRefreshCw,
  LuTruck,
  LuX,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import {
  STATUS_CANCELADO,
  STATUS_FLUXO,
  atualizarStatusPedido,
  carregarItensPedido,
  formatarReais,
  linkWhatsApp,
  podeCancelar,
  proximoStatus,
  resumoEndereco,
  resumoPagamento,
  rotuloAcao,
  statusCor,
  statusLabel,
  tempoDecorrido,
} from "@/lib/delivery/deliveryPedidos";
import { usePedidosDelivery } from "@/utils/hooks";
import "../modulos.css";
import "./DeliveryModulo.css";

/**
 * DeliveryModulo — tela mobile de Delivery no Palm (hub "Mais").
 *
 * Mesma fonte de dados da AbaPedidos do desktop (DeliveryView): tudo o que é
 * regra de negócio (fluxo de status, cores, rótulos, WhatsApp, formatação de
 * dinheiro/endereço/tempo) vem pronto de src/lib/delivery/deliveryPedidos.js — aqui só
 * existe apresentação + o laço de carregar/recarregar a lista.
 *
 * A lista vem do mesmo hook do desktop (usePedidosDelivery, em
 * src/utils/hooks.js): pedido novo do cliente e mudança feita por outro
 * operador chegam sozinhos, sem o garçom precisar tocar em nada — no celular
 * isso importa mais ainda, porque a tela fica no bolso. O botão de atualizar
 * no header fica como rede de segurança para o celular que perdeu sinal e
 * voltou — reconexão de websocket não repõe o que passou enquanto caiu.
 */

const ROTULOS_CHIP = {
  recebido: "Recebidos",
  em_preparo: "Em preparo",
  saiu_entrega: "Saiu p/ entrega",
  entregue: "Entregues",
};

const VAZIOS = {
  recebido: {
    Icone: LuBike,
    titulo: "Nenhum pedido novo",
    texto: "Quando um cliente pedir pelo cardápio online, ele aparece aqui na hora.",
  },
  em_preparo: {
    Icone: LuClock,
    titulo: "Nada em preparo agora",
    texto: "Pedidos aceitos ficam aqui até saírem para entrega.",
  },
  saiu_entrega: {
    Icone: LuTruck,
    titulo: "Ninguém em rota agora",
    texto: "Pedidos que saíram para entrega aparecem aqui.",
  },
  entregue: {
    Icone: LuCircleCheck,
    titulo: "Nenhuma entrega concluída ainda",
    texto: "Os pedidos que você finalizar ficam listados aqui.",
  },
};

// statusCor() devolve 6 tons possíveis (blue/amber/accent/green/red/muted),
// mas o cartão e o badge dos módulos só têm 4 variantes prontas. accent
// (saiu_entrega) e muted caem em "azul" — é informativo, não erro nem
// conclusão — em vez de inventar uma cor nova fora do design system.
function classeCorStatus(status) {
  const cor = statusCor(status);
  if (cor === "blue") return "azul";
  if (cor === "amber") return "warn";
  if (cor === "green") return "green";
  if (cor === "red") return "red";
  return "azul";
}

const CORES_PARA_BADGE = { azul: "info", warn: "warn", green: "ok", red: "erro" };

function classeBadge(status) {
  return CORES_PARA_BADGE[classeCorStatus(status)];
}

function pedidosDoDia(pedidos) {
  const hoje = new Date().toDateString();
  return pedidos.filter((p) => new Date(p.created_at).toDateString() === hoje).length;
}

export default function DeliveryModulo({ onVoltar }) {
  const { currentUser } = useApp();

  // Fonte única da lista: o hook já carrega, assina o realtime e expõe o
  // recarregar manual. `pedidos` pode vir null quando a consulta falha.
  const { pedidos: pedidosBrutos, carregando, erro, recarregar } = usePedidosDelivery();
  const pedidos = useMemo(() => pedidosBrutos ?? [], [pedidosBrutos]);
  const erroCarga = erro ? "Não conseguimos carregar os pedidos." : "";

  const [filtro, setFiltro] = useState(STATUS_FLUXO[0]);
  const [expandidos, setExpandidos] = useState(() => new Set());
  const [itensCache, setItensCache] = useState({});
  const [processando, setProcessando] = useState({});
  const [confirmandoCancelarId, setConfirmandoCancelarId] = useState(null);
  const [mensagem, setMensagem] = useState(null);

  // `carregando` do hook só cobre a primeira carga. O toque no botão de
  // atualizar precisa de resposta visível na hora — sem isso o garçom fica
  // sem saber se o toque pegou e toca de novo.
  const [atualizando, setAtualizando] = useState(false);
  const atualizar = async () => {
    if (atualizando) return;
    setAtualizando(true);
    await recarregar();
    setAtualizando(false);
  };
  const ocupado = carregando || atualizando;

  // O realtime traz os pedidos; o relógio do "tempo decorrido" é que precisa
  // correr sozinho, igual ao tick da Cozinha e do KDS de desktop.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const porStatus = useMemo(() => {
    const grupos = { recebido: [], em_preparo: [], saiu_entrega: [], entregue: [] };
    for (const pedido of pedidos) {
      const status = grupos[pedido?.status] ? pedido.status : "recebido";
      grupos[status].push(pedido);
    }
    // Fila, preparo e rota: o pedido mais antigo primeiro — é o próximo a
    // agir. Entregues: o mais recente no topo, como um registro do que
    // acabou de fechar.
    const porCriacao = (a, b) => new Date(a.created_at) - new Date(b.created_at);
    grupos.recebido.sort(porCriacao);
    grupos.em_preparo.sort(porCriacao);
    grupos.saiu_entrega.sort(porCriacao);
    grupos.entregue.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return grupos;
  }, [pedidos]);

  const lista = porStatus[filtro] ?? [];

  const emRota = porStatus.saiu_entrega.length;
  const hoje = pedidosDoDia(pedidos);
  const subtitulo =
    emRota > 0
      ? emRota === 1
        ? "1 pedido em rota"
        : `${emRota} pedidos em rota`
      : hoje === 1
        ? "1 pedido hoje"
        : `${hoje} pedidos hoje`;

  const avancar = async (pedido) => {
    const proximo = proximoStatus(pedido.status);
    if (!proximo || processando[pedido.id]) return;
    setProcessando((prev) => ({ ...prev, [pedido.id]: true }));
    setMensagem(null);
    const { error } = await atualizarStatusPedido(pedido.id, proximo, {
      de: pedido.status,
      operador: currentUser?.username,
      numero: pedido.numero,
    });
    setProcessando((prev) => ({ ...prev, [pedido.id]: false }));
    if (error) {
      setMensagem({ tipo: "erro", texto: "Não foi possível atualizar o pedido. Toque para tentar de novo." });
      return;
    }
    setMensagem({ tipo: "ok", texto: `Pedido #${pedido.numero}: ${statusLabel(proximo).toLowerCase()}.` });
    await recarregar();
  };

  const pedirCancelar = (pedido) => setConfirmandoCancelarId(pedido.id);
  const voltarCancelar = () => setConfirmandoCancelarId(null);

  const confirmarCancelar = async (pedido) => {
    if (processando[pedido.id]) return;
    setProcessando((prev) => ({ ...prev, [pedido.id]: true }));
    setMensagem(null);
    const { error } = await atualizarStatusPedido(pedido.id, STATUS_CANCELADO, {
      de: pedido.status,
      operador: currentUser?.username,
      numero: pedido.numero,
    });
    setProcessando((prev) => ({ ...prev, [pedido.id]: false }));
    setConfirmandoCancelarId(null);
    if (error) {
      setMensagem({ tipo: "erro", texto: "Não foi possível cancelar o pedido. Toque para tentar de novo." });
      return;
    }
    setMensagem({ tipo: "ok", texto: `Pedido #${pedido.numero} cancelado.` });
    await recarregar();
  };

  const toggleItens = async (pedido) => {
    setExpandidos((prev) => {
      const novo = new Set(prev);
      if (novo.has(pedido.id)) {
        novo.delete(pedido.id);
      } else {
        novo.add(pedido.id);
      }
      return novo;
    });
    // Refaz a busca quando a anterior falhou: sem isso o erro ficava em cache
    // e o pedido mostrava "Sem itens detalhados." para sempre — um pedido com
    // itens parecia um pedido vazio, e o entregador saía sem a comida certa.
    const cache = itensCache[pedido.id];
    if (!cache || cache.erro) {
      setItensCache((prev) => ({ ...prev, [pedido.id]: { carregando: true, dados: null, erro: false } }));
      const { data, error } = await carregarItensPedido(pedido.id);
      setItensCache((prev) => ({
        ...prev,
        [pedido.id]: { carregando: false, dados: error ? null : data ?? [], erro: Boolean(error) },
      }));
    }
  };

  return (
    <div className="mod-tela">
      <header className="mod-header">
        <div className="mod-header__textos">
          <h1 className="mod-header__titulo">Delivery</h1>
          <p className="mod-header__subtitulo">{subtitulo}</p>
        </div>
        <div className="delivery-modulo__headerAcoes">
          <button
            type="button"
            className="delivery-modulo__atualizar"
            onClick={atualizar}
            disabled={ocupado}
            aria-label="Atualizar pedidos"
          >
            <LuRefreshCw
              aria-hidden="true"
              className={ocupado ? "delivery-modulo__girando" : undefined}
            />
          </button>
          <button type="button" className="mod-header__voltar" onClick={onVoltar} aria-label="Voltar">
            <LuArrowLeft aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="mod-chips" role="tablist" aria-label="Etapa do pedido">
        {STATUS_FLUXO.map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={filtro === status}
            className={`mod-chip${filtro === status ? " mod-chip--ativo" : ""}`}
            onClick={() => setFiltro(status)}
          >
            {ROTULOS_CHIP[status]}
            <span className="mod-chip__contador">{porStatus[status].length}</span>
          </button>
        ))}
      </div>

      {mensagem ? (
        <p
          className={`delivery-modulo__mensagem delivery-modulo__mensagem--${mensagem.tipo}`}
          role={mensagem.tipo === "erro" ? "alert" : "status"}
        >
          {mensagem.texto}
        </p>
      ) : null}

      {carregando ? (
        <p className="mod-carregando">Carregando pedidos…</p>
      ) : erroCarga && pedidos.length === 0 ? (
        <div className="delivery-modulo__erroCarga">
          <p className="mod-erro" role="alert">
            {erroCarga}
          </p>
          <button
            type="button"
            className="mod-botao mod-botao--fantasma"
            onClick={atualizar}
            disabled={ocupado}
          >
            {atualizando ? "Tentando…" : "Tentar de novo"}
          </button>
        </div>
      ) : (
        <>
          {/* Falha COM pedidos carregados: faixa em cima, lista intacta. A
              tela de erro cheia trocava a lista por um aviso — o entregador
              perdia de vista os pedidos em rota por uma piscada de rede. A
              decisão olha `pedidos`, não `lista`: o chip pode estar
              legitimamente vazio (nenhum pedido naquela etapa). */}
          {erroCarga && (
            <div className="delivery-modulo__faixaErro" role="alert">
              <span className="delivery-modulo__faixaErro-texto">
                Não conseguimos atualizar agora. Estes são os pedidos da última
                atualização que deu certo.
              </span>
              <button
                type="button"
                className="mod-botao mod-botao--fantasma"
                onClick={atualizar}
                disabled={ocupado}
              >
                {atualizando ? "Tentando…" : "Tentar de novo"}
              </button>
            </div>
          )}
          {lista.length === 0 ? (
            <Vazio filtro={filtro} />
          ) : (
            <div className="mod-lista">
              {lista.map((pedido) => (
                <CartaoPedido
                  key={pedido.id}
                  pedido={pedido}
                  expandido={expandidos.has(pedido.id)}
                  itensInfo={itensCache[pedido.id]}
                  processando={Boolean(processando[pedido.id])}
                  confirmandoCancelar={confirmandoCancelarId === pedido.id}
                  onToggle={() => toggleItens(pedido)}
                  onAvancar={() => avancar(pedido)}
                  onPedirCancelar={() => pedirCancelar(pedido)}
                  onConfirmarCancelar={() => confirmarCancelar(pedido)}
                  onVoltarCancelar={voltarCancelar}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Vazio({ filtro }) {
  const { Icone, titulo, texto } = VAZIOS[filtro] ?? VAZIOS.recebido;
  return (
    <div className="mod-vazio">
      <Icone aria-hidden="true" />
      <p className="mod-vazio__titulo">{titulo}</p>
      <p className="mod-vazio__texto">{texto}</p>
    </div>
  );
}

function CartaoPedido({
  pedido,
  expandido,
  itensInfo,
  processando,
  confirmandoCancelar,
  onToggle,
  onAvancar,
  onPedirCancelar,
  onConfirmarCancelar,
  onVoltarCancelar,
}) {
  const corClasse = classeCorStatus(pedido.status);
  const acaoLabel = rotuloAcao(pedido.status);
  const endereco = resumoEndereco(pedido);
  const zap = linkWhatsApp(pedido.cliente_telefone, `Olá! Aqui é do delivery, sobre o seu pedido #${pedido.numero}.`);
  const podeCancelarPedido = podeCancelar(pedido.status);
  const temAcoes = Boolean(acaoLabel) || Boolean(zap) || podeCancelarPedido;

  return (
    <article className={`mod-cartao mod-cartao--${corClasse}`}>
      <button
        type="button"
        className="delivery-modulo__toque"
        onClick={onToggle}
        aria-expanded={expandido}
      >
        <div className="mod-cartao__topo">
          <span className="mod-cartao__titulo">
            #{pedido.numero} · {pedido.cliente_nome || "Cliente"}
          </span>
          <span className="mod-cartao__sub">{tempoDecorrido(pedido.created_at)}</span>
        </div>

        {endereco ? <p className="delivery-modulo__endereco">{endereco}</p> : null}

        <div className="mod-linha">
          <span>{resumoPagamento(pedido)}</span>
          <strong>{formatarReais(pedido.total)}</strong>
        </div>

        <div className="delivery-modulo__rodapeCartao">
          <span className={`mod-badge mod-badge--${classeBadge(pedido.status)}`}>
            {statusLabel(pedido.status)}
          </span>
          <span className="delivery-modulo__toggleItens">
            {expandido ? "Ocultar itens" : "Ver itens"}
            {expandido ? <LuChevronDown aria-hidden="true" /> : <LuChevronRight aria-hidden="true" />}
          </span>
        </div>
      </button>

      {expandido ? (
        <div className="delivery-modulo__itens">
          {itensInfo?.carregando ? (
            <p className="delivery-modulo__itensEstado">Carregando itens…</p>
          ) : itensInfo?.erro ? (
            <p className="mod-erro" role="alert">
              Não deu para carregar os itens. Feche e abra o pedido para tentar de novo.
            </p>
          ) : itensInfo?.dados?.length ? (
            itensInfo.dados.map((item) => (
              <div key={item.id} className="delivery-modulo__item">
                <span>
                  {item.qtd}× {item.nome}
                </span>
                {item.obs ? <span className="delivery-modulo__itemObs"> — {item.obs}</span> : null}
              </div>
            ))
          ) : (
            <p className="delivery-modulo__itensEstado">Sem itens detalhados.</p>
          )}
        </div>
      ) : null}

      {temAcoes ? (
        <div className="delivery-modulo__acoes">
          {acaoLabel ? (
            <button
              type="button"
              className="mod-botao mod-botao--primario mod-botao--bloco"
              onClick={onAvancar}
              disabled={processando}
            >
              {processando ? "Atualizando…" : acaoLabel}
            </button>
          ) : null}

          {zap || podeCancelarPedido ? (
            <div className="delivery-modulo__secundarias">
              {zap ? (
                <a
                  href={zap}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="delivery-modulo__zap"
                >
                  <LuMessageCircle aria-hidden="true" />
                  Falar no WhatsApp
                </a>
              ) : (
                <span />
              )}

              {podeCancelarPedido ? (
                confirmandoCancelar ? (
                  <div className="delivery-modulo__confirmarCancelar">
                    <button
                      type="button"
                      className="mod-botao mod-botao--fantasma"
                      onClick={onVoltarCancelar}
                      disabled={processando}
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      className="delivery-modulo__cancelarConfirmar"
                      onClick={onConfirmarCancelar}
                      disabled={processando}
                    >
                      {processando ? "Cancelando…" : "Cancelar mesmo"}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="delivery-modulo__cancelar" onClick={onPedirCancelar}>
                    <LuX aria-hidden="true" />
                    Cancelar
                  </button>
                )
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
