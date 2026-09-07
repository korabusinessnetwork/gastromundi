// ──────────────────────────────────────────────────────────────────
// Identidade anônima do aparelho na vitrine de delivery.
//
// O problema que ela resolve: depois de "Pedido enviado!" o cliente não
// tinha mais nada — nem status, nem histórico, nem o número do pedido se
// fechasse a aba. Exigir cadastro para isso é barreira na única tela que
// um desconhecido vê, e conta por SMS custa por mensagem (fora da fase de
// bootstrap, ver memory/restrictions.md).
//
// Então o navegador guarda um UUID. O pedido nasce carimbado com ele, e a
// RPC `meus_pedidos_delivery` devolve os pedidos daquele aparelho. Sem
// cadastro, sem senha, sem custo.
//
// O que isto é, para não haver ilusão: um PORTADOR DE SEGREDO. Quem tiver
// o UUID vê aqueles pedidos. Por isso ele nasce de `crypto.randomUUID`
// (122 bits — não se adivinha nem se enumera) e nunca sai do aparelho a
// não ser dentro do próprio pedido. Some quando a pessoa troca de celular
// ou limpa o navegador, e isso é aceitável: é conveniência, não conta.
//
// localStorage (e não sessionStorage, onde mora a sacola): a sacola morre
// com a aba de propósito; o histórico precisa sobreviver a ela — "só de
// voltar na página" é justamente o ponto.
// ──────────────────────────────────────────────────────────────────

const CHAVE = "kora.delivery.dispositivo";

// Formato canônico de UUID. O servidor faz cast para uuid e devolve lista
// vazia no que não casa; conferir aqui evita a ida à rede e, principalmente,
// impede que um valor estragado no localStorage (extensão, sincronização
// de navegador, edição à mão) vire o "seu histórico sumiu" permanente —
// valor inválido é substituído por um novo.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** É um UUID em forma canônica? Pura. */
export function ehUuid(valor) {
  return typeof valor === "string" && UUID_RE.test(valor);
}

// `crypto.randomUUID` só existe em contexto seguro, e o Safari do iPhone
// só ganhou a função na 15.4 — a mesma armadilha que já derrubou o botão
// "Adicionar" da sacola (ver useCarrinho.js). Aqui o reserva NÃO é
// aleatoriedade de brinquedo: `Math.random` não é criptográfico, então o
// caminho reserva usa `crypto.getRandomValues` quando existe, e só cai em
// Math.random quando não há Crypto nenhum — navegador em que, de qualquer
// forma, não há segredo a guardar.
function novoUuid() {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * O UUID deste aparelho, criando-o na primeira vez. Nunca lança: navegador
 * com armazenamento bloqueado (aba anônima estrita, política corporativa)
 * ganha um id só da sessão em memória — o pedido continua funcionando, só
 * o histórico não sobrevive ao recarregar. Travar a compra por causa do
 * histórico seria trocar a venda pela comodidade.
 *
 * @returns {string} UUID v4
 */
export function idDoDispositivo() {
  try {
    const guardado = localStorage.getItem(CHAVE);
    if (ehUuid(guardado)) return guardado;
    const novo = novoUuid();
    localStorage.setItem(CHAVE, novo);
    return novo;
  } catch {
    return novoUuid();
  }
}

/**
 * Esquece este aparelho — o histórico e os dados guardados deixam de
 * aparecer aqui. É a saída de quem usou o celular de outra pessoa para
 * pedir: sem isso, os pedidos e o endereço dela ficariam ali para sempre.
 */
export function esquecerDispositivo() {
  try {
    localStorage.removeItem(CHAVE);
    localStorage.removeItem(CHAVE_ENTREGA);
  } catch {
    // Sem armazenamento não havia o que esquecer.
  }
}

// ── Os dados de entrega da última vez ──────────────────────────────
// Redigitar nome, cidade, bairro e rua a cada pedido é o atrito que faz
// desistir no meio — e é exatamente o que uma conta resolveria. Guardar
// no próprio aparelho resolve igual, de graça, e sem cadastro.
//
// O que NÃO entra aqui: a taxa e as coordenadas. Elas são a resposta do
// servidor para um endereço num momento — reaproveitá-las mostraria o
// preço de ontem para a entrega de hoje.
const CHAVE_ENTREGA = "kora.delivery.entrega";

const CAMPOS_LEMBRADOS = ["nome", "telefone", "cep", "cidade", "bairro", "endereco", "complemento"];

/**
 * Reduz o formulário ao que vale a pena lembrar, tudo em texto. Pura —
 * é ela que garante que nada além destes campos chegue ao armazenamento.
 */
export function entregaLembravel(entrega) {
  const saida = {};
  for (const campo of CAMPOS_LEMBRADOS) {
    const valor = entrega?.[campo];
    if (typeof valor === "string" && valor.trim()) saida[campo] = valor.trim();
  }
  return saida;
}

/** Guarda os dados de entrega deste aparelho. Nunca lança. */
export function lembrarEntrega(entrega) {
  const dados = entregaLembravel(entrega);
  if (Object.keys(dados).length === 0) return;
  try {
    localStorage.setItem(CHAVE_ENTREGA, JSON.stringify(dados));
  } catch {
    // Armazenamento bloqueado: o pedido seguinte é digitado de novo, só isso.
  }
}

/**
 * O que este aparelho lembra da última entrega, já filtrado pelos campos
 * conhecidos — o que estiver guardado além deles (versão antiga do app,
 * edição à mão) não entra no formulário.
 * @returns {object} vazio quando não há nada guardado
 */
export function entregaLembrada() {
  try {
    const bruto = localStorage.getItem(CHAVE_ENTREGA);
    if (!bruto) return {};
    const dados = JSON.parse(bruto);
    return dados && typeof dados === "object" ? entregaLembravel(dados) : {};
  } catch {
    return {};
  }
}
