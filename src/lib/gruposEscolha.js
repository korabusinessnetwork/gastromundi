import { supabase } from "./supabase";

/**
 * Grupos de escolha — leitura e escrita (Supabase).
 *
 * Um "grupo de escolha" é a abstração única por trás de duas telas:
 * PRODUTO COM SELEÇÃO (grupo pertence a um produto) e COMBO FLEXÍVEL
 * (grupo pertence a um combo). Ver src/lib/combos.js para o lado puro.
 *
 * Shape do grupo no app (o que o editor e o seletor consomem):
 *   {
 *     id,        // uuid da linha (ou undefined em grupo novo, ainda não salvo)
 *     nome,      // rótulo mostrado ao operador ("Escolha o hambúrguer")
 *     minimo,    // quantas opções o cliente PRECISA escolher
 *     maximo,    // quantas opções o cliente PODE escolher — 0 = sem limite
 *     origem,    // 'lista' (opções fixas) | 'categoria' (todos da categoria)
 *     categoria, // nome da categoria quando origem='categoria'
 *     ordem,     // posição do grupo
 *     itens: [{ id, produtoId, preco }]  // opções quando origem='lista'
 *   }
 *
 * `preco` de um item é o ACRÉSCIMO (R$) que aquela opção soma ao preço
 * base — 0 quando a opção não muda o preço. Persistido em
 * grupo_escolha_itens.preco_customizado.
 *
 * A RLS já isola por tenant (multitenant fase 2) — não se filtra tenant
 * aqui. Nunca lança: erro vira `{ ..., error }`.
 */

const SEL_GRUPO =
  "id, produto_id, combo_id, nome, minimo, maximo, origem, categoria, regra_preco, ordem, " +
  "grupo_escolha_itens(id, produto_id, preco_customizado, ordem, ativo)";

/**
 * O que o grupo FAZ com o preço das opções escolhidas. Somar serve para
 * extras; pizzaria não soma sabor, cobra o mais caro (ou a média) — sem
 * isso, uma pizza de 4 sabores sairia por quatro pizzas.
 *
 * A conta em si mora em src/lib/combos.js (precoDasEscolhas), que é quem
 * o carrinho chama. Aqui ficam só os rótulos que a tela mostra.
 */
export const REGRAS_PRECO = [
  {
    id: "soma",
    titulo: "Somar tudo",
    curto: "soma cada opção",
    ajuda: "Cada opção escolhida soma o próprio valor. É o caso dos extras: bacon +R$ 4, ovo +R$ 3.",
  },
  {
    id: "maior",
    titulo: "Cobrar a mais cara",
    curto: "vale a opção mais cara",
    ajuda: "O grupo cobra só a opção mais cara entre as escolhidas. É como pizzaria cobra meio a meio: metade de R$ 40 com metade de R$ 60 é uma pizza de R$ 60.",
  },
  {
    id: "media",
    titulo: "Preço médio",
    curto: "média das opções",
    ajuda: "O grupo cobra a média das opções escolhidas. Mesma pizza pela outra convenção: R$ 40 com R$ 60 sai por R$ 50.",
  },
];

const IDS_REGRA = new Set(REGRAS_PRECO.map((r) => r.id));

/** Normaliza a regra vinda do banco ou da tela; desconhecida vira 'soma'. */
export function regraValida(regra) {
  return IDS_REGRA.has(regra) ? regra : "soma";
}

/** O texto curto da regra, para a tela não ter de conhecer os ids. */
export function textoRegra(regra) {
  return REGRAS_PRECO.find((r) => r.id === regraValida(regra)) ?? REGRAS_PRECO[0];
}

/**
 * Numa regra de sabor ('maior'/'media') o número da opção é o PREÇO dela,
 * não um acréscimo — e o preço de uma pizza de calabresa já está no
 * cadastro do produto. Então, sem valor próprio, a opção vale o que o
 * produto vale, e "categoria inteira + cobra a mais cara" fica pronta sem
 * digitar preço nenhum.
 *
 * Em 'soma' o vazio continua valendo zero: extra sem preço não cobra nada.
 *
 * @param {'soma'|'maior'|'media'} regra
 * @param {number|null|undefined} precoDoItem - o valor cadastrado no grupo
 * @param {object|undefined} produto - o produto de catálogo da opção
 * @returns {number}
 */
export function precoDaOpcao(regra, precoDoItem, produto) {
  const proprio = Number(precoDoItem ?? 0) || 0;
  if (proprio > 0) return proprio;
  if (regraValida(regra) === "soma") return 0;
  return Number(produto?.price ?? 0) || 0;
}

