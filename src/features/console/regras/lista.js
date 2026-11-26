import { PERIODOS_ANALYTICS } from "../dados/paineis";

// Ordem por urgência, busca e filtros da lista de estabelecimentos, e a leitura dos parâmetros da URL.
// Ordem de urgência para o "alerta de validade" do Console: sem assinatura
// primeiro (o pior caso comercial — o estabelecimento opera e a plataforma
// não cobra nada por ele), depois bloqueado (já perdeu acesso), carência
// (atrasado, ainda no prazo) e por fim ativo vencendo em breve. Dentro do
// mesmo status, ordena por dias a vencer.
export const URGENCIA_STATUS = { sem_assinatura: 0, bloqueado: 1, carencia: 2, ativo: 3 };

/** Janela do "vencendo em breve" (espelha o banner do tenant). */
const VENCE_EM_DIAS = 5;

/**
 * Uma linha de `resumirPlataforma` pede ação da plataforma agora?
 * Régua única: o alerta de validade e a ordem da lista de estabelecimentos
 * usam esta mesma função, para as duas telas nunca discordarem sobre quem
 * é urgente. 'cancelado' fica de fora de propósito (decisão manual já
 * resolvida, não pendência).
 */
export function precisaAtencao(l) {
  return (
    l.status === "sem_assinatura" ||
    l.status === "bloqueado" ||
    l.status === "carencia" ||
    (l.status === "ativo" && l.diasParaVencer != null && l.diasParaVencer <= VENCE_EM_DIAS)
  );
}

/**
 * Função PURA — reordena uma lista de estabelecimentos colocando quem
 * precisa de ação no topo, na mesma ordem de urgência do alerta de
 * validade (`precisamAtencao`). Quem não precisa de nada mantém a ordem
 * original em que chegou; empate dentro do bloco urgente também cai na
 * ordem original, para a lista não dançar entre renders.
 *
 * Não faz I/O e não muda os arrays recebidos.
 *
 * @param {Array<{id:string}>} itens estabelecimentos, na ordem do banco
 * @param {Array<{tenantId:string, status:string, diasParaVencer:number|null}>} linhas saída de `resumirPlataforma`
 * @returns {Array<object>} novo array com os mesmos itens, reordenados
 */
export function ordenarPorUrgencia(itens = [], linhas = []) {
  const porId = new Map((linhas ?? []).map((l) => [l.tenantId, l]));
  return (itens ?? [])
    .map((item, indice) => ({ item, indice, linha: porId.get(item?.id) ?? null }))
    .sort((a, b) => {
      const urgenteA = a.linha && precisaAtencao(a.linha) ? 0 : 1;
      const urgenteB = b.linha && precisaAtencao(b.linha) ? 0 : 1;
      if (urgenteA !== urgenteB) return urgenteA - urgenteB;
      if (urgenteA === 0) {
        const porStatus =
          (URGENCIA_STATUS[a.linha.status] ?? 9) - (URGENCIA_STATUS[b.linha.status] ?? 9);
        if (porStatus !== 0) return porStatus;
        const porDias = (a.linha.diasParaVencer ?? 0) - (b.linha.diasParaVencer ?? 0);
        if (porDias !== 0) return porDias;
      }
      return a.indice - b.indice;
    })
    .map((x) => x.item);
}

/** Texto comparável: sem caixa, sem acento e sem espaço sobrando. Existe
 *  porque "Café Central" precisa ser encontrado digitando "cafe". */
function paraBusca(texto) {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
}

/**
 * Função PURA — filtra estabelecimentos pelo nome OU pelo endereço (o `slug`,
 * rótulo que aparece no link do cardápio e no acesso). Casa qualquer trecho
 * (não só o começo), ignorando caixa e acento. Termo vazio devolve a lista
 * inteira, na ordem em que chegou — filtrar não reordena.
 *
 * O endereço entra na busca porque é assim que o cliente se identifica ao
 * dono ("meu link é casacoffee"), e porque dois estabelecimentos de nome
 * parecido só se distinguem por ele. Tenant sem slug (anterior à 20260740)
 * simplesmente não casa por endereço — continua achável pelo nome.
 *
 * Não faz I/O e não muda o array recebido.
 *
 * @param {Array<{nome?:string, slug?:string}>} itens
 * @param {string} termo
 * @returns {Array<object>}
 */
