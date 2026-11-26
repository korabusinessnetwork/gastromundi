import { useEffect, useRef } from "react";
import { baixarEstoqueNoBanco, baixarEstoqueSubprodutoNoBanco } from "@/features/estoque/dados/saldos";
import {
  gravarVendaNormalizada
} from "@/features/caixa/dados/vendas";
import { regravarComanda, atualizarComanda, excluirComanda } from "@/features/comandas/dados/comandas";
import { emitirEvento } from "@/lib/jarvas";
import { criarLancamento } from "@/lib/financeiro";
import { emitirDocumentoFiscal } from "@/features/fiscal/dados/fiscal";
import { gerarAlertaBaixaFalhou, iniciarLoteDeBaixas, fecharLoteDeBaixas } from "@/lib/estoque";
import { isErroDeRede } from "@/lib/offline/rede";
import { reportarFalha } from "@/lib/observabilidade";
import { separarCampos, COLUNAS_REPLAY_PENDING } from "@/lib/camposPermitidos";
import { drenarFila } from "@/lib/offline/fila";
import { filaOffline } from "@/lib/offline/filaApp";

// Reenvio da fila offline: quando a rede volta (e a carga terminou), reenvia
// cada operação guardada exatamente uma vez. Saiu da coordenação da carga na
// refatoração 3; o comportamento é coberto por AppContext.offlinePontaAPonta.test.jsx.
export function useDrenoFilaOffline({ cargaOffline, currentUser, loading, pendenciasOffline, products, redeOnline, tenantIdRef }) {
  const drenandoRef = useRef(false);

  // ── Offline-first (Leva 11): reenvio da fila local ───────────
  // Replay de uma operação guardada. Insert vira UPSERT por id: se a
  // primeira tentativa gravou mas a resposta se perdeu na queda de rede,
  // reenviar não duplica nem estoura chave única.
  const executarOpOffline = (op) => {
    if (op.tipo === "insert") return regravarComanda(op.payload);
    // A operação dormiu no localStorage até a rede voltar, e o navegador deixa
    // qualquer um editar o localStorage. Filtrar de novo na saída custa nada e
    // garante que o que volta da fila tem a mesma forma do que entrou nela.
    if (op.tipo === "update") {
      const { campos } = separarCampos(op.changes, COLUNAS_REPLAY_PENDING);
      return atualizarComanda(op.id, campos);
    }
    if (op.tipo === "delete") return excluirComanda(op.id);
    // Cobrança offline (não-TEF): venda fechada sem internet. Upsert por id
    // — se a primeira tentativa gravou mas a resposta se perdeu, reenviar
    // não duplica. Evento + gravação dupla só acontecem aqui, no reenvio
    // que confirmou (addSale offline pula os dois de propósito).
    if (op.tipo === "insert_venda") return reenviarVendaOffline(op);
    // O opId veio junto da operação original: reenviar com ele faz a RPC
    // reconhecer a baixa já aplicada em vez de descontar o item de novo.
    // Operação antiga (guardada antes desta versão) não tem opId — vai como
    // null e se comporta como antes, sem quebrar o dreno da fila.
    if (op.tipo === "rpc_baixar_estoque") {
      return baixarEstoqueNoBanco(op.produtoId, op.qtd, op.opId ?? null);
    }
    if (op.tipo === "rpc_baixar_estoque_subproduto") {
      return baixarEstoqueSubprodutoNoBanco(op.subprodutoId, op.qtd, op.opId ?? null);
    }
    if (op.tipo === "insert_lancamento") return criarLancamento(op.dados, op.usuario);
    // Nota que não saiu (rede caiu, SEFAZ fora do ar, Edge indisponível) não
    // pode sumir: a venda está registrada e a obrigação fiscal continua de pé.
    if (op.tipo === "emitir_nfce") return reemitirNfceOffline(op);
    return Promise.resolve({ error: null }); // tipo desconhecido — descarta
  };

  // Reemissão da NFC-e de uma venda cuja primeira tentativa nem chegou ao
  // servidor. Seguro repetir: a emissão é IDEMPOTENTE por vendaId no servidor
  // (ver nfceIdempotencia) — venda com nota já autorizada recebe a mesma nota
  // de volta, nunca sai uma segunda.
  const reemitirNfceOffline = async (op) => {
    const resultado = await emitirDocumentoFiscal(op.venda, { usuario: op.usuario });
    // Desfecho conclusivo (autorizada, rejeitada, ou pendente em contingência):
    // a nota tem destino e agora existe em nfce_emitidas — sai da fila.
    if (["autorizada", "rejeitada", "pendente"].includes(resultado?.status)) return { error: null };
    // "erro" (rede/servidor) e "sem_chave" (config fiscal incompleta): a nota
    // FICA na fila. Devolve um erro que `isErroDeRede` reconhece para o dreno
    // parar aqui em vez de descartar a nota como falha definitiva — insistir a
    // cada tentativa é justamente o que se quer de uma pendência fiscal.
    return { error: { message: "fetch failed", motivo_fiscal: resultado?.status ?? "erro" } };
  };

  // TD009 (etapa 3) — o reenvio grava só nas tabelas relacionais. `sales`
  // não recebe mais venda nenhuma.
  //
  // Idempotência (fecha a pendência 6 do ADR-013): o cabeçalho em `vendas`
  // bate em violação de unicidade quando a venda já subiu, e as filhas não
  // são reinseridas. Antes, o `upsert` protegia a LINHA mas não o EVENTO —
  // cada passada do dreno reemitia `venda.finalizada` e o Jarvas via a
  // mesma venda várias vezes. Agora o evento só sai quando a venda foi
  // gravada de fato.
  const reenviarVendaOffline = async (op) => {
    const sale = op.payload.data;
    const resultado = await gravarVendaNormalizada(sale, {
      onFalha: ({ etapa, error: e, venda_id }) => {
        // Rede caiu no meio do dreno: a op fica na fila e volta na próxima
        // passada. Isso é o dreno funcionando, não inconsistência de dado.
        if (isErroDeRede(e)) return;
        console.error(`gravação de venda (${etapa}) venda ${venda_id}:`, e);
        reportarFalha(e, { acao: "persistirVendaNormalizada", etapa, tabela: "vendas", venda_id, origem: "reenvioOffline" });
        emitirEvento("venda.gravacao.incompleta", "pdv", {
          venda_id,
          etapa,
          erro: e?.message ?? e?.code ?? String(e),
        }, currentUser?.username);
      },
    });

    // Cabeçalho não gravou = a venda não existe. Devolve o erro para o dreno
    // decidir: erro de rede para a fila inteira e preserva a venda; erro
    // definitivo (RLS, constraint) tira a op e vira aviso na tela.
    if (!resultado.cabecalhoGravado) {
      return { error: resultado.falhas[0]?.error ?? { message: "falha ao gravar a venda reenviada" } };
    }

    // Cabeçalho gravou e alguma filha falhou: a venda EXISTE e está
    // incompleta. Manter na fila reprocessaria só o cabeçalho (unicidade),
    // sem nunca consertar a filha — então a op sai e a inconsistência já
    // foi registrada pelo onFalha acima.
    if (!resultado.jaExistia) {
      emitirEvento("venda.finalizada", "pdv", {
        venda_id: sale.id,
        total: sale.total ?? null,
        metodo: sale.metodo ?? sale.payment ?? null,
        itens: Array.isArray(sale.items) ? sale.items.length : null,
      }, currentUser?.username);
    }
    return { error: null };
  };

  const drenarPendenciasOffline = async () => {
    if (drenandoRef.current || filaOffline.tamanho() === 0) return;
    drenandoRef.current = true;
    try {
      const { falhas } = await drenarFila({ fila: filaOffline, executar: executarOpOffline, isErroDeRede, tenantAtual: tenantIdRef.current });
      // Um drain que descarta várias baixas de uma vez é a cara da falha
      // sistêmica: o lote junta tudo num alerta só em vez de encher o painel
      // do Jarvas com um cartão por produto da fila.
      iniciarLoteDeBaixas();
      try {
        for (const { op, error } of falhas) {
          console.error("[offline] operação descartada no reenvio:", op.tipo, error?.message);
          // Falha NÃO-rede ao drenar: a op foi descartada (não é reenfileirada)
          // e aqui mora a não-idempotência do estoque / evento reemitido. É bug
          // silencioso — reporta com o tipo da op (drenarFila já separou rede).
          reportarFalha(error, { acao: "drenarPendenciasOffline", op: op?.tipo });
          // Baixa recusada no reenvio é o MESMO furo de inventário do TD012: a
          // venda saiu, o estoque não desceu, e a op foi descartada de vez. Sem
          // este alerta o buraco só aparece na contagem física — Sentry e evento
          // são para quem desenvolve, o Jarvas é o que o gestor abre.
          if (op?.tipo === "rpc_baixar_estoque") {
            const produto = products.find(p => String(p.id) === String(op.produtoId));
            void gerarAlertaBaixaFalhou(
              { produtoId: op.produtoId, nome: produto?.name ?? null, quantidade: op.qtd, erro: error },
              currentUser?.username,
            );
          } else if (op?.tipo === "rpc_baixar_estoque_subproduto") {
            void gerarAlertaBaixaFalhou(
              { subprodutoId: op.subprodutoId, nome: op.nome ?? null, quantidade: op.qtd, erro: error },
              currentUser?.username,
            );
          }
        }
      } finally {
        void fecharLoteDeBaixas(currentUser?.username);
      }
    } finally {
      drenandoRef.current = false;
      cargaOffline.definirPendencias(filaOffline.tamanho());
    }
  };

  useEffect(() => {
    if (redeOnline && !loading) drenarPendenciasOffline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redeOnline, loading, pendenciasOffline]);
}
