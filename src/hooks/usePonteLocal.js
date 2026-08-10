// Leva 13 — o lado "caixa" da Ponte KORA.
//
// Roda só no PC do caixa (a página HTTPS enxerga http://localhost por
// exceção de conteúdo misto). Em ciclo curto:
//   1. procura a ponte (GET /saude);
//   2. quando acha: mantém o link do Palm salvo em config e o catálogo
//      da ponte atualizado (POST /snapshot);
//   3. busca pedidos que o Palm mandou pela rede local (GET /pedidos),
//      grava cada um NA COMANDA CERTA (acumula se ela já estiver aberta,
//      abre nova se não), imprime a via de produção e confirma para a
//      ponte apagar.
//
// Dedup em três camadas: id nasce no Palm e nunca muda → a ponte ignora
// reenvio → aqui um pedido cujo rastro (`palm_pedido_id`) já está em
// `pending` só é confirmado, nunca gravado de novo.

import { useEffect, useRef, useState } from "react";
import {
  pingPonte, buscarInfoPonte, enviarSnapshotPonte,
  buscarPedidosPonte, confirmarPedidosPonte, montarEnderecoPalm, vincularPonte,
} from "@/lib/impressao/ponte";
import { imprimirLancamento } from "@/lib/impressao/despacho";
import { chaveLancamento, registroLancamentos } from "@/lib/impressao/lancamentos";
import {
  assinaturaComandasAbertas, encaixarPedidoDoPalm, pedidoJaGravado, resumirComandasAbertas,
} from "@/lib/impressao/ponteComandas";

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

export function usePonteLocal({ ativo, products, pending, addPending, updatePending, ponteEndereco, setPonteEndereco, redeOnline, estabelecimento }) {
  const [disponivel, setDisponivel] = useState(false);
  const [info, setInfo] = useState(null);

  // Refs para o ciclo enxergar o estado atual sem reiniciar o interval.
  const estadoRef = useRef({});
  estadoRef.current = { products, pending, addPending, updatePending, ponteEndereco, setPonteEndereco, redeOnline, estabelecimento };

  const cicloAtivoRef = useRef(false);
  const snapshotEnviadoEmRef = useRef(0);
  const comandasEnviadasRef = useRef(null); // assinatura das comandas abertas já enviadas
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

          // A Ponte é o MESMO .exe para qualquer cliente — quem diz de quem
          // ela é somos nós, na primeira vez que a encontramos. É isso que
          // faz o programa "se vincular sozinho": o dono não digita nada.
          const meuTenant = atual.estabelecimento?.id;
          if (meuTenant && dadosInfo.estabelecimento?.tenantId !== meuTenant) {
            // Fire-and-forget: falhar aqui não pode parar pedido nem impressão.
            const { error: erroVinculo } = await vincularPonte({
              tenantId: meuTenant,
              nome: atual.estabelecimento?.nome,
            });
            if (erroVinculo) console.error("[ponte] falha ao vincular ao estabelecimento:", erroVinculo);
          }

          const endereco = montarEnderecoPalm(dadosInfo);
          // Endereço mudou (IP/token novo)? Grava em config — o Palm usa
          // esse valor para achar a ponte quando a internet cair.
          if (endereco && endereco !== atual.ponteEndereco && atual.redeOnline) {
            await atual.setPonteEndereco(endereco);
          }
        }

        // Catálogo + comandas abertas para o Palm. O catálogo quase não muda
        // (throttle de 60s basta), mas comanda abre e fecha o tempo todo: se
        // a lista mudou, o snapshot vai na hora. É assim que o garçom vê no
        // celular offline a comanda que o caixa abriu com internet.
        const agora = Date.now();
        const temProdutos = (estadoRef.current.products?.length ?? 0) > 0;
        const comandas = resumirComandasAbertas(estadoRef.current.pending);
        const assinatura = assinaturaComandasAbertas(estadoRef.current.pending);
        const vencido = agora - snapshotEnviadoEmRef.current > SNAPSHOT_MIN_MS;
        if (temProdutos && (vencido || assinatura !== comandasEnviadasRef.current)) {
          const { error: erroSnap } = await enviarSnapshotPonte({
            products: estadoRef.current.products,
            comandas,
          });
          if (!erroSnap) {
            snapshotEnviadoEmRef.current = agora;
            comandasEnviadasRef.current = assinatura;
          }
        }

        // Pedidos vindos do Palm pela rede local.
        const { data: dadosPedidos } = await buscarPedidosPonte();
        const registros = dadosPedidos?.pedidos ?? [];
        if (registros.length === 0) return;

        // Cópia de trabalho das comandas: `estadoRef.current.pending` só
        // muda quando o React re-renderiza, o que não acontece no meio
        // deste laço. Sem isso, dois pedidos do Palm para a comanda 5
        // chegando no mesmo ciclo criariam duas comandas 5 de novo.
        let pendentes = estadoRef.current.pending ?? [];

        const confirmar = [];
        for (const registro of registros) {
          const pedido = registro?.pedido;
          if (!pedido?.id) continue;
          if (processadosRef.current.has(pedido.id) || pedidoJaGravado(pendentes, pedido.id)) {
            confirmar.push(registro.id);
            continue;
          }

          const order = pedidoPonteParaComanda(pedido);
          const encaixe = encaixarPedidoDoPalm(pendentes, order);

          // Marca ANTES de gravar: assim que a comanda entra/muda em
          // `pending` o vigia do realtime a enxerga, e sem isso o pedido do
          // Palm sairia em dois papéis (um aqui, outro no vigia). Quando o
          // pedido é acumulado, a chave é a da comanda que RECEBEU — não a
          // do pedido, que deixa de existir como comanda própria.
          const comandaId = encaixe.tipo === "acumular" ? encaixe.comandaId : order.id;
          const itensNovos = encaixe.tipo === "acumular" ? encaixe.itensNovos : encaixe.order.items;
          registroLancamentos.marcar(chaveLancamento(comandaId, order.created_at));

          const { error: erroGravar } = encaixe.tipo === "acumular"
            ? await estadoRef.current.updatePending(
                encaixe.comandaId,
                { items: encaixe.items, total: encaixe.total },
                { baseItems: encaixe.itensAnteriores },
              )
            : await estadoRef.current.addPending(encaixe.order);
          if (erroGravar) {
            // Não confirma — a ponte segura o pedido e tentamos de novo.
            console.error("[ponte] falha ao gravar pedido do Palm:", erroGravar);
            continue;
          }

          // Reflete a gravação na cópia de trabalho para o próximo pedido
          // deste mesmo ciclo enxergar a comanda já com os itens.
          pendentes = encaixe.tipo === "acumular"
            ? pendentes.map((o) => (o.id === encaixe.comandaId
                ? { ...o, items: encaixe.items, total: encaixe.total }
                : o))
            : [...pendentes, encaixe.order];

          processadosRef.current.add(pedido.id);
          confirmar.push(registro.id);
          // Pedido do Palm é um lançamento como qualquer outro: respeita a
          // mesma chave "Imprimir ao lançar" das Configurações. Sem isso,
          // desligar a chave pararia o papel do PDV e deixaria o do Palm
          // saindo — e o dono acharia que a chave não funciona. Sai só o que
          // ACABOU de entrar: a cozinha não pode receber de novo o que já
          // estava na comanda.
          try {
            const { error: erroImpressao } = await imprimirLancamento({
              ...(encaixe.tipo === "acumular" ? encaixe.comanda : encaixe.order),
              items: itensNovos,
            });
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
