// Ponte KORA — lógica pura da fila de impressão.
//
// Por que existe:
// - Impressora térmica é um recurso que falha o tempo todo no mundo real:
//   sem papel, desligada, cabo solto, outro trabalho na frente. Se o app
//   mandasse direto, a comanda simplesmente sumia.
// - A ponte aceita o trabalho, grava em disco (dados/impressao.json) e
//   tenta de novo sozinha com espera crescente. O garçom não precisa saber
//   que a impressora estava ocupada — ela imprime quando voltar.
// - Aqui não há `fs` nem timer: só as regras (validar, escolher o próximo,
//   avançar de estado, podar). Quem persiste e agenda é servidor.js — assim
//   cada regra nasce com teste (lib/filaImpressao.test.js).

// Espera entre tentativas: 5s → 15s → 60s (a partir da 3ª falha, 60s).
export const BACKOFF_MS = [5000, 15000, 60000];

// Depois disso o trabalho vira `falhou` e para de tentar — alguém precisa
// olhar a impressora. Ficar tentando para sempre esconderia o problema.
export const MAX_TENTATIVAS = 5;

// Retenção/tamanho do arquivo da fila (não pode crescer sem teto).
export const RETENCAO_FINALIZADO_MS = 24 * 60 * 60 * 1000;
export const MAX_TRABALHOS = 200;

// Limites defensivos do corpo de POST /imprimir.
export const MAX_LINHAS = 400;
export const MAX_CARACTERES_LINHA = 400;
export const MAX_COPIAS = 5;
export const MAX_TEXTO_DESTINO = 120;
export const PORTA_RAW_PADRAO = 9100; // porta de fato de impressora de rede

const FINALIZADOS = new Set(["concluido", "falhou"]);

function paraMs(valor) {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  const ms = Date.parse(valor ?? "");
  return Number.isFinite(ms) ? ms : Date.now();
}

function paraIso(valor) {
  return new Date(paraMs(valor)).toISOString();
}

function textoLimpo(valor, max = MAX_TEXTO_DESTINO) {
  if (typeof valor !== "string") return "";
  // Controle fora: nome de impressora/host nunca tem \r\n, e deixar passar
  // só serviria para sujar log e linha de comando.
  return valor.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

/**
 * Valida o destino da impressão. Dois tipos, os dois sem dependência npm:
 *   { tipo: "windows", nome: "EPSON TM-T20" }        → spooler do Windows (RAW)
 *   { tipo: "rede", host: "192.168.0.50", porta: 9100 } → socket direto
 *
 * @returns {{ok: true, destino: object} | {ok: false, erro: string}}
 */
export function validarDestino(destino) {
  if (!destino || typeof destino !== "object" || Array.isArray(destino)) {
    return { ok: false, erro: "Escolha a impressora antes de imprimir." };
  }

  if (destino.tipo === "windows") {
    const nome = textoLimpo(destino.nome);
    if (!nome) return { ok: false, erro: "Informe o nome da impressora instalada no Windows." };
    return { ok: true, destino: { tipo: "windows", nome } };
  }

  if (destino.tipo === "rede") {
    const host = textoLimpo(destino.host).replace(/\s/g, "");
    if (!host) return { ok: false, erro: "Informe o endereço (IP) da impressora de rede." };
    const porta = destino.porta === undefined || destino.porta === null || destino.porta === ""
      ? PORTA_RAW_PADRAO
      : Number(destino.porta);
    if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
      return { ok: false, erro: "Porta da impressora inválida (use 9100, o padrão)." };
    }
    return { ok: true, destino: { tipo: "rede", host, porta } };
  }

  return { ok: false, erro: 'Tipo de impressora desconhecido — use "windows" ou "rede".' };
}

/**
 * Valida o corpo de POST /imprimir e devolve o registro pronto para a fila.
 *
 * @param {{destino: object, linhas: string[], cortaPapel?: boolean, copias?: number}} corpo
 * @param {{agora?: string|number, id?: string}} [opts]
 * @returns {{ok: true, trabalho: object} | {ok: false, erro: string}}
 */