function mapGrupo(row) {
  return {
    id: row.id,
    nome: row.nome ?? "",
    minimo: Number(row.minimo ?? 1),
    maximo: Number(row.maximo ?? 1),
    origem: row.origem === "categoria" ? "categoria" : "lista",
    categoria: row.categoria ?? null,
    regraPreco: regraValida(row.regra_preco),
    ordem: Number(row.ordem ?? 0),
    itens: (row.grupo_escolha_itens ?? [])
      .slice()
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((i) => ({
        id: i.id,
        produtoId: i.produto_id,
        preco: Number(i.preco_customizado ?? 0) || 0,
        // Opção desligada continua cadastrada, com o acréscimo dela — só
        // não é oferecida ao operador (ver resolverOpcoes).
        ativo: i.ativo !== false,
      })),
  };
}

/**
 * Carrega os grupos de um dono (produto OU combo). Passe exatamente um id.
 * @returns {Promise<{data: Array<object>, error: (Error|null)}>}
 */
async function carregarPorDono(coluna, valor) {
  if (valor == null) return { data: [], error: null };
  const { data, error } = await supabase
    .from("grupos_escolha")
    .select(SEL_GRUPO)
    .eq(coluna, valor)
    .order("ordem");
  if (error) return { data: [], error };
  return { data: (data ?? []).map(mapGrupo), error: null };
}

export function carregarGruposDoProduto(produtoId) {
  return carregarPorDono("produto_id", produtoId);
}

export function carregarGruposDoCombo(comboId) {
  return carregarPorDono("combo_id", comboId);
}

/**
 * Carrega TODOS os grupos do tenant de uma vez (uso do PDV), já indexados
 * por dono. Evita N+1 ao montar a grade de produtos/combos.
 * @returns {Promise<{porProduto: object, porCombo: object, error: (Error|null)}>}
 */
export async function carregarTodosGrupos() {
  const { data, error } = await supabase
    .from("grupos_escolha")
    .select(SEL_GRUPO)
    .order("ordem");
  if (error) return { porProduto: {}, porCombo: {}, error };

  const porProduto = {};
  const porCombo = {};
  for (const row of data ?? []) {
    const g = mapGrupo(row);
    if (row.produto_id != null) (porProduto[row.produto_id] ??= []).push(g);
    else if (row.combo_id != null) (porCombo[row.combo_id] ??= []).push(g);
  }
  for (const mapa of [porProduto, porCombo]) {
    for (const k of Object.keys(mapa)) mapa[k].sort((a, b) => a.ordem - b.ordem);
  }
  return { porProduto, porCombo, error: null };
}

/**
 * Substitui os grupos de um dono (produto OU combo) pelos fornecidos:
 * apaga os atuais e insere os novos. O delete É conferido — se ele falha
 * e os inserts seguem, o dono fica com grupos duplicados (o cliente
 * escolheria duas vezes a mesma coisa). Os itens somem em cascata.
 *
 * @param {{produtoId?: (number|string), comboId?: string, grupos: Array<object>}} params
 * @returns {Promise<{error: (Error|null)}>}
 */
export async function salvarGrupos({ produtoId = null, comboId = null, grupos = [] }) {
  const coluna = produtoId != null ? "produto_id" : "combo_id";
  const valor = produtoId != null ? produtoId : comboId;
  if (valor == null) return { error: new Error("salvarGrupos: informe produtoId ou comboId.") };

  const { error: errDel } = await supabase.from("grupos_escolha").delete().eq(coluna, valor);
  if (errDel) return { error: errDel };

  for (let gi = 0; gi < grupos.length; gi++) {
    const g = grupos[gi];
    const origem = g.origem === "categoria" ? "categoria" : "lista";
    const minimo = Math.max(0, Number(g.minimo ?? 1) || 0);
    // 0 = SEM LIMITE. O piso aqui era 1, e por isso "escolha quantos
    // sabores quiser" não tinha como ser gravado — o editor mandava 0 e
    // chegava 1 no banco. Com máximo 0 o mínimo continua valendo (é
    // "ao menos N, quantas quiser acima disso"), então ele não puxa o
    // teto para cima como faz na faixa comum.
    const maximo = Math.max(0, Number(g.maximo ?? 1) || 0);
    const payload = {
      produto_id: produtoId != null ? Number(produtoId) : null,
      combo_id: comboId != null ? comboId : null,
      nome: (g.nome ?? "").trim() || "Escolha",
      minimo,
      maximo: maximo === 0 ? 0 : Math.max(maximo, minimo),
      origem,
      categoria: origem === "categoria" ? (g.categoria ?? null) : null,
      regra_preco: regraValida(g.regraPreco),
      ordem: gi,
    };
    const { data: grupoRow, error: errG } = await supabase
      .from("grupos_escolha")
      .insert(payload)
      .select("id")
      .single();
    if (errG) return { error: errG };

    if (origem === "lista") {
      const itensPayload = (g.itens ?? [])
        .filter((it) => it.produtoId != null)
        .map((it, idx) => ({
          grupo_id: grupoRow.id,
          produto_id: Number(it.produtoId),
          preco_customizado: Number(it.preco) > 0 ? Number(it.preco) : null,
          ativo: it.ativo !== false,
          ordem: idx,
        }));
      if (itensPayload.length > 0) {
        const { error: errI } = await supabase.from("grupo_escolha_itens").insert(itensPayload);
        if (errI) return { error: errI };
      }
    }
  }
  return { error: null };
}

