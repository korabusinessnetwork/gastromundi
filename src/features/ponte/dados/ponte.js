// Cliente da Ponte KORA (Leva 13) — fala com o servidor local que roda
// no PC do caixa (ponte/servidor.js) via http://localhost, a única origem
// http:// que um app HTTPS pode alcançar (exceção de conteúdo misto).
//
// Contrato no padrão do resto do app: sempre resolve { data, error } —
// nunca lança. Timeouts curtos: a ponte é local, ou responde em
// milissegundos ou não está rodando.

const PORTA_PADRAO = 8123;

export const PONTE_URL = `http://localhost:${PORTA_PADRAO}`;

const TIMEOUT_MS = 3000;

async function chamarPonte(caminho, { metodo = "GET", corpo } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(`${PONTE_URL}${caminho}`, {
      method: metodo,
      signal: controller.signal,
      ...(corpo !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }
        : {}),
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      return { data: null, error: new Error(dados?.erro || `ponte respondeu ${resposta.status}`) };
    }
    return { data: dados, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  } finally {
    clearTimeout(timer);
  }
}

/** A ponte está rodando neste PC? (GET /saude) */
export async function pingPonte() {
  const { data, error } = await chamarPonte("/saude");
  return { data: error ? null : data, error };
}

/** Info de gestão: token, endereços da rede, pendentes. (GET /info) */
export async function buscarInfoPonte() {
  return chamarPonte("/info");
}

/** Envia o catálogo/config para a ponte servir ao Palm. (POST /snapshot) */
export async function enviarSnapshotPonte(snapshot) {
  return chamarPonte("/snapshot", { metodo: "POST", corpo: snapshot });
}

/** Pedidos que o Palm mandou e o caixa ainda não gravou. (GET /pedidos) */
export async function buscarPedidosPonte() {
  return chamarPonte("/pedidos");
}

/** Avisa a ponte que os pedidos foram gravados/impressos. (POST /pedidos/confirmar) */
export async function confirmarPedidosPonte(ids) {
  return chamarPonte("/pedidos/confirmar", { metodo: "POST", corpo: { ids } });
}

// --- Impressão (Tarefa I) --------------------------------------------
// A Ponte é quem fala com a impressora: o app só manda LINHAS de texto
// e o destino; ela monta os bytes ESC/POS, grava a fila em disco e
// reimprime sozinha se a impressora estiver ocupada/desligada.

// Quando a Ponte não responde, quem lê a mensagem é o dono do
// restaurante no meio do serviço — precisa saber o que fazer, não o
// nome do erro de rede. Erro HTTP da própria Ponte (que já vem em
// português) passa direto.
const AVISO_PONTE_FORA = "A Ponte KORA não está rodando neste computador. Abra a Ponte e tente imprimir de novo.";

function erroAmigavelPonte(error) {
  if (!error) return null;
  // AbortError (timeout) e TypeError (connection refused) = ponte fora do ar.
  const nome = error.name ?? "";
  const foraDoAr = nome === "AbortError" || nome === "TypeError" || /failed to fetch|networkerror|load failed/i.test(error.message ?? "");
  if (!foraDoAr) return error;
  // Marca estruturada: a tela precisa distinguir "Ponte fechada" (aviso
  // amarelo, com o que fazer) de "Ponte respondeu errado" (erro vermelho).
  // Sem a flag ela teria que farejar a mensagem — e a mensagem daqui é em
  // português, então farejar por "failed to fetch" nunca acertaria.
  const amigavel = new Error(AVISO_PONTE_FORA);
  amigavel.foraDoAr = true;
  return amigavel;
}

/** Impressoras que a Ponte enxerga neste PC. (GET /impressoras) */
export async function listarImpressorasPonte() {
  const { data, error } = await chamarPonte("/impressoras");
  return { data, error: erroAmigavelPonte(error) };
}