export function criarTrabalho(corpo, { agora, id } = {}) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return { ok: false, erro: "Pedido de impressão inválido." };
  }

  const alvo = validarDestino(corpo.destino);
  if (!alvo.ok) return alvo;

  if (!Array.isArray(corpo.linhas)) return { ok: false, erro: "Envie as linhas do documento a imprimir." };
  if (corpo.linhas.length === 0) return { ok: false, erro: "Não há nada para imprimir." };
  if (corpo.linhas.length > MAX_LINHAS) return { ok: false, erro: `Documento muito longo (máximo de ${MAX_LINHAS} linhas).` };
  if (corpo.linhas.some((l) => typeof l !== "string")) return { ok: false, erro: "Cada linha do documento precisa ser texto." };

  const copiasBrutas = corpo.copias === undefined || corpo.copias === null ? 1 : Number(corpo.copias);
  if (!Number.isInteger(copiasBrutas) || copiasBrutas < 1 || copiasBrutas > MAX_COPIAS) {
    return { ok: false, erro: `Número de cópias inválido (de 1 a ${MAX_COPIAS}).` };
  }

  const criadoEm = paraIso(agora);
  return {
    ok: true,
    trabalho: {
      id: id ?? `imp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      criadoEm,
      destino: alvo.destino,
      // Corta o controle aqui também: o que entra na fila já é o que vai
      // para a impressora, sem surpresa depois.
      linhas: corpo.linhas.map((l) => l.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, MAX_CARACTERES_LINHA)),
      cortaPapel: corpo.cortaPapel === false ? false : true,
      copias: copiasBrutas,
      estado: "na_fila",
      tentativas: 0,
      proximaTentativaEm: criadoEm,
      erro: null,
    },
  };
}

/**
 * Primeiro trabalho pronto para ir à impressora — `na_fila` cuja espera
 * de backoff já passou. `null` quando não há nada a fazer agora.
 */
export function proximoTrabalho(fila, agora) {
  const agoraMs = paraMs(agora);
  const lista = Array.isArray(fila) ? fila : [];
  return lista.find((t) => t?.estado === "na_fila" && paraMs(t.proximaTentativaEm) <= agoraMs) ?? null;
}

function mapear(fila, id, transformar) {
  return (Array.isArray(fila) ? fila : []).map((t) => (t?.id === id ? transformar(t) : t));
}

/**
 * Trabalho saiu da fila e está com a impressora (o worker segura um por vez).
 */
export function marcarImprimindo(fila, id, agora) {
  return mapear(fila, id, (t) => ({ ...t, estado: "imprimindo", iniciadoEm: paraIso(agora) }));
}

/**
 * Imprimiu. Fica no arquivo por 24h só para o caixa conferir o histórico.
 */
export function marcarConcluido(fila, id, agora) {
  return mapear(fila, id, (t) => ({ ...t, estado: "concluido", concluidoEm: paraIso(agora), erro: null }));
}

/**
 * Não imprimiu. Conta a tentativa e agenda a próxima com espera crescente;
 * esgotadas as tentativas, vira `falhou` e para (alguém tem que olhar).
 */
export function marcarFalha(fila, id, erro, agora) {
  const agoraMs = paraMs(agora);
  const mensagem = typeof erro === "string" ? erro.slice(0, 300) : (erro?.message ?? "Falha desconhecida na impressão.").slice(0, 300);

  return mapear(fila, id, (t) => {
    const tentativas = (Number(t.tentativas) || 0) + 1;
    if (tentativas >= MAX_TENTATIVAS) {
      return { ...t, estado: "falhou", tentativas, erro: mensagem, concluidoEm: new Date(agoraMs).toISOString() };
    }
    const espera = BACKOFF_MS[Math.min(tentativas - 1, BACKOFF_MS.length - 1)];
    return {
      ...t,
      estado: "na_fila",
      tentativas,
      erro: mensagem,
      proximaTentativaEm: new Date(agoraMs + espera).toISOString(),
    };
  });
}

/**
 * Trabalho que ficou `imprimindo` quando a ponte foi fechada/faltou luz.
 * Volta para a fila — a comanda não saiu, então tentar de novo é o certo.
 * (Não conta como tentativa: não houve resposta da impressora.)
 */
export function destravarImprimindo(fila, agora) {
  const quando = paraIso(agora);
  return (Array.isArray(fila) ? fila : []).map((t) =>
    t?.estado === "imprimindo" ? { ...t, estado: "na_fila", proximaTentativaEm: quando } : t,
  );
}

/**
 * Quantos trabalhos ainda vão para a impressora (é o número que o caixa vê).
 */
export function contarPendentes(fila) {
  return (Array.isArray(fila) ? fila : []).filter((t) => t?.estado === "na_fila" || t?.estado === "imprimindo").length;
}

/**
 * Descarta concluídos/falhados com mais de 24h e segura o arquivo em
 * MAX_TRABALHOS registros. Pendente só é descartado no caso absurdo de
 * haver mais de 200 esperando — aí a impressora está fora do ar há horas.
 */
export function podarFila(fila, agora) {
  const agoraMs = paraMs(agora);
  const lista = (Array.isArray(fila) ? fila : []).filter((t) => t && typeof t === "object");

  const sobreviventes = lista.filter((t) => {
    if (!FINALIZADOS.has(t.estado)) return true;
    const em = Date.parse(t.concluidoEm ?? t.criadoEm ?? "");
    if (!Number.isFinite(em)) return false; // data ilegível: é lixo, sai
    return agoraMs - em < RETENCAO_FINALIZADO_MS;
  });

  if (sobreviventes.length <= MAX_TRABALHOS) return sobreviventes;

  // Ainda estourou: descarta os finalizados mais antigos primeiro,
  // preservando quem ainda vai imprimir.
  const excedente = sobreviventes.length - MAX_TRABALHOS;
  const descartar = new Set();
  for (const t of sobreviventes) {
    if (descartar.size >= excedente) break;
    if (FINALIZADOS.has(t.estado)) descartar.add(t);
  }
  const podada = sobreviventes.filter((t) => !descartar.has(t));
  return podada.length <= MAX_TRABALHOS ? podada : podada.slice(podada.length - MAX_TRABALHOS);
}

/**
 * Limpeza manual (POST /impressao/limpar): tira do arquivo o que já
 * terminou, com ou sem sucesso. Nunca mexe em quem ainda vai imprimir.
 *
 * @returns {{fila: Array, removidos: number}}
 */
export function limparFinalizados(fila) {
  const lista = Array.isArray(fila) ? fila : [];
  const nova = lista.filter((t) => !FINALIZADOS.has(t?.estado));
  return { fila: nova, removidos: lista.length - nova.length };
}
