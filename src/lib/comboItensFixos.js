import { supabase } from "./supabase";

/**
 * Itens FIXOS de um combo — o que vem junto sem o cliente escolher.
 *
 * Um combo tem duas partes, e até aqui só existia a segunda:
 *
 *  • FIXO   — "o combo sempre vem com uma batata". Ninguém escolhe, e
 *    por isso não pode virar um grupo de escolha de uma opção só: o
 *    operador teria de clicar numa "escolha" que não é escolha nenhuma.
 *  • ESCOLHA — "qual refrigerante?" (src/lib/gruposEscolha.js).
 *
 * A tabela `combo_produtos` existe desde 20260726 e estava sem nenhum
 * uso no app: era exatamente este buraco. Nada de migração nova aqui.
 *
 * O item fixo entra no carrinho como uma ESCOLHA de preço zero
 * (resolverItensFixos). Reaproveitar o caminho das escolhas é o que faz
 * a baixa de estoque, a impressão na comanda e a via de produção
 * funcionarem sem nenhum código novo — cada item fixo é um produto real
 * do catálogo e baixa o próprio estoque, igual a uma escolha.
 *
 * Preço: por padrão o item fixo NÃO soma nada, porque já está embutido
 * no `preco_total` do combo. `preco_customizado` existe para o caso raro
 * de o dono querer que aquele item cobre à parte.
 *
 * A RLS já isola por tenant — não se filtra tenant aqui. Nunca lança.
 */

const SEL = "id, combo_id, produto_id, quantidade, preco_customizado";

function mapItem(row) {
  return {
    id: row.id,
    produtoId: row.produto_id,
    quantidade: Math.max(1, Number(row.quantidade ?? 1) || 1),
    preco: Number(row.preco_customizado ?? 0) || 0,
  };
}

/**
 * Itens fixos de um combo.
 * @returns {Promise<{data: Array<object>, error: (Error|null)}>}
 */
export async function carregarItensFixos(comboId) {
  if (comboId == null) return { data: [], error: null };
  const { data, error } = await supabase.from("combo_produtos").select(SEL).eq("combo_id", comboId);
  if (error) return { data: [], error };
  return { data: (data ?? []).map(mapItem), error: null };
}

/**
 * Todos os itens fixos do tenant, indexados por combo. Carga única do
 * PDV, pelo mesmo motivo de carregarTodosGrupos: evita N+1 na grade.
 * @returns {Promise<{porCombo: object, error: (Error|null)}>}
 */
export async function carregarTodosItensFixos() {
  const { data, error } = await supabase.from("combo_produtos").select(SEL);
  if (error) return { porCombo: {}, error };
  const porCombo = {};
  for (const row of data ?? []) (porCombo[row.combo_id] ??= []).push(mapItem(row));
  return { porCombo, error: null };
}

/**
 * Substitui os itens fixos de um combo pelos fornecidos. O delete É
 * conferido: se ele falha e os inserts seguem, o combo fica com o item
 * duplicado e o estoque baixa duas vezes.
 *
 * @param {{comboId: string, itens: Array<object>}} params
 * @returns {Promise<{error: (Error|null)}>}
 */
export async function salvarItensFixos({ comboId, itens = [] }) {
  if (comboId == null) return { error: new Error("salvarItensFixos: informe comboId.") };

  const { error: errDel } = await supabase.from("combo_produtos").delete().eq("combo_id", comboId);
  if (errDel) return { error: errDel };

  const payload = (itens ?? [])
    .filter((it) => it.produtoId != null)
    .map((it) => ({
      combo_id: comboId,
      produto_id: Number(it.produtoId),
      quantidade: Math.max(1, Number(it.quantidade ?? 1) || 1),
      preco_customizado: Number(it.preco) > 0 ? Number(it.preco) : null,
    }));
  if (payload.length === 0) return { error: null };

  const { error } = await supabase.from("combo_produtos").insert(payload);
  return { error };
}

/**
 * Transforma os itens fixos em ESCOLHAS prontas para o carrinho, juntando
 * com o catálogo para pegar o nome. Pura — não chama o Supabase.
 *
 * `grupoId: 'fixos'` e `regra: 'soma'` de propósito: com preço zero, somar
 * é somar nada, e o item fixo não pode interferir na regra de um grupo de
 * sabores (ver precoDasEscolhas em src/lib/combos.js).
 *
 * Item cujo produto sumiu do catálogo é descartado — imprimir "produto
 * removido" na via de produção não ajuda ninguém na cozinha.
 *
 * @param {Array<object>} itens
 * @param {Array<object>} products
 * @returns {Array<{produtoId, nome, qtd, preco, grupoId, regra, fixo}>}
 */
export function resolverItensFixos(itens, products = []) {
  const porId = new Map((products ?? []).map((p) => [String(p.id), p]));
  return (itens ?? [])
    .map((it) => {
      const p = porId.get(String(it.produtoId));
      return {
        produtoId: it.produtoId,
        nome: p?.name ?? "",
        qtd: Math.max(1, Number(it.quantidade ?? 1) || 1),
        preco: Number(it.preco ?? 0) || 0,
        grupoId: "fixos",
        regra: "soma",
        // Marca só para a TELA: o seletor mostra "já vem com" em vez de
        // oferecer como opção clicável.
        fixo: true,
      };
    })
    .filter((e) => e.nome);
}

/**
 * Frase do que o combo já inclui, em português do balcão. Sai da mesma
 * função no editor (onde o dono cadastra) e no seletor do PDV (onde o
 * operador vende) — é o que impede as duas telas de descreverem o mesmo
 * combo de jeitos diferentes.
 *
 * @param {Array<{nome: string, qtd: number}>} escolhasFixas
 * @returns {string}
 */
export function resumoItensFixos(escolhasFixas) {
  const partes = (escolhasFixas ?? [])
    .filter((e) => e?.nome)
    .map((e) => (Number(e.qtd) > 1 ? `${e.qtd}× ${e.nome}` : e.nome));
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}
