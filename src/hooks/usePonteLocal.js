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
//      ponte apagar;
//   4. olha a fila de impressão da ponte (GET /impressao) para contar na
//      tela o que não saiu no papel.
//
// Dedup em três camadas: id nasce no Palm e nunca muda → a ponte ignora
// reenvio → aqui um pedido cujo rastro (`palm_pedido_id`) já está em
// `pending` só é confirmado, nunca gravado de novo.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  pingPonte, buscarInfoPonte, enviarSnapshotPonte, buscarFilaImpressaoPonte,
  buscarPedidosPonte, confirmarPedidosPonte, montarEnderecoPalm, vincularPonte,
} from "@/lib/ponte";
import { imprimirLancamento } from "@/lib/impressao/despacho";
import { chaveLancamento, registroLancamentos } from "@/lib/impressao/lancamentos";
import {
  assinaturaComandasAbertas, encaixarPedidoDoPalm, pedidoJaGravado, resumirComandasAbertas,
} from "@/lib/ponteComandas";

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

// --- O que não saiu no papel -------------------------------------------
//
// A Ponte guarda a fila de impressão em disco e tenta de novo sozinha, mas
// se a impressora está sem papel, desligada ou com o cabo solto ela desiste
// depois de algumas tentativas. Sem ninguém avisado, a cozinha simplesmente
// não recebe a comanda e o caixa só descobre quando o cliente reclama.

// Impressora boa cospe o papel em menos de um segundo, e a Ponte só tenta de
// novo depois de 5s. Esperar 20s antes de acusar evita encher a tela de
// alarme falso a cada comanda lançada.
export const ESPERA_PARA_AVISAR_MS = 20 * 1000;

// Papel que faltou no jantar de ontem não é problema do serviço de hoje: a
// Ponte guarda o histórico por 24h e, sem esta janela, o caixa abriria de
// manhã com o aviso da noite anterior em cima da tela.
//
// A janela vale para TUDO que este resumo conta — o que a Ponte já desistiu
// de imprimir, o que nem chegou até ela, e também o que ficou marcado como
// "ainda na fila". Trabalho na fila parece o caso que sempre merece aparecer,
// mas quando a Ponte para de responder a última fila conhecida congela aqui
// dentro e nada mais atualiza aquele estado: sem teto de idade, um trabalho
// enfileirado às 22h continuaria sendo contado na abertura do dia seguinte,
// que é exatamente o que esta janela existe para impedir.
export const JANELA_AVISO_MS = 2 * 60 * 60 * 1000;

const AINDA_NA_FILA = new Set(["na_fila", "imprimindo"]);