// --- A impressão que não pode sair duas vezes -------------------------
//
// O prazo do fetch é curto (3s) e a impressora nem sempre é: com a bandeja
// ocupada ou o PowerShell lento, a Ponte RECEBE o trabalho e demora a
// responder. O app mostra erro, o operador clica de novo — e sem
// identificação os DOIS trabalhos entram na fila. Comanda em dobro na
// cozinha vira prato em dobro no salão.
//
// A Ponte deduplica por `id`: um id que ela já tem volta como
// { ok: true, id, duplicado: true }, sem papel novo. Para isso servir de
// alguma coisa, o REENVIO da mesma tentativa precisa levar o MESMO id.
//
// O id NÃO pode ser derivado do conteúdo do trabalho: a via de produção de
// uma comanda é idêntica letra por letra toda vez que alguém a pede, e a
// reimpressão manual pela tela da Cozinha — que é justamente o remédio que
// o aviso do caixa manda usar quando a comanda não saiu — nunca mais sairia
// no papel. Então: id novo a cada TENTATIVA, guardado apenas enquanto a
// última tentativa daquele mesmo trabalho tiver terminado em ERRO. Deu
// certo, a memória é apagada e o próximo pedido de impressão é trabalho
// novo, com id novo, e o papel sai.
//
// A memória vive na aba aberta. Recarregar a página no meio de uma falha
// perde o vínculo e o reenvio vira trabalho novo — é o preço de não guardar
// isso em disco, e é o caso raro perto de "cliquei de novo porque deu erro".
//
// A JANELA É CURTA DE PROPÓSITO, e o número vem do TIMEOUT_MS. Ela só
// precisa cobrir o intervalo entre o fetch desistir (TIMEOUT_MS) e o
// operador clicar de novo em cima do erro que acabou de aparecer na tela —
// clique duplo humano, questão de segundos. Janela longa engole o caso
// oposto, que é pior: o trabalho chegou na Ponte, a impressora estava com
// papel preso e ele FALHOU de verdade; o aviso do caixa manda reimprimir
// pela tela da Cozinha; a via reimpressa é idêntica letra por letra, a
// assinatura bate, o mesmo id volta — e a comanda que o operador acabou de
// mandar imprimir some como "duplicada", com a tela dizendo que deu certo.
// Quatro vezes o prazo do fetch dá folga para a rede local sem chegar perto
// do tempo de alguém ler um aviso e agir: qualquer clique deliberado vindo
// do aviso já cai fora da janela e vira impressão NOVA.
const JANELA_REENVIO_MS = 4 * TIMEOUT_MS; // 12s

// A Ponte só honra o campo `id` quando ele tem 8 caracteres ou mais
// (ponte/servidor.js). Quem mandar um id mais curto não estaria ativando
// proteção nenhuma lá — então aqui ele não vale como "id de quem chamou" e
// a memória desta aba assume o trabalho.
const ID_MINIMO_CARACTERES = 8;

const reenviosEmAberto = new Map(); // assinatura do trabalho -> { id, falhouEm }
let sequenciaImpressao = 0;

// Duas abas do PDV abertas no mesmo PC (rotina no caixa) começam a sequência
// em 1 cada uma; se as duas mandarem a primeira impressão no mesmo
// milissegundo, o id sairia igual para trabalhos DIFERENTES e a Ponte
// engoliria uma comanda legítima como duplicata. Este sorteio acontece uma
// vez por aba e não muda enquanto ela viver — que é exatamente o que a
// deduplicação precisa.
const marcaDaAba = Math.random().toString(36).slice(2, 8);

/** O que faz este trabalho ser "o mesmo" trabalho, para efeito de reenvio. */
function assinarTrabalho(trabalho) {
  return JSON.stringify([
    trabalho?.destino ?? null,
    trabalho?.linhas ?? null,
    trabalho?.cortaPapel ?? null,
    trabalho?.copias ?? null,
  ]);
}

function esquecerReenviosVencidos(agora) {
  for (const [assinatura, tentativa] of reenviosEmAberto) {
    if (agora - tentativa.falhouEm > JANELA_REENVIO_MS) reenviosEmAberto.delete(assinatura);
  }
}