export function filtrarEstabelecimentos(itens = [], termo = "") {
  const alvo = paraBusca(termo);
  if (!alvo) return [...(itens ?? [])];
  return (itens ?? []).filter(
    (t) => paraBusca(t?.nome).includes(alvo) || paraBusca(t?.slug).includes(alvo)
  );
}

/** Recortes possíveis da lista. Só estes três — o resto é "todos". */
export const FILTROS_SITUACAO = ["todos", "atencao", "em_dia"];

/**
 * Função PURA — recorta a lista por situação de cobrança. Não define quem
 * "precisa de atenção": recebe o conjunto de ids já decidido pela mesma régua
 * que ordena a lista e dispara o alerta de validade (`ordenarPorUrgencia`),
 * para não existir uma segunda definição do que é estar com problema.
 *
 * Filtro desconhecido, ausente ou "todos" devolve a lista inteira, na ordem em
 * que chegou — estado inválido nunca esconde estabelecimento.
 *
 * Não faz I/O e não muda o array recebido.
 *
 * @param {Array<{id?:string}>} itens
 * @param {string} filtro  "todos" | "atencao" | "em_dia"
 * @param {Set<string>} idsAtencao
 * @returns {Array<object>}
 */
export function filtrarPorSituacao(itens = [], filtro = "todos", idsAtencao = new Set()) {
  const lista = itens ?? [];
  const pendentes = idsAtencao ?? new Set();
  if (filtro === "atencao") return lista.filter((t) => pendentes.has(t?.id));
  if (filtro === "em_dia") return lista.filter((t) => !pendentes.has(t?.id));
  return [...lista];
}

/**
 * Função PURA — traduz o que veio da URL (`?situacao=...`) para um filtro
 * válido. O parâmetro é texto de fora: pode ter sido digitado, colado de um
 * link antigo ou vir repetido. Qualquer coisa que não seja exatamente um dos
 * três recortes vira "todos" — o estado que não esconde ninguém.
 *
 * Aceita `null`/`undefined` (parâmetro ausente) e o array que alguns leitores
 * de query string devolvem quando a chave aparece duas vezes; nesse caso não
 * há escolha honesta a fazer, então cai em "todos" também.
 *
 * Não lê `window` nem o roteador — quem faz isso é a tela.
 *
 * @param {string|string[]|null|undefined} bruto
 * @returns {"todos"|"atencao"|"em_dia"}
 */
export function normalizarFiltroSituacao(bruto) {
  if (typeof bruto !== "string") return "todos";
  return FILTROS_SITUACAO.includes(bruto) ? bruto : "todos";
}

/** Seções do Console, na ordem em que aparecem. A primeira é a padrão. */
export const ABAS_CONSOLE = ["estabelecimentos", "solicitacoes", "planos", "uso", "saude"];

/**
 * Função PURA — traduz o que veio da URL (`?aba=...`) para uma aba válida.
 * Mesmo molde do `normalizarFiltroSituacao`: o parâmetro é texto de fora, e
 * qualquer coisa que não seja exatamente uma das seções cai na primeira —
 * o Console nunca abre sem conteúdo por causa de um endereço torto.
 *
 * Não lê `window` nem o roteador — quem faz isso é a tela.
 *
 * @param {string|string[]|null|undefined} bruto
 * @returns {"estabelecimentos"|"solicitacoes"|"planos"|"uso"|"saude"}
 */
export function normalizarAba(bruto) {
  if (typeof bruto !== "string") return ABAS_CONSOLE[0];
  return ABAS_CONSOLE.includes(bruto) ? bruto : ABAS_CONSOLE[0];
}

