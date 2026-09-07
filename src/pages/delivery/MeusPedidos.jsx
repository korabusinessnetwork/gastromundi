// ──────────────────────────────────────────────────────────────────
// MeusPedidos — o que aconteceu com o pedido, sem criar conta.
//
// Antes, depois do "Pedido enviado!" o cliente não tinha mais nada: nem
// status, nem histórico, e nem o número do pedido se fechasse a aba. Aqui
// ele volta na página e encontra os próprios pedidos, porque o aparelho
// guarda uma identidade anônima (ver lib/deliveryDispositivo.js).
//
// Intuitividade (princípio nº 1): o estado do pedido é uma frase do dia a
// dia ("Saiu para entrega"), não um código; a linha do tempo mostra onde
// ele está sem exigir leitura; e "Pedir de novo" existe porque repetir o
// último pedido é o motivo nº 1 de alguém abrir esta tela.
// ──────────────────────────────────────────────────────────────────
import { formatarPreco } from "@/lib/delivery";
import { useSairDoModal } from "./useSairDoModal";
import "./MeusPedidos.css";

// Os mesmos estados do painel do estabelecimento (lib/deliveryPedidos.js),
// ditos para quem está esperando a comida e não para quem a despacha:
// "Novo pedido" é a visão de quem recebe; quem pediu quer saber que o
// restaurante VIU.
const ETAPAS = [
  { id: "recebido", cliente: "Pedido recebido" },
  { id: "em_preparo", cliente: "Em preparo" },
  { id: "saiu_entrega", cliente: "Saiu para entrega" },
  { id: "entregue", cliente: "Entregue" },
];

const ETAPAS_RETIRADA = [
  { id: "recebido", cliente: "Pedido recebido" },
  { id: "em_preparo", cliente: "Em preparo" },
  { id: "saiu_entrega", cliente: "Pronto para retirar" },
  { id: "entregue", cliente: "Retirado" },
];

export function etapasDoPedido(tipoEntrega) {
  return tipoEntrega === "retirada" ? ETAPAS_RETIRADA : ETAPAS;
}

/**
 * Em que passo o pedido está, e como se chama esse passo para o cliente.
 * Pura. `indice` é -1 quando o pedido saiu do fluxo (cancelado).
 */
export function situacaoDoPedido(pedido) {
  const etapas = etapasDoPedido(pedido?.tipo_entrega);
  if (pedido?.status === "cancelado") {
    return { indice: -1, rotulo: "Cancelado", cancelado: true, etapas };
  }
  const indice = etapas.findIndex((e) => e.id === pedido?.status);
  return {
    indice,
    // Status desconhecido (o painel pode ganhar um novo antes desta tela)
    // não vira código na cara do cliente: sem etapa conhecida, a frase
    // honesta é a de que o pedido está andando.
    rotulo: indice >= 0 ? etapas[indice].cliente : "Em andamento",
    cancelado: false,
    etapas,
  };
}

/** "hoje às 19:42" / "12/09 às 19:42" — data só quando não é hoje. */
export function quando(iso, agora = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const mesmoDia =
    d.getDate() === agora.getDate() &&
    d.getMonth() === agora.getMonth() &&
    d.getFullYear() === agora.getFullYear();
  if (mesmoDia) return `hoje às ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
}

function Pedido({ pedido }) {
  const { indice, rotulo, cancelado, etapas } = situacaoDoPedido(pedido);
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];

  return (
    <div className={`meu-pedido${cancelado ? " meu-pedido--cancelado" : ""}`}>
      <div className="meu-pedido__topo">
        <span className="meu-pedido__numero">Pedido {pedido.numero}</span>
        <span className="meu-pedido__quando">{quando(pedido.created_at)}</span>
      </div>

      <div className={`meu-pedido__status${cancelado ? " meu-pedido__status--cancelado" : ""}`}>
        {rotulo}
      </div>

      {/* Linha do tempo: onde o pedido está, sem precisar ler. Some no
          cancelado — não há caminho a percorrer. */}
      {!cancelado && (
        <ol className="meu-pedido__trilha" aria-label={`Situação: ${rotulo}`}>
          {etapas.map((e, i) => (
            <li
              key={e.id}
              className={`meu-pedido__passo${i <= indice ? " meu-pedido__passo--feito" : ""}`}
            >
              <span className="meu-pedido__passo-bolinha" aria-hidden="true" />
              <span className="meu-pedido__passo-texto">{e.cliente}</span>
            </li>
          ))}
        </ol>
      )}

      {itens.length > 0 && (
        <p className="meu-pedido__itens">
          {itens.map((i) => `${i.qtd}× ${i.nome}`).join(" · ")}
        </p>
      )}

      <div className="meu-pedido__rodape">
        <span className="meu-pedido__total">{formatarPreco(pedido.total)}</span>
        <span className="meu-pedido__tipo">
          {pedido.tipo_entrega === "retirada" ? "Retirada no local" : "Entrega"}
        </span>
      </div>
    </div>
  );
}

export default function MeusPedidos({
  pedidos,
  carregando,
  erro,
  onFechar,
  onTentarDeNovo,
  onEsquecer,
}) {
  // Sair daqui: tocar fora ou apertar Esc. Arrastar para selecionar
  // texto dentro do painel NÃO fecha — era esse o defeito.
  const fundo = useSairDoModal(onFechar);
  const vazio = !carregando && !erro && (pedidos ?? []).length === 0;

  return (
    <div className="modal-fundo" {...fundo}>
      <div className="modal-painel">
        <div className="modal-topo">
          <h2 className="modal-titulo">Meus pedidos</h2>
          <button className="modal-fechar" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="modal-corpo">
          {carregando && <div className="vitrine__aviso">Carregando seus pedidos…</div>}

          {!carregando && erro && (
            <div className="vitrine__aviso vitrine__aviso--erro" role="alert">
              <span>Não conseguimos carregar seus pedidos agora.</span>
              <button type="button" className="vitrine__aviso-acao" onClick={onTentarDeNovo}>
                Tentar de novo
              </button>
            </div>
          )}

          {vazio && (
            <div className="vitrine__estado">
              <div className="vitrine__estado-emoji">🧾</div>
              <p>
                Seus pedidos aparecem aqui assim que você fizer o primeiro — sem
                precisar criar conta.
              </p>
            </div>
          )}

          {(pedidos ?? []).map((p) => (
            <Pedido key={p.numero} pedido={p} />
          ))}

          {(pedidos ?? []).length > 0 && (
            <>
              {/* A verdade sobre o que isto é: fica guardado NESTE aparelho.
                  Prometer histórico eterno seria mentir para quem vai trocar
                  de celular. */}
              <p className="meus-pedidos__nota">
                Seus pedidos ficam guardados neste aparelho, sem cadastro. Se você
                limpar o navegador ou trocar de celular, eles somem daqui.
              </p>
              {/* Saída de quem pediu do celular de outra pessoa: sem isto, os
                  pedidos dela ficariam visíveis ali para sempre. */}
              <button type="button" className="meus-pedidos__esquecer" onClick={onEsquecer}>
                Não é você? Limpar deste aparelho
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