/** Id da tentativa: o da falha recente do mesmo trabalho, ou um id novo. */
function idDaTentativa(assinatura, agora) {
  esquecerReenviosVencidos(agora);
  const emAberto = reenviosEmAberto.get(assinatura);
  if (emAberto) return emAberto.id;
  sequenciaImpressao += 1;
  return `imp-${marcaDaAba}-${agora.toString(36)}-${sequenciaImpressao.toString(36)}`;
}

/**
 * Enfileira um trabalho de impressão na Ponte. (POST /imprimir)
 *
 * Vai sempre com `id` no corpo — é por ele que a Ponte reconhece reenvio e
 * responde `duplicado: true` em vez de imprimir de novo. Quem chama pode
 * mandar o próprio `trabalho.id`, desde que ele tenha PELO MENOS 8
 * caracteres (é o mínimo que a Ponte honra); aí a responsabilidade de
 * repetir esse id no reenvio é de quem chamou e a memória daqui não entra.
 * Id mais curto que isso é ignorado e substituído por um id desta aba —
 * fosse repassado como veio, quem chamou acharia que ativou a proteção sem
 * ter ativado nada.
 *
 * @param {{destino: object, linhas: string[], cortaPapel?: boolean, copias?: number, id?: string}} trabalho
 * @returns {Promise<{data: {id: string, estado?: string, duplicado?: boolean}|null, error: Error|null}>}
 */
export async function enviarImpressaoPonte(trabalho) {
  const idDeQuemChamou = typeof trabalho?.id === "string" && trabalho.id.length >= ID_MINIMO_CARACTERES
    ? trabalho.id
    : null;
  const agora = Date.now();
  const assinatura = assinarTrabalho(trabalho);
  const id = idDeQuemChamou ?? idDaTentativa(assinatura, agora);

  const { data, error } = await chamarPonte("/imprimir", { metodo: "POST", corpo: { ...trabalho, id } });

  if (!idDeQuemChamou) {
    // Falhou: o trabalho pode ter chegado lá mesmo assim, então o próximo
    // clique tem que repetir este id. Deu certo (inclusive `duplicado`):
    // acabou a tentativa, e uma impressão pedida depois é outra impressão.
    //
    // O carimbo é o instante em que a falha ficou CONHECIDA, não o do começo
    // da tentativa. Justamente a falha por tempo esgotado leva TIMEOUT_MS
    // para aparecer; datada no começo, a janela de reenvio já nasceria
    // parcialmente gasta e o clique em cima do erro cairia fora dela. O `id`
    // continua vindo do instante de início — é ele que a próxima tentativa
    // procura na memória.
    if (error) reenviosEmAberto.set(assinatura, { id, falhouEm: Date.now() });
    else reenviosEmAberto.delete(assinatura);
  }

  return { data, error: erroAmigavelPonte(error) };
}

/** Estado da fila de impressão da Ponte. (GET /impressao) */
export async function buscarFilaImpressaoPonte() {
  const { data, error } = await chamarPonte("/impressao");
  return { data, error: erroAmigavelPonte(error) };
}

// --- Vínculo com o estabelecimento -----------------------------------
// A Ponte nasce genérica (é o mesmo .exe para qualquer cliente). Quem diz
// a que estabelecimento ela pertence é o app do caixa: assim que encontra
// a Ponte no localhost, manda o tenant. Ninguém digita código, token ou IP.
//
// Só vai o UUID e o nome — NUNCA chave do Supabase. O .exe não guarda
// credencial nenhuma, e a rota só aceita chamada do próprio PC.

/** Diz à Ponte de qual estabelecimento ela é. (POST /vincular) */
export async function vincularPonte({ tenantId, nome }) {
  return chamarPonte("/vincular", { metodo: "POST", corpo: { tenantId, nome } });
}

/** Monta o link que o Palm abre (página servida pela própria ponte). */
export function montarEnderecoPalm(info) {
  const ip = info?.enderecos?.[0];
  if (!ip || !info?.token) return null;
  return `http://${ip}:${info.porta ?? PORTA_PADRAO}/palm?t=${info.token}`;
}
