// TD015 — identidade estável para linhas de lista editável.
//
// Uma lista que o usuário adiciona e remove do meio não pode ser reconciliada
// pelo índice: `key={i}` diz ao React "a terceira linha é a terceira linha", e
// não "a terceira linha é o item tal". Enquanto todos os inputs da linha são
// controlados isso passa despercebido, porque o valor vem do state. No dia em
// que a linha ganha estado próprio (um dropdown aberto, um campo de busca, foco,
// seleção de texto), o estado gruda na posição e aparece na linha errada.
//
// A identidade aqui é um campo `uid` dentro do próprio objeto da linha, o mesmo
// padrão que `comandaItens.js` já usa para os itens de comanda. Não é dado de
// negócio: é chave de renderização, e quem grava no banco monta o payload sem
// ela (ou a remove explicitamente, nos saves que espalham o objeto inteiro).

/** Desempate do fallback: duas linhas podem nascer no mesmo milissegundo. */
let contador = 0;

/**
 * Gera um identificador de linha.
 *
 * `crypto.randomUUID` só existe em contexto seguro (https ou localhost). Um PDV
 * acessado por IP na rede local do restaurante não é contexto seguro, e nesse
 * navegador a chamada lança — o que derrubaria a tela inteira na renderização.
 * O fallback não precisa ser criptográfico, só precisa não repetir dentro de uma
 * sessão: o contador garante isso mesmo quando duas linhas nascem no mesmo
 * milissegundo.
 *
 * @returns {string}
 */
export function novoUid() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* contexto não seguro: cai no fallback abaixo */
  }
  contador += 1;
  return `uid-${Date.now().toString(36)}-${contador.toString(36)}`;
}

/**
 * Garante `uid` em todas as linhas de uma lista, sem tocar no que já tem.
 *
 * Idempotente e conservador: quando nada muda, devolve a MESMA referência do
 * array recebido. Isso importa porque estas listas moram em `useState` e são
 * atribuídas em efeitos de carga — devolver um array novo a cada passada faria
 * o efeito se reagendar para sempre.
 *
 * Item que não é objeto passa intacto: a função não é validadora, só carimba
 * identidade no que dá para carimbar.
 *
 * @template T
 * @param {T[]} lista
 * @returns {T[]}
 */
export function comUid(lista) {
  if (!Array.isArray(lista)) return lista;
  let mudou = false;
  const saida = lista.map((item) => {
    if (!item || typeof item !== "object" || item.uid) return item;
    mudou = true;
    return { ...item, uid: novoUid() };
  });
  return mudou ? saida : lista;
}

/**
 * Devolve o objeto sem o `uid`, para os saves que espalham a linha inteira no
 * payload. Usada onde o destino é um jsonb sem colunas fixas, que aceitaria o
 * campo caladamente e o devolveria como se fosse dado do estabelecimento.
 *
 * @template {object} T
 * @param {T} item
 * @returns {T}
 */
export function semUid(item) {
  if (!item || typeof item !== "object") return item;
  const { uid: _uid, ...resto } = item;
  return resto;
}

/** `semUid` aplicada a uma lista. Mesma regra de referência do `comUid`. */
export function listaSemUid(lista) {
  if (!Array.isArray(lista)) return lista;
  if (!lista.some((i) => i && typeof i === "object" && "uid" in i)) return lista;
  return lista.map(semUid);
}
