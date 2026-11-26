import { formatarReais as formatarPreco } from "@/lib/dinheiro";
import { precoDoGrupo } from "@/features/cardapio/regras/combos";

export { formatarPreco };

// CEP, dinheiro na tela, carrinho, regras de complementos e a revisão da sacola contra o cardápio.
// ── CEP ────────────────────────────────────────────────────────────

/** Só os dígitos do CEP (até 8). */
export function apenasDigitosCep(bruto) {
  return String(bruto ?? "").replace(/\D/g, "").slice(0, 8);
}

/** Formata "90000000" → "90000-000" (parcial enquanto digita). */
export function formatarCep(bruto) {
  const d = apenasDigitosCep(bruto);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** CEP tem 8 dígitos? */
export function cepCompleto(bruto) {
  return apenasDigitosCep(bruto).length === 8;
}

// ── Dinheiro (exibição) ────────────────────────────────────────────


/**
 * Lê o que o cliente DIGITOU num campo de dinheiro. O teclado brasileiro
 * escreve "50,00", e `Number("50,00")` é NaN — era por isso que o "troco
 * para" sumia sem aviso nenhum entre a tela e o servidor.
 * Devolve null quando não há número (campo vazio ou rabisco).
 * @param {string|number|null|undefined} texto
 * @returns {number|null}
 */
export function valorDigitado(texto) {
  if (texto === null || texto === undefined) return null;
  const bruto = String(texto).trim();
  if (!bruto) return null;
  // Com vírgula, ela é o decimal e o ponto é separador de milhar
  // ("1.234,56" → 1234.56). Sem vírgula, o ponto é o próprio decimal.
  const normalizado = bruto.includes(",")
    ? bruto.replace(/\./g, "").replace(",", ".")
    : bruto;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

// ── Data de nascimento (cadastro do cliente) ───────────────────────

/**
 * A data de nascimento é OPCIONAL e existe para o futuro (aniversário do
 * cliente), não para barrar a compra de hoje. Por isso esta função não
 * diz "inválido": ela diz se dá para APROVEITAR o que foi digitado. Data
 * vazia, pela metade, no futuro ou de idade impossível simplesmente não
 * é aproveitada, e o pedido segue igual.
 *
 * Recebe o formato do <input type="date"> ("AAAA-MM-DD"), que é o mesmo
 * que o Postgres aceita — o campo não é digitado à mão em pt-BR.
 *
 * @param {string} texto
 * @returns {string|null} a data pronta para gravar, ou null
 */
/**
 * Monta "AAAA-MM-DD" a partir de dia, mês e ano digitados em campos
 * separados. Só monta quando os TRÊS estão preenchidos; incompleto
 * devolve "" para `dataNascimentoUtil` recusar depois.
 *
 * Existe porque o `<input type="date">` era péssimo para data de
 * nascimento: o calendário abre no mês atual e chegar a 1962 é uma
 * viagem de centenas de cliques. Três campos deixam o ano ser digitado.
 *
 * Não valida o dia contra o mês nem o ano contra o futuro — isso é de
 * `dataNascimentoUtil`, que continua sendo a única regra.
 *
 * @param {string|number} dia
 * @param {string|number} mes  1 a 12
 * @param {string|number} ano  4 dígitos
 * @returns {string} "AAAA-MM-DD", ou "" quando falta alguma parte
 */
export function montarDataISO(dia, mes, ano) {
  const d = String(dia ?? "").trim();
  const m = String(mes ?? "").trim();
  const a = String(ano ?? "").trim();
  if (!d || !m || !a) return "";
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(a)) return "";
  return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * Desmonta "AAAA-MM-DD" nos três campos da tela. O inverso de
 * `montarDataISO`, para reabrir o formulário com o que já foi digitado.
 *
 * @param {string} iso
 * @returns {{dia: string, mes: string, ano: string}} partes vazias quando não dá
 */
export function separarDataISO(iso) {
  const bruto = String(iso ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return { dia: "", mes: "", ano: "" };
  const [ano, mes, dia] = bruto.split("-");
  // Sem zero à esquerda: o campo é digitado por gente, e "07" num input
  // numérico é o tipo de detalhe que faz a pessoa apagar e redigitar.
  return { dia: String(Number(dia)), mes: String(Number(mes)), ano };
}

export function dataNascimentoUtil(texto) {
  const bruto = String(texto ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return null;
  // Tudo em UTC e comparado como TEXTO. Data de nascimento é dia de
  // calendário, não instante: montar Date no fuso local faz "hoje" virar
  // "amanhã" (ou ontem) conforme a hora e onde a pessoa está, e o campo
  // recusaria uma data perfeitamente boa dependendo do relógio.
  const d = new Date(`${bruto}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // "2026-02-31" o Date aceita e rola para março: comparar de volta é o
  // que pega dia que não existe no mês.
  if (d.toISOString().slice(0, 10) !== bruto) return null;
  const hoje = new Date();
  const hojeISO = hoje.toISOString().slice(0, 10);
  if (bruto > hojeISO) return null;
  // Texto ISO compara na ordem certa por ser sempre AAAA-MM-DD.
  const limiteISO = `${hoje.getUTCFullYear() - 120}${hojeISO.slice(4)}`;
  if (bruto < limiteISO) return null;
  return bruto;
}

// ── Carrinho (cálculo só para exibição) ────────────────────────────

/**
 * Quanto as opções escolhidas acrescentam, RESPEITANDO A REGRA DE CADA
 * GRUPO. Grupos diferentes sempre se somam entre si; dentro do grupo, é
 * a regra dele que decide (ver `precoDoGrupo`, a mesma conta do PDV).
 *
 * Um grupo de complemento do delivery não tem regra e cai em 'soma' —
 * que é exatamente o que ele sempre fez. O que muda é o grupo de
 * escolha vindo do cadastro do produto, onde "escolha 4 sabores" cobra
 * a pizza mais cara em vez de quatro pizzas.
 *
 * @param {Array<{preco?: number, qtd?: number, grupoId?: string, regra?: string}>} complementos
 */
export function precoDosComplementos(complementos) {
  const porGrupo = new Map();
  for (const c of complementos ?? []) {
    // Sem grupo é 'soma', e somar é associativo: um balde só dá o mesmo.
    const chave = c?.grupoId ?? "__sem_grupo__";
    if (!porGrupo.has(chave)) porGrupo.set(chave, { regra: c?.regra, itens: [] });
    porGrupo.get(chave).itens.push({ preco: c?.preco, qtd: c?.qtd });
  }
  let total = 0;
  for (const { regra, itens } of porGrupo.values()) total += precoDoGrupo(itens, regra);
  return total;
}

/**
 * Soma dos complementos escolhidos de um item do carrinho.
 * @param {{complementosEscolhidos?: Array<{preco?: number}>}} item
 */
export function somaComplementos(item) {
  return precoDosComplementos(item?.complementosEscolhidos);
}

/** Preço unitário (base + complementos) de um item do carrinho. */
export function precoUnitario(item) {
  return (Number(item?.preco) || 0) + somaComplementos(item);
}

/** Preço total de uma linha do carrinho (unitário × qtd). */
export function precoLinha(item) {
  return precoUnitario(item) * Math.max(1, Number(item?.qtd) || 1);
}

/** Subtotal do carrinho inteiro. */
export function calcularSubtotal(itens) {
  return (itens ?? []).reduce((acc, item) => acc + precoLinha(item), 0);
}

/** Quantidade total de itens (para o badge da sacola). */
export function totalItens(itens) {
  return (itens ?? []).reduce((acc, item) => acc + Math.max(1, Number(item?.qtd) || 1), 0);
}

/**
 * Troco a levar quando o pagamento é em dinheiro. Retorna 0 quando não há
 * "troco para" válido ou quando é menor que o total (o motoboy não deve
 * receber "troco para" abaixo do total — a UI trata como sem troco).
 */
export function calcularTroco(trocoPara, total) {
  const t = valorDigitado(trocoPara) ?? 0;
  const tot = Number(total) || 0;
  if (t <= tot) return 0;
  return t - tot;
}

// ── Regras de complementos (min/max por grupo) ─────────────────────

/**
 * Um grupo está satisfeito quando a quantidade de escolhas respeita
 * min_escolhas e max_escolhas. Grupo sem mínimo (min=0) já nasce ok.
 * @param {{min?: number, max?: number}} grupo
 * @param {number} qtdEscolhida
 */
export function grupoSatisfeito(grupo, qtdEscolhida) {
  const min = Math.max(0, Number(grupo?.min) || 0);
  const max = Number(grupo?.max);
  const q = Math.max(0, Number(qtdEscolhida) || 0);
  if (q < min) return false;
  if (Number.isFinite(max) && max > 0 && q > max) return false;
  return true;
}

/**
 * Quantas UNIDADES foram escolhidas num grupo.
 *
 * A vitrine passou a guardar quantas de cada opção (`{ opcaoId: qtd }`),
 * porque "2 de calabresa e 1 de portuguesa" é um pedido de três fatias e
 * não de duas opções — é assim que o PDV já contava, e era só a vitrine
 * que insistia em contar opções distintas.
 *
 * A forma antiga (lista de ids) continua valendo: uma sacola guardada no
 * sessionStorage antes desta versão cai aqui, e ali cada id vale 1.
 *
 * @param {Record<string, number>|Array<string>|null|undefined} escolha
 * @returns {number}
 */
export function unidadesDoGrupo(escolha) {
  if (Array.isArray(escolha)) return escolha.length;
  if (escolha && typeof escolha === "object") {
    return Object.values(escolha).reduce(
      (total, n) => total + Math.max(0, Number(n) || 0),
      0
    );
  }
  return 0;
}

/**
 * Achata a árvore de grupos (raiz → subgrupos → ...) numa lista plana, em
 * ordem de exibição (pré-ordem/DFS). Cada subgrupo é um grupo NORMAL com id
 * único, então achatar preserva o espaço de seleção plano (grupoId → ids).
 * Usada para varrer TODOS os grupos independentemente da profundidade
 * (validação, soma de complementos, condução ao pendente).
 * @param {Array} grupos
 * @returns {Array} todos os grupos da árvore, em pré-ordem
 */
export function achatarGrupos(grupos) {
  const saida = [];
  const visitar = (lista) => {
    for (const g of lista ?? []) {
      if (!g) continue;
      saida.push(g);
      if (g.subgrupos?.length) visitar(g.subgrupos);
    }
  };
  visitar(grupos);
  return saida;
}

/**
 * Uma árvore de grupo está satisfeita quando o PRÓPRIO grupo respeita seu
 * min/max E todos os subgrupos (recursivamente) também estão satisfeitos.
 * Cada grupo é chaveado pelo próprio id no mapa plano de seleções.
 * @param {{id: string, subgrupos?: Array}} grupo
 * @param {Record<string, string[]>} selecoesPorGrupo
 * @returns {boolean}
 */
export function grupoArvoreSatisfeita(grupo, selecoesPorGrupo) {
  if (!grupo) return true;
  const proprio = grupoSatisfeito(grupo, unidadesDoGrupo(selecoesPorGrupo?.[grupo.id]));
  if (!proprio) return false;
  return (grupo.subgrupos ?? []).every((sub) =>
    grupoArvoreSatisfeita(sub, selecoesPorGrupo)
  );
}

/**
 * O produto pode ir pra sacola? Toda a árvore de grupos (raiz + subgrupos,
 * em qualquer profundidade) precisa estar satisfeita.
 * @param {{grupos?: Array}} produto
 * @param {Record<string, string[]>} selecoesPorGrupo - grupoId → ids escolhidos
 */
export function produtoPodeAdicionar(produto, selecoesPorGrupo) {
  const grupos = produto?.grupos ?? [];
  return grupos.every((g) => grupoArvoreSatisfeita(g, selecoesPorGrupo));
}

/**
 * Um grupo é IMPOSSÍVEL quando escolha nenhuma consegue satisfazê-lo. Dá
 * pra chegar nesse estado com dados perfeitamente salvos, de dois jeitos:
 *
 *  · o grupo exige mais opções do que existem para escolher. O dono marca
 *    "acabou o bacon" e o grupo "Escolha 1" fica sem nenhuma opção — a RPC
 *    do cardápio esconde o complemento indisponível, mas o mínimo do grupo
 *    continua valendo;
 *  · o máximo é menor que o mínimo, regra que se contradiz sozinha.
 *
 * Sem enxergar isso, o produto sai do ar em silêncio: o botão trava em
 * "Escolha os obrigatórios" para sempre e não há o que escolher. E o
 * servidor recusaria de qualquer forma (criar_pedido_delivery cobra o
 * min_escolhas do grupo), então insistir só gasta o tempo do cliente.
 * @param {{min?: number, max?: number, itens?: Array}} grupo
 * @returns {boolean}
 */
export function grupoImpossivel(grupo) {
  const min = Math.max(0, Number(grupo?.min) || 0);
  if (min === 0) return false; // grupo opcional nunca trava nada
  const maxRaw = Number(grupo?.max);
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 0; // 0 = sem limite
  if (max > 0 && min > max) return true;
  return min > (grupo?.itens?.length ?? 0);
}

/**
 * O produto tem algum grupo impossível na árvore? Varre raiz e subgrupos em
 * qualquer profundidade — a mesma varredura que grupoArvoreSatisfeita faz,
 * porque um subgrupo obrigatório trava o produto mesmo pendurado num pai
 * opcional.
 * @param {{grupos?: Array}} produto
 * @returns {boolean}
 */
export function produtoImpossivel(produto) {
  return achatarGrupos(produto?.grupos ?? []).some(grupoImpossivel);
}

/**
 * Rótulo humano da regra de um grupo — linguagem do dia a dia, não jargão
 * (Princípio nº 1). Ex.: "Escolha 1", "Escolha de 1 a 3", "Opcional · até 3".
 * @param {{min?: number, max?: number}} grupo
 * @returns {string}
 */
export function rotuloRegraGrupo(grupo) {
  // Pedir "Escolha 1" num grupo sem opção é mandar fazer o impossível.
  if (grupoImpossivel(grupo)) return "Indisponível no momento";
  const min = Math.max(0, Number(grupo?.min) || 0);
  const maxRaw = Number(grupo?.max);
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 0; // 0 = sem limite
  if (min > 0) {
    if (max > 0 && max === min) return `Escolha ${min}`;
    if (max > 0) return `Escolha de ${min} a ${max}`;
    return `Escolha ao menos ${min}`;
  }
  if (max > 1) return `Opcional · até ${max}`;
  return "Opcional";
}

/**
 * O mesmo selo do grupo, agora sabendo quanto já foi escolhido. É a
 * diferença entre um cartaz parado ("Escolha 3") e alguém dizendo o que
 * falta enquanto a pessoa escolhe ("Faltam 2", "✓ pronto").
 *
 * No teto, a frase é a resposta à única pergunta que o cliente está
 * fazendo ali ("por que não entra mais?"), então ela tem prioridade sobre
 * o "pronto": o grupo completo já se anuncia pelo botão de adicionar.
 *
 * @param {{min?: number, max?: number, itens?: Array}} grupo
 * @param {number} unidades quantas unidades já foram escolhidas no grupo
 * @returns {string}
 */
export function rotuloProgressoGrupo(grupo, unidades) {
  if (grupoImpossivel(grupo)) return "Indisponível no momento";
  const min = Math.max(0, Number(grupo?.min) || 0);
  const maxRaw = Number(grupo?.max);
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 0; // 0 = sem limite
  const u = Math.max(0, Number(unidades) || 0);

  // Escolha única troca sozinha (tocar em outra substitui), então o teto
  // nunca vira um beco ali e a frase de "tire uma" não faz sentido.
  if (max > 1 && u >= max) return `Máximo ${max}, tire uma para trocar`;
  if (min > 0 && u < min) {
    if (u === 0) return rotuloRegraGrupo(grupo);
    const faltam = min - u;
    return faltam === 1 ? "Falta 1" : `Faltam ${faltam}`;
  }
  if (min > 0) return "✓ pronto";
  return rotuloRegraGrupo(grupo);
}

/**
 * Casa o texto digitado na busca com o nome da opção, ignorando acento e
 * caixa: quem procura "acai" tem de achar "Açaí". Busca vazia casa com
 * tudo, porque campo em branco não é filtro.
 *
 * @param {string} nome
 * @param {string} termo
 * @returns {boolean}
 */
export function combinaComBusca(nome, termo) {
  const limpar = (t) =>
    String(t ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove acentos
      .toLowerCase()
      .trim();
  const busca = limpar(termo);
  if (!busca) return true;
  return limpar(nome).includes(busca);
}

/**
 * Primeiro grupo ainda não satisfeito — usado para GUIAR o cliente até o
 * campo que falta (prevenção/condução de erro > mensagem seca).
 * @param {{grupos?: Array<{id: string}>}} produto
 * @param {Record<string, string[]>} selecoesPorGrupo
 * @returns {string|null} id do grupo pendente, ou null se tudo satisfeito
 */
export function primeiroGrupoPendente(produto, selecoesPorGrupo) {
  // Caminhada DFS em pré-ordem: mesma ordem em que os grupos aparecem na
  // tela, então rolamos para o PRIMEIRO campo que falta (pai antes dos
  // filhos), incluindo subgrupos em qualquer profundidade.
  for (const g of achatarGrupos(produto?.grupos ?? [])) {
    if (!grupoSatisfeito(g, unidadesDoGrupo(selecoesPorGrupo?.[g.id]))) return g.id;
  }
  return null;
}

// ── Sacola velha × cardápio de agora ───────────────────────────────

/**
 * Dinheiro em centavos inteiros. Os dois lados da comparação vêm de JSONs
 * diferentes (um do sessionStorage, outro da RPC de agora), então 12.30 de
 * um lado e 12.299999999999999 do outro apareceriam como "preço mudou" sem
 * nada ter mudado. Comparar em centavos mata o ruído de ponto flutuante.
 */
function centavos(valor) {
  return Math.round((Number(valor) || 0) * 100);
}

/** Ids atravessam JSON como bigint ou uuid — comparar sempre como texto. */
function mesmoId(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

/**
 * Confere a sacola guardada contra o cardápio que está no ar AGORA.
 *
 * A sacola vive em sessionStorage e sobrevive a recarregar a aba; o cardápio
 * é carregado uma vez e não se atualiza sozinho. Quando o dono tira um
 * produto do ar (ou marca um complemento como indisponível) no meio da
 * compra, o servidor recusa o pedido inteiro no ÚLTIMO clique com um seco
 * "Item indisponível." que não diz QUAL item. O cliente volta pra sacola,
 * não vê nada de errado, tenta de novo e leva a mesma recusa — beco sem
 * saída, só sai fechando a aba. Preço é a mesma história por outro caminho:
 * a linha guarda o preço de quando foi escolhida, o servidor cobra o de
 * agora, e o cliente descobre que pagou diferente só na confirmação.
 *
 * Aqui a divergência aparece ANTES, na sacola, com o nome do item e o preço
 * novo na tela (prevenção de erro > mensagem de erro, Princípio nº 1).
 *
 * @param {Array} itens linhas da sacola (useCarrinho)
 * @param {{produtos?: Array, combos?: Array}|null} cardapio resposta de cardapio_publico
 * @returns {{linhas: Array, temFora: boolean, temPrecoNovo: boolean, subtotal: number}}
 *   cada linha é o item + `situacao`: "ok" | "fora" | "preco". Nas linhas que
 *   sobrevivem, `preco` e `complementosEscolhidos` já vêm com o valor de agora.
 */
export function revisarSacola(itens, cardapio) {
  const lista = itens ?? [];
  // Sem cardápio na mão (RPC ainda carregando, ou falhou) não dá para
  // afirmar nada. Acusar "saiu do cardápio" aqui seria apagar a sacola do
  // cliente por causa de uma falha nossa de rede.
  if (!cardapio) {
    const linhas = lista.map((item) => ({ ...item, situacao: "ok" }));
    return { linhas, temFora: false, temPrecoNovo: false, subtotal: calcularSubtotal(linhas) };
  }

  const produtos = cardapio.produtos ?? [];
  const combos = cardapio.combos ?? [];

  const linhas = lista.map((item) => {
    const ehCombo = item?.combo_id !== null && item?.combo_id !== undefined;
    const atual = ehCombo
      ? combos.find((c) => mesmoId(c?.combo_id, item.combo_id))
      : produtos.find((p) => mesmoId(p?.produto_id, item?.produto_id));

    // Sumiu do cardápio: desativado, esgotado ou fora do delivery.
    if (!atual) return { ...item, situacao: "fora" };

    // Complementos: a RPC já esconde os indisponíveis, então "não está mais
    // na árvore de grupos" é exatamente "não dá mais para pedir".
    const disponiveis = new Map();
    for (const g of achatarGrupos(atual.grupos ?? [])) {
      for (const c of g?.itens ?? []) disponiveis.set(String(c?.id), c);
    }

    const escolhidos = item?.complementosEscolhidos ?? [];
    let algumSumiu = false;
    let complementoMudouPreco = false;
    const complementosAtuais = escolhidos.map((c) => {
      const vivo = disponiveis.get(String(c?.id));
      if (!vivo) {
        algumSumiu = true;
        return c;
      }
      if (centavos(vivo.preco) !== centavos(c?.preco)) complementoMudouPreco = true;
      return { ...c, preco: Number(vivo.preco) || 0 };
    });

    if (algumSumiu) return { ...item, situacao: "fora" };

    const precoMudou = centavos(atual.preco) !== centavos(item?.preco);
    return {
      ...item,
      // O emoji vem do cardápio de AGORA, não da sacola: assim a sacola
      // guardada de ontem também mostra o ícone, e ele acompanha o produto
      // se o dono trocar o emoji no cadastro.
      emoji: atual.emoji ?? item?.emoji ?? null,
      preco: Number(atual.preco) || 0,
      complementosEscolhidos: complementosAtuais,
      situacao: precoMudou || complementoMudouPreco ? "preco" : "ok",
    };
  });

  return {
    linhas,
    temFora: linhas.some((l) => l.situacao === "fora"),
    temPrecoNovo: linhas.some((l) => l.situacao === "preco"),
    // O subtotal soma TODAS as linhas, inclusive as que saíram do cardápio:
    // ele tem que bater com o que está desenhado na tela. Nenhum pedido
    // errado escapa por isso — o avanço fica bloqueado até a linha sair.
    subtotal: calcularSubtotal(linhas),
  };
}