/**
 * Regra do grupo em português do balcão — o MESMO texto no editor (onde o
 * dono cadastra) e no seletor do PDV (onde o operador obedece). Sair dos
 * dois lados da mesma função é o que impede a tela de cadastro prometer
 * uma coisa e a de venda cobrar outra.
 *
 * `max` 0 é SEM LIMITE: o cliente escolhe quantas quiser. O número conta
 * UNIDADES, não opções diferentes — "até 2" aceita dois cheddar, que é
 * como o cliente pede ("double cheddar", não "dois adicionais distintos").
 *
 * @param {number} min - quantas o cliente PRECISA escolher
 * @param {number} max - teto de unidades; 0 = sem limite
 * @returns {string}
 */
export function instrucaoGrupo(min, max) {
  const piso = Math.max(0, Number(min) || 0);
  const teto = Math.max(0, Number(max) || 0);
  if (piso > 0) {
    if (teto === 0) return `Escolha ao menos ${piso}`;
    if (teto === piso) return `Escolha ${piso}`;
    return `Escolha de ${piso} a ${teto}`;
  }
  if (teto === 0) return "Opcional — escolha quantas quiser";
  if (teto === 1) return "Opcional — escolha 1 se quiser";
  return `Opcional — até ${teto}`;
}

/**
 * Resolve as OPÇÕES concretas de um grupo (produtos reais escolhíveis),
 * juntando o grupo com o catálogo de produtos já carregado. Puro — não
 * chama o Supabase. Usado pelo seletor do PDV.
 *
 * @param {object} grupo - grupo no shape do app
 * @param {Array<object>} products - catálogo ({ id, name, price, emoji, category, active })
 * @returns {Array<{produtoId, nome, preco, emoji}>} preco = acréscimo da opção
 */
export function resolverOpcoes(grupo, products = []) {
  if (!grupo) return [];
  const regra = regraValida(grupo.regraPreco);
  if (grupo.origem === "categoria") {
    return (products ?? [])
      .filter((p) => p.active !== false && p.category === grupo.categoria)
      .map((p) => ({
        produtoId: p.id,
        nome: p.name ?? "",
        preco: precoDaOpcao(regra, null, p),
        emoji: p.emoji,
      }));
  }
  const porId = new Map((products ?? []).map((p) => [String(p.id), p]));
  return (grupo.itens ?? [])
    // Desligada não é oferecida: é o "acabou hoje" sem perder a
    // configuração da opção.
    .filter((it) => it.ativo !== false)
    .map((it) => {
      const p = porId.get(String(it.produtoId));
      return {
        produtoId: it.produtoId,
        nome: p?.name ?? "",
        preco: precoDaOpcao(regra, it.preco, p),
        emoji: p?.emoji,
      };
    })
    .filter((o) => o.nome); // descarta opção cujo produto sumiu do catálogo
}

/**
 * Modelos de grupo — o atalho para quem não quer pensar em mínimo, máximo
 * e regra de preço separadamente. Cada ramo do comércio cai num deles, e
 * é isso que faz o mesmo editor servir hamburgueria e pizzaria.
 *
 * O modelo só PREENCHE os três campos; eles continuam editáveis depois.
 */
export const MODELOS_GRUPO = [
  {
    id: "extras",
    titulo: "Extras",
    exemplo: "Bacon, cheddar, ovo — cada um soma",
    campos: { minimo: 0, maximo: 0, regraPreco: "soma" },
  },
  {
    id: "obrigatoria",
    titulo: "Escolha obrigatória",
    exemplo: "Qual refrigerante vem no combo",
    campos: { minimo: 1, maximo: 1, regraPreco: "soma" },
  },
  {
    id: "sabores",
    titulo: "Sabores",
    exemplo: "2 sabores de pizza, vale o mais caro",
    campos: { minimo: 2, maximo: 2, regraPreco: "maior" },
  },
];

/**
 * Qual modelo o grupo está seguindo agora, ou null quando o dono ajustou
 * a mão e não bate com nenhum. A tela usa isso só para acender o botão —
 * nada trava quando não bate.
 *
 * @param {object} grupo
 * @returns {string|null}
 */
export function modeloDoGrupo(grupo) {
  const min = Math.max(0, Number(grupo?.minimo ?? 0) || 0);
  const max = Math.max(0, Number(grupo?.maximo ?? 0) || 0);
  const regra = regraValida(grupo?.regraPreco);
  // "Sabores" é o modelo pela REGRA, não pela contagem: 2, 3 ou 4 sabores
  // são a mesma pizzaria, e o dono muda esse número no stepper.
  if (regra !== "soma") return "sabores";
  const achado = MODELOS_GRUPO.find(
    (m) => m.campos.regraPreco === regra && m.campos.minimo === min && m.campos.maximo === max,
  );
  return achado?.id ?? null;
}
