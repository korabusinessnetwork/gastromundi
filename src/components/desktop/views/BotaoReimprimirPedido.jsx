import { useState } from "react";
import { LuPrinter, LuCircleCheck, LuCircleAlert } from "react-icons/lu";
import { enviarViaProducao } from "@/lib/impressao/despacho";
import { carregarItensPedido } from "@/lib/deliveryPedidos";

/**
 * Reimpressão da via de produção de UM pedido de delivery, na própria aba
 * Delivery.
 *
 * Por que ela precisa existir aqui: a via sai sozinha quando o pedido
 * chega, mas a impressora fica sem papel, alguém joga o papel fora, a
 * bancada precisa de outra cópia. Antes a única saída era achar a comanda
 * na tela da Cozinha — e desde que o delivery deixou de aparecer nas
 * comandas do PDV, quem está olhando os pedidos aqui não tinha para onde
 * ir.
 *
 * Os itens são buscados na hora, e não guardados no cartão: o cartão
 * mostra o resumo do pedido, e carregar item de todo pedido do painel só
 * porque UM pode ser reimpresso é pagar a conta de todo mundo pelo caso
 * raro.
 *
 * Fire-and-forget, como o botão irmão do PDV: `enviarViaProducao` nunca
 * lança e devolve { error }. O estado (imprimindo/erro/sucesso) aparece
 * ao lado sem travar o painel.
 */
export default function BotaoReimprimirPedido({ pedido }) {
  const [status, setStatus] = useState(null); // null | "imprimindo" | "erro" | "sucesso"
  const [mensagemErro, setMensagemErro] = useState("");

  const reimprimir = async () => {
    if (status === "imprimindo" || !pedido?.id) return;
    setStatus("imprimindo");
    setMensagemErro("");

    const { data: itens, error: erroItens } = await carregarItensPedido(pedido.id);
    if (erroItens || !Array.isArray(itens) || itens.length === 0) {
      setMensagemErro("Não foi possível ler os itens deste pedido.");
      setStatus("erro");
      return;
    }

    // O formato que `montarViaProducao` espera é o do `pending` (name/qty),
    // não o da tabela do delivery (nome/qtd). Traduzir aqui mantém o
    // caminho de impressão idêntico ao do lançamento do PDV — mesmo
    // roteamento por ponto, mesmo papel.
    const { error } = await enviarViaProducao({
      id: pedido.id,
      comanda:
        pedido.tipo_entrega === "retirada"
          ? `Retirada ${pedido.numero}`
          : `Delivery ${pedido.numero}`,
      apelido: pedido.cliente_nome || null,
      items: itens.map((i) => ({
        id: i.produto_id ?? i.combo_id ?? null,
        name: i.nome,
        qty: i.qtd,
        obs: i.obs ? [i.obs] : [],
      })),
    });

    if (error) {
      setMensagemErro(error.message ?? "Não foi possível imprimir agora.");
      setStatus("erro");
      return;
    }
    setStatus("sucesso");
    setTimeout(() => setStatus((s) => (s === "sucesso" ? null : s)), 2500);
  };

  return (
    <span className="delivery-view__reimprimir-wrap">
      <button
        type="button"
        onClick={reimprimir}
        disabled={status === "imprimindo"}
        className="delivery-view__reimprimir"
        title="Imprimir a via desta comanda de novo"
      >
        <LuPrinter size={13} />
        {status === "imprimindo" ? "Imprimindo…" : "Reimprimir"}
      </button>
      {status === "sucesso" && (
        <span className="delivery-view__reimprimir-ok">
          <LuCircleCheck size={13} /> Saiu
        </span>
      )}
      {status === "erro" && (
        <span className="delivery-view__reimprimir-erro" title={mensagemErro}>
          <LuCircleAlert size={13} /> {mensagemErro}
        </span>
      )}
    </span>
  );
}