const emMs = (valor) => {
  const ms = Date.parse(valor ?? "");
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Resume, para a tela, o que a impressora ainda não colocou no papel.
 *
 * Conta IMPRESSÕES, não comandas — e a tela precisa dizer isso com essa
 * palavra. Um lançamento vira um trabalho na fila da Ponte POR PONTO DE
 * IMPRESSÃO configurado (src/lib/impressao/despacho.js fatia a via por
 * ponto), então uma comanda só, com a impressora do Bar desligada, pode
 * aparecer aqui como três; e a fila que a Ponte devolve carrega também
 * comprovante de pagamento e pré-nota mandados pelo caixa, que não são
 * comanda nenhuma. Chamar tudo de "comanda" era número errado numa tela
 * cujo único serviço é falar a verdade para quem está no balcão. A rota não
 * expõe a qual comanda cada trabalho pertence, então não dá para agrupar
 * sem inventar dado.
 *
 * @param {{trabalhos?: Array}|null} dadosFila resposta de GET /impressao.
 * @param {object} [opcoes]
 * @param {number} [opcoes.agora] relógio em ms — injetável para teste.
 * @param {Set<string>} [opcoes.dispensadas] o que alguém já foi conferir.
 * @param {Array<{chave: string, criadoEm: string}>} [opcoes.falhasLocais]
 *   impressões que nem chegaram à fila da Ponte.
 * @returns {{impressoes: number, esperaMs: number, chavesEncerradas: string[]}|null}
 *   `null` quando não há nada a dizer — e aí o aviso some da tela.
 */
export function resumirImpressaoParada(dadosFila, { agora, dispensadas, falhasLocais } = {}) {
  const agoraMs = agora ?? Date.now();
  const jaConferidas = dispensadas ?? new Set();
  const trabalhos = Array.isArray(dadosFila?.trabalhos) ? dadosFila.trabalhos : [];
  const paradas = [];

  for (const trabalho of trabalhos) {
    if (!trabalho?.id || jaConferidas.has(trabalho.id)) continue;
    const nasceuEm = emMs(trabalho.criadoEm);
    if (nasceuEm === null) continue;
    if (trabalho.estado === "falhou") {
      // A Ponte já desistiu desta: não sai mais sozinha, alguém precisa ir
      // até a impressora.
      const desistiuEm = emMs(trabalho.concluidoEm) ?? nasceuEm;
      if (agoraMs - desistiuEm > JANELA_AVISO_MS) continue;
      paradas.push({ chave: trabalho.id, criadoEm: nasceuEm, encerrada: true });
      continue;
    }
    if (!AINDA_NA_FILA.has(trabalho.estado)) continue;
    if (agoraMs - nasceuEm < ESPERA_PARA_AVISAR_MS) continue;
    // Piso E teto: trabalho que aparece como "na fila" há mais de duas horas
    // não é notícia do serviço de agora. Ou ele terminou e a Ponte parou de
    // responder antes de contar (a fila conhecida fica congelada aqui), ou
    // ficou preso desde ontem — nos dois casos o aviso já foi dado no dia
    // certo, e repeti-lo na abertura de hoje é o alarme que ninguém lê.
    if (agoraMs - nasceuEm > JANELA_AVISO_MS) continue;
    paradas.push({ chave: trabalho.id, criadoEm: nasceuEm, encerrada: false });
  }

  for (const falha of falhasLocais ?? []) {
    if (!falha?.chave || jaConferidas.has(falha.chave)) continue;
    const criadoEm = emMs(falha.criadoEm) ?? agoraMs;
    if (agoraMs - criadoEm > JANELA_AVISO_MS) continue;
    paradas.push({ chave: falha.chave, criadoEm, encerrada: true });
  }

  if (paradas.length === 0) return null;
  return {
    impressoes: paradas.length,
    esperaMs: Math.max(0, agoraMs - Math.min(...paradas.map((p) => p.criadoEm))),
    // O botão de conferir só pode calar o que não muda mais sozinho: o que
    // ainda está na fila continua na tela até sair no papel.
    chavesEncerradas: paradas.filter((p) => p.encerrada).map((p) => p.chave),
  };
}

export function usePonteLocal({ ativo, products, pending, addPending, updatePending, ponteEndereco, setPonteEndereco, redeOnline, estabelecimento }) {
  const [disponivel, setDisponivel] = useState(false);
  const [info, setInfo] = useState(null);
  // O que a impressora não deu conta de imprimir (null = nada a dizer).
  const [impressaoParada, setImpressaoParada] = useState(null);
  // A Ponte estava aqui e parou de responder — a tela não pode ficar verde.
  const [ponteSemResposta, setPonteSemResposta] = useState(false);
  // Estado do botão "Conferir de novo" da tela.
  const [conferindo, setConferindo] = useState(false);
  const [falhaAoConferir, setFalhaAoConferir] = useState(false);

  // Refs para o ciclo enxergar o estado atual sem reiniciar o interval.
  const estadoRef = useRef({});
  estadoRef.current = { products, pending, addPending, updatePending, ponteEndereco, setPonteEndereco, redeOnline, estabelecimento };

  const cicloAtivoRef = useRef(false);
  const snapshotEnviadoEmRef = useRef(0);
  const comandasEnviadasRef = useRef(null); // assinatura das comandas abertas já enviadas
  const processadosRef = useRef(new Set()); // ids já gravados neste ciclo de vida
  const filaImpressaoRef = useRef(null);     // última resposta de GET /impressao
  const falhasLocaisRef = useRef(new Map()); // o que nem chegou à fila da Ponte
  const dispensadasRef = useRef(new Set());  // o que alguém já foi conferir
  const conferindoRef = useRef(false);       // uma conferência por vez
  const ponteJaRespondeuRef = useRef(false); // achamos a Ponte alguma vez?

  const lerImpressaoParada = () => resumirImpressaoParada(filaImpressaoRef.current, {
    dispensadas: dispensadasRef.current,
    falhasLocais: [...falhasLocaisRef.current.values()],
  });

  // Só mexem em ref e em setState (ambos estáveis), por isso nascem sem
  // dependência: trocar a identidade delas reiniciaria o ciclo de 5s.
  const recalcularImpressaoParada = useCallback(() => {
    setImpressaoParada(lerImpressaoParada());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Impressão que nem chegou à fila da Ponte (impressora não configurada,
  // Ponte fechada no meio do lançamento). Antes isso morria num console.error
  // do navegador: a comanda não saía e ninguém no salão ficava sabendo.
  const registrarFalhaImpressao = useCallback((chave, criadoEm, erro) => {
    console.error("[ponte] falha ao imprimir pedido do Palm:", erro);
    if (!chave || dispensadasRef.current.has(chave)) return;
    falhasLocaisRef.current.set(chave, { chave, criadoEm: criadoEm ?? new Date().toISOString() });
    recalcularImpressaoParada();
  }, [recalcularImpressaoParada]); // eslint-disable-line react-hooks/exhaustive-deps

  // Botão "Conferir de novo" da tela: vai LER a fila da Ponte outra vez.
  //
  // Antes ele não lia nada — só recalculava em cima do que já estava na
  // memória e calava o alarme. O operador apertava o único botão da tela, o
  // vermelho sumia, a cozinha continuava sem o papel, e na terceira vez ele
  // não olhava mais o aviso. Botão que não resolve o que promete é pior do
  // que botão nenhum.
  //
  // Depois de reler: o que a Ponte já desistiu de imprimir não muda mais
  // sozinho e sai da tela (alguém acabou de ir olhar); o que ainda está na
  // fila continua aparecendo até sair no papel. Se a leitura falhar, NADA é
  // apagado — dizer "não consegui conferir agora" é honesto, apagar é mentira.
  const conferirImpressao = useCallback(async () => {
    if (conferindoRef.current) return; // dez cliques seguidos = uma leitura só
    conferindoRef.current = true;
    setConferindo(true);
    setFalhaAoConferir(false);
    try {
      const { data, error } = await buscarFilaImpressaoPonte();
      if (error) {
        setFalhaAoConferir(true);
        return;
      }
      filaImpressaoRef.current = data ?? null;
      // Acabamos de falar com ela: se estava dada como muda, não está mais.
      ponteJaRespondeuRef.current = true;
      setPonteSemResposta(false);
      for (const chave of lerImpressaoParada()?.chavesEncerradas ?? []) {
        dispensadasRef.current.add(chave);
        falhasLocaisRef.current.delete(chave);
      }
      recalcularImpressaoParada();
    } finally {
      conferindoRef.current = false;
      setConferindo(false);
    }
  }, [recalcularImpressaoParada]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ativo) {
      setDisponivel(false);
      setInfo(null);
      setImpressaoParada(null);
      setPonteSemResposta(false);
      setFalhaAoConferir(false);
      ponteJaRespondeuRef.current = false;
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
          // A Ponte parou de responder. Zerar a fila dela aqui era o pior dos
          // mundos: tudo que estava parado sumia da tela e o caixa ficava
          // limpo justamente quando nada mais é impresso. Fica o que se sabia
          // — e como nada mais atualiza esse retrato, quem envelhece além de
          // JANELA_AVISO_MS sai da conta sozinho em `resumirImpressaoParada`,
          // inclusive o que ficou congelado como "na fila". A tela passa a
          // dizer que não estamos conseguindo falar com ela.
          //
          // Só acusa quando ela já respondeu alguma vez neste turno: em PC que
          // nunca teve a Ponte aberta, um alarme permanente é o mesmo alarme
          // que ninguém lê.
          setPonteSemResposta(ponteJaRespondeuRef.current);
          recalcularImpressaoParada();
          return;
        }
        setDisponivel(true);
        ponteJaRespondeuRef.current = true;
        setPonteSemResposta(false);

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

        // Como vai a impressora. Lido em TODO ciclo, mesmo quando não veio
        // pedido nenhum do Palm: papel travado é justamente o que não mexe
        // nada na tela — a cozinha fica sem a comanda em silêncio.
        const { data: dadosFila } = await buscarFilaImpressaoPonte();
        filaImpressaoRef.current = dadosFila ?? null;
        recalcularImpressaoParada();

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
          const chaveImpressao = chaveLancamento(comandaId, order.created_at);
          registroLancamentos.marcar(chaveImpressao);

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
          //
          // Falhar aqui NÃO segura o pedido: ele já está em `pending` (a
          // fonte de verdade) e é a confirmação que impede a mesma comanda
          // de nascer duas vezes no ciclo seguinte. O que a falha precisa é
          // chegar a um humano — daí ela virar aviso na tela do caixa.
          try {
            const { error: erroImpressao } = await imprimirLancamento({
              ...(encaixe.tipo === "acumular" ? encaixe.comanda : encaixe.order),
              items: itensNovos,
            });
            if (erroImpressao) registrarFalhaImpressao(chaveImpressao, order.created_at, erroImpressao);
          } catch (err) {
            registrarFalhaImpressao(chaveImpressao, order.created_at, err);
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
  }, [ativo, recalcularImpressaoParada, registrarFalhaImpressao]);

  return { disponivel, info, impressaoParada, ponteSemResposta, conferindo, falhaAoConferir, conferirImpressao };
}