/** Período padrão da aba de uso — o mesmo que a tela já abria antes da URL. */
export const PERIODO_PADRAO = 30;

/**
 * Função PURA — traduz o que veio da URL (`?dias=...`) para um dos períodos
 * oferecidos pela aba de uso. O parâmetro chega como texto; só um texto que
 * seja exatamente um número do conjunto passa. `"90.0"`, `"45"`, `"-30"`,
 * `"abc"` e parâmetro repetido caem no padrão — o período tem que casar com um
 * dos botões da tela, senão nenhum apareceria marcado.
 *
 * Não lê `window` nem o roteador — quem faz isso é a tela.
 *
 * @param {string|string[]|null|undefined} bruto
 * @returns {number}
 */
export function normalizarPeriodo(bruto) {
  if (typeof bruto !== "string" || !/^\d+$/.test(bruto)) return PERIODO_PADRAO;
  const n = Number(bruto);
  return PERIODOS_ANALYTICS.includes(n) ? n : PERIODO_PADRAO;
}

/**
 * Função PURA — recorta a lista pelo plano contratado. `"todos"` (ou qualquer
 * coisa fora de um código de plano) devolve a lista inteira, na ordem em que
 * chegou.
 *
 * Estabelecimento sem plano (`plano_codigo` nulo) só aparece em "todos": ele
 * não está em nenhum plano, e mostrá-lo dentro de um recorte de plano seria
 * afirmar algo falso na tela.
 *
 * Não faz I/O e não muda o array recebido.
 *
 * @param {Array<{plano_codigo?:string|null}>} itens
 * @param {string} codigo  "todos" ou o código do plano
 * @returns {Array<object>}
 */
export function filtrarPorPlano(itens = [], codigo = "todos") {
  const lista = itens ?? [];
  if (typeof codigo !== "string" || codigo === "todos") return [...lista];
  return lista.filter((t) => t?.plano_codigo === codigo);
}

/**
 * Função PURA — traduz o que veio da URL (`?plano=...`) para um código de
 * plano que existe no catálogo RECEBIDO, nunca numa lista fixa: o catálogo é
 * do banco e muda por estabelecimento (decisão 017), então plano novo passa a
 * valer sozinho e nenhum código fica cravado aqui.
 *
 * Código inexistente, vazio, ausente, com caixa diferente ou repetido cai em
 * "todos" — o estado que não esconde ninguém. Catálogo vazio (ou que falhou ao
 * carregar) também: sem catálogo confiável não há recorte honesto.
 *
 * Não lê `window` nem o roteador — quem faz isso é a tela.
 *
 * @param {string|string[]|null|undefined} bruto
 * @param {Array<{codigo:string}>} planos  catálogo vindo do banco
 * @returns {string} "todos" ou um código do catálogo
 */
export function normalizarFiltroPlano(bruto, planos = []) {
  if (typeof bruto !== "string" || bruto === "") return "todos";
  const catalogo = Array.isArray(planos) ? planos : [];
  return catalogo.some((p) => p?.codigo === bruto) ? bruto : "todos";
}

/**
 * Função PURA — quantos estabelecimentos há em cada plano do catálogo, para a
 * contagem aparecer dentro do próprio atalho (clicar não é aposta).
 *
 * Conta sobre a base inteira que foi passada: quem chama decide se manda a
 * lista já recortada por situação ou a lista completa.
 *
 * @param {Array<{plano_codigo?:string|null}>} itens
 * @returns {Record<string, number>} código do plano → quantidade
 */
export function contarPorPlano(itens = []) {
  const lista = itens ?? [];
  const contagem = {};
  for (const t of lista) {
    const codigo = t?.plano_codigo;
    if (!codigo) continue;
    contagem[codigo] = (contagem[codigo] ?? 0) + 1;
  }
  return contagem;
}
