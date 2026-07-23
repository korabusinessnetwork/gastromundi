// Leva 13 — o lado "caixa" da Ponte KORA.
//
// Roda só no PC do caixa (a página HTTPS enxerga http://localhost por
// exceção de conteúdo misto). Em ciclo curto:
//   1. procura a ponte (GET /saude);
//   2. quando acha: mantém o link do Palm salvo em config e o catálogo
//      da ponte atualizado (POST /snapshot);
//   3. busca pedidos que o Palm mandou pela rede local (GET /pedidos),
//      grava cada um na comanda (addPending — que já enfileira offline),
//      imprime a via de produção e confirma para a ponte apagar.
//
// Dedup em três camadas: id nasce no Palm e nunca muda → a ponte ignora
// reenvio → aqui um pedido cujo id já está em `pending` só é confirmado,
// nunca gravado de novo.

import { useEffect, useRef, useState } from "react";
import {
  pingPonte, buscarInfoPonte, enviarSnapshotPonte,
  buscarPedidosPonte, confirmarPedidosPonte, montarEnderecoPalm,
} from "@/lib/ponte";
import { imprimirViaProducaoRoteada } from "@/lib/impressao/despacho";

const INTERVALO_MS = 5000;
const SNAPSHOT_MIN_MS = 60 * 1000; // catálogo reenviado no máximo a cada 60s

/** Converte o pedido validado pela ponte no shape de `pending` do app. */
export function pedidoPonteParaComanda(pedido, { agora } = {}) {
  const criadoEm = agora ?? new Date().toISOString();
  return {
    id: pedido.id,
    comanda: pedido.comanda,
    mesa: pedido.mesa || null,
    apelido: pedido.apelido || null,
    items: (pedido.items ?? []).map((i) => ({ ...i, launched_at: criadoEm })),
    status: "open",
    note: pedido.note || "",
    total: pedido.total,
    garcom: pedido.garcom || "",
    created_by: pedido.garcom || "palm-local",
    created_at: criadoEm,
    updated_at: criadoEm,
  };
}

export function usePonteLocal({ ativo, products, pending, addPending, ponteEndereco, setPonteEndereco, redeOnline }) {
  const [disponivel, setDisponivel] = useState(false);
  const [info, setInfo] = useState(null);

  // Refs para o ciclo enxergar o estado atual sem reiniciar o interval.
  const estadoRef = useRef({});
  estadoRef.current = { products, pending, addPending, ponteEndereco, setPonteEndereco, redeOnline };

  const cicloAtivoRef = useRef(false);
  const snapshotEnviadoEmRef = useRef(0);
  const processadosRef = useRef(new Set()); // ids já gravados neste ciclo de vida

  useEffect(() => {
    if (!ativo) {
      setDisponivel(false);
      setInfo(null);
      return undefined;
    }

    const ciclo = async () => {
      if (cicloAtivoRef.current) return; // nunca dois ciclos ao mesmo tempo
      cicloAtivoRef.current = true;
      try {
        const { error: erroPing } = await pingPonte();
        if (erroPing) {
          setDisponivel(false);
          setInfo(null);
          return;
        }
        setDisponivel(true);

        const { data: dadosInfo } = await buscarInfoPonte();
        if (dadosInfo) {
          setInfo(dadosInfo);
          const atual = estadoRef.current;
          const endereco = montarEnderecoPalm(dadosInfo);
          // Endereço mudou (IP/token novo)? Grava em config — o Palm usa
          // esse valor para achar a ponte quando a internet cair.
          if (endereco && endereco !== atual.ponteEndereco && atual.redeOnline) {
            await atual.setPonteEndereco(endereco);
          }
        }

        // Catálogo para o Palm — throttle para não regravar à toa.
        const agora = Date.now();
        const temProdutos = (estadoRef.current.products?.length ?? 0) > 0;
        if (temProdutos && agora - snapshotEnviadoEmRef.current > SNAPSHOT_MIN_MS) {
          const { error: erroSnap } = await enviarSnapshotPonte({ products: estadoRef.current.products });
          if (!erroSnap) snapshotEnviadoEmRef.current = agora;
        }

        // Pedidos vindos do Palm pela rede local.
        const { data: dadosPedidos } = await buscarPedidosPonte();
        const registros = dadosPedidos?.pedidos ?? [];
        if (registros.length === 0) return;

        const confirmar = [];
        for (const registro of registros) {
          const pedido = registro?.pedido;
          if (!pedido?.id) continue;
          const jaGravado =
            processadosRef.current.has(pedido.id) ||
            (estadoRef.current.pending ?? []).some((o) => o.id === pedido.id);
          if (jaGravado) {
            confirmar.push(registro.id);
            continue;
          }
          const order = pedidoPonteParaComanda(pedido);
          const { error: erroGravar } = await estadoRef.current.addPending(order);
          if (erroGravar) {
            // Não confirma — a ponte segura o pedido e tentamos de novo.
            console.error("[ponte] falha ao gravar pedido do Palm:", erroGravar);
            continue;
          }
          processadosRef.current.add(pedido.id);
          confirmar.push(registro.id);
          // Impressão no fluxo já existente do app (mesmo da Cozinha):
          // via de produção roteada por local (Fase 1).
          try {
            const { error: erroImpressao } = await imprimirViaProducaoRoteada(order);
            if (erroImpressao) console.error("[ponte] falha ao imprimir pedido do Palm:", erroImpressao);
          } catch (err) {
            console.error("[ponte] falha ao imprimir pedido do Palm:", err);
          }
        }
        if (confirmar.length > 0) await confirmarPedidosPonte(confirmar);
      } finally {
        cicloAtivoRef.current = false;
      }
    };

    ciclo();
    const timer = setInterval(ciclo, INTERVALO_MS);
    return () => clearInterval(timer);
  }, [ativo]);

  return { disponivel, info };
}
