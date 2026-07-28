// Ponte KORA — lógica pura do vínculo com o estabelecimento (Leva 14).
//
// Por que existe:
// - A Ponte vai virar um único KoraPonte.exe copiado para o PC do caixa —
//   sem repositório, sem Node, sem npm, só o executável. Ninguém do
//   restaurante vai digitar um UUID de tenant numa tela.
// - Em vez disso, o app do caixa (que já sabe o tenant do usuário logado)
//   encontra a Ponte em http://localhost:8123 e manda POST /vincular com
//   {tenantId, nome}. A Ponte aceita, guarda e passa a se identificar como
//   "a Ponte do restaurante X" — sem nenhuma digitação manual.
// - Aqui só a regra (validar o pedido de vínculo, aplicar sobre o config,
//   resumir para exibição); quem persiste em disco é servidor.js.

// UUID "de boa vontade": só o alfabeto de um UUID, sem exigir os hífens nas
// posições exatas — o de-para de tenant pode mudar de formato um dia e o
// importante aqui é nunca deixar passar lixo (script, caminho, etc.).
const TENANT_ID_REGEX = /^[0-9a-fA-F-]+$/;
const TENANT_ID_MAX = 64;
const NOME_MAX = 80;
const NOME_PADRAO = "Estabelecimento";

// Caracteres de controle (código 0 a 31, e 127 = DEL) — construído com
// String.fromCharCode para não depender de escape de unicode gravado no
// arquivo-fonte (mais seguro contra corrupção de encoding na gravação).
const CONTROLE_REGEX = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(127) + "]",
  "g",
);

function textoLimpo(valor, max) {
  if (typeof valor !== "string") return "";
  // Controle fora (quebra de linha, etc.): o nome do estabelecimento vai
  // direto para a tela do painel, nunca deve carregar formatação escondida.
  return valor.replace(CONTROLE_REGEX, "").trim().slice(0, max);
}

/**
 * Valida o corpo de POST /vincular vindo do app do caixa.
 *
 * @param {{tenantId?: string, nome?: string}} dados
 * @param {{agora?: () => string}} [opts] - injeção de relógio para teste
 * @returns {{ok: true, vinculo: {tenantId: string, nome: string, vinculadoEm: string}} | {ok: false, erro: string}}
 */
export function validarVinculo(dados, { agora } = {}) {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    return { ok: false, erro: "Não veio informação nenhuma do estabelecimento para vincular." };
  }

  const tenantId = typeof dados.tenantId === "string" ? dados.tenantId.trim() : "";
  if (!tenantId) {
    return { ok: false, erro: "Falta o código do estabelecimento — abra o sistema KORA neste computador e tente de novo." };
  }
  if (tenantId.length > TENANT_ID_MAX) {
    return { ok: false, erro: "O código do estabelecimento veio grande demais — algo não está certo, avise o suporte." };
  }
  if (!TENANT_ID_REGEX.test(tenantId)) {
    return { ok: false, erro: "O código do estabelecimento veio num formato que a Ponte não reconhece — avise o suporte." };
  }

  const nome = textoLimpo(dados.nome, NOME_MAX) || NOME_PADRAO;
  const vinculadoEm = (agora ?? (() => new Date().toISOString()))();

  return { ok: true, vinculo: { tenantId, nome, vinculadoEm } };
}

/**
 * Devolve um NOVO config com o vínculo aplicado — nunca muta o original.
 *
 * Trocar de estabelecimento é permitido de propósito: o mesmo PC do caixa
 * pode mudar de dono/loja (venda do ponto, troca de rede, etc.), então um
 * vínculo novo sempre sobrescreve o antigo, com um `vinculadoEm` novo.
 *
 * @param {object} config - config atual da Ponte (pode não ter `estabelecimento`)
 * @param {{tenantId: string, nome: string, vinculadoEm: string}} vinculo - retorno de validarVinculo().vinculo
 * @returns {object} novo config, com `estabelecimento` sobrescrito
 */
export function aplicarVinculo(config, vinculo) {
  const base = config && typeof config === "object" && !Array.isArray(config) ? config : {};
  return { ...base, estabelecimento: { ...vinculo } };
}

/**
 * Resumo do vínculo para exibir no painel (GET /painel/estado).
 * Sem vínculo, devolve tudo `null`/`false` — o painel decide o que mostrar.
 *
 * @param {object} config
 * @returns {{vinculado: boolean, nome: string|null, tenantId: string|null, vinculadoEm: string|null}}
 */
export function resumoVinculo(config) {
  const v = config?.estabelecimento;
  if (!v || typeof v !== "object" || !v.tenantId) {
    return { vinculado: false, nome: null, tenantId: null, vinculadoEm: null };
  }
  return {
    vinculado: true,
    nome: v.nome ?? NOME_PADRAO,
    tenantId: v.tenantId,
    vinculadoEm: v.vinculadoEm ?? null,
  };
}
