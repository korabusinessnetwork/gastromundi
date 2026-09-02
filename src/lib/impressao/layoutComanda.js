import { rotuloMetodo } from "@/utils/pagamentos";

/**
 * F020 — LAYOUT EDITÁVEL DA COMANDA (Leva 16).
 *
 * A comanda deixou de ser um template fixo: o estabelecimento monta o
 * papel bloco a bloco (ordem, o que aparece, alinhamento, tamanho,
 * texto livre). Este módulo é a FONTE ÚNICA desse layout — puro, sem
 * DOM e sem I/O.
 *
 * Por que fonte única: existem dois caminhos de impressão que precisam
 * concordar — o HTML do navegador (`renderizar.js`, driver
 * browser-raster) e o texto puro da térmica (`escposFormatador.js`,
 * Ponte KORA). Se cada um interpretasse o layout do seu jeito, a
 * pré-visualização da tela mentiria para quem imprime na térmica. Aqui
 * o layout é resolvido UMA vez (`resolverBlocosComanda`) e os dois
 * renderizadores só vestem o resultado: um com tags, outro com
 * espaços.
 *
 * Papel térmico é uma COLUNA de largura fixa (32 ou 48 caracteres) —
 * não existe posicionar em x/y como numa tela. Por isso o editor é uma
 * pilha de blocos que se arrasta, e não uma tela livre: é exatamente o
 * que o hardware sabe imprimir.
 *
 * Multi-tenant (decisão 017): nada de marca, texto ou regra de um
 * cliente aqui — nome e logo chegam resolvidos em `dados.identidade`.
 */

/**
 * X2 — o logo vem do CADASTRO DO TENANT (white-label, decisão 017): sem
 * validar o esquema, um `javascript:`/`data:text/html` salvo ali vira
 * XSS na janela de impressão. Allowlist: só `http:`, `https:` (logo
 * hospedado) ou `data:image/…` (logo embutido em base64) passam — o
 * resto é descartado e o bloco do logo simplesmente não sai.
 *
 * @param {any} url
 * @returns {boolean}
 */
export function logoUrlSegura(url) {
  const s = String(url ?? "").trim();
  if (!s) return false;
  return /^https?:/i.test(s) || /^data:image\//i.test(s);
}

// Prevenção de erro, não validação de tela: em 32 colunas (58mm) um
// texto muito maior que isso vira um bloco ilegível no meio do cupom.
export const MAX_TEXTO_BLOCO = 240;

export const DIGITOS_CNPJ = 14;

// Teto defensivo — o layout vem de JSON livre no banco. Papel com
// centenas de blocos é dado corrompido, não configuração.
export const MAX_BLOCOS = 60;

export const ALINHAMENTOS = ["esquerda", "centro", "direita"];
export const TAMANHOS = ["pequeno", "normal", "grande"];

// --- Largura das colunas da lista de itens ----------------------------
// O dono arrasta a divisória entre as colunas e decide quanto do papel
// vai para o nome do produto e quanto vai para os números. Guardado em
// PORCENTAGEM do papel, e não em pixels ou caracteres, porque é a única
// unidade que os dois mundos entendem: o navegador transforma em largura
// de coluna, a térmica transforma em contagem de caracteres.

export const COLUNAS_ITENS = ["nome", "qtd", "unitario", "total"];

// Piso por coluna. Abaixo disso a coluna deixa de caber até num valor
// curto e passa a quebrar toda linha — arrastar até ali não é
// customização, é estragar o papel (prevenção de erro, princípio nº1).
export const MIN_LARGURA_COLUNA = Object.freeze({ nome: 20, qtd: 7, unitario: 14, total: 16 });

// Fábrica, medida no papel de 58mm, que é o estreito: 14% é o mínimo em
// que o cabeçalho "Qtd" cabe numa linha, e 25% é o mínimo em que "32.50"
// não quebra no meio do número. O nome fica com o que sobra — é ele que
// aceita quebrar em mais linhas sem virar valor errado. Em 80mm tudo isso
// folga, e o dono pode arrastar a divisória do jeito que quiser.
export const LARGURAS_ITENS_PADRAO = Object.freeze({ nome: 33, qtd: 14, unitario: 25, total: 28 });

// Nome menor que isto na térmica não é coluna, é uma letra por linha.
const MIN_CHARS_NOME = 10;

/**
 * Larguras válidas a partir do que veio do banco (JSON livre): número,
 * respeitando o piso de cada coluna, somando exatamente 100. Pura.
 *
 * @param {any} bruto
 * @returns {{nome: number, qtd: number, unitario: number, total: number}}
 */
export function normalizarLargurasItens(bruto) {
  const cru = {};
  for (const coluna of COLUNAS_ITENS) {
    const n = Number(bruto?.[coluna]);
    cru[coluna] = Number.isFinite(n) && n > 0 ? n : LARGURAS_ITENS_PADRAO[coluna];
  }
  return escalarPara100(cru, COLUNAS_ITENS);
}

// Escala as colunas informadas para somar 100 e devolve cada uma no seu
// piso. A sobra da divisão fica com `nome`, que é a coluna elástica — é
// ela que aceita quebrar em mais de uma linha sem estragar o papel.
function escalarPara100(larguras, chaves) {
  const soma = chaves.reduce((t, c) => t + (larguras[c] ?? 0), 0) || 1;
  const saida = {};
  let usado = 0;
  for (const chave of chaves) {
    if (chave === "nome") continue;
    const escalado = ((larguras[chave] ?? 0) * 100) / soma;
    saida[chave] = Math.round(Math.max(MIN_LARGURA_COLUNA[chave], escalado) * 10) / 10;
    usado += saida[chave];
  }
  saida.nome = Math.round(Math.max(MIN_LARGURA_COLUNA.nome, 100 - usado) * 10) / 10;

  // O piso pode ter estourado os 100% (papel estreito com as quatro
  // colunas no mínimo): aí encolhe proporcionalmente quem não é o nome,
  // porque cortar o nome é o que deixa o item irreconhecível.
  const total = chaves.reduce((t, c) => t + saida[c], 0);
  if (total > 100) {
    const excedente = total - 100;
    const encolhivel = total - saida.nome;
    for (const chave of chaves) {
      if (chave === "nome") continue;
      saida[chave] = Math.round((saida[chave] - (excedente * saida[chave]) / encolhivel) * 10) / 10;
    }
    saida.nome = Math.round((100 - chaves.reduce((t, c) => (c === "nome" ? t : t + saida[c]), 0)) * 10) / 10;
  }

  // Reordena na ordem do papel: `mesmoLayout` compara por JSON, e ordem
  // de chave diferente viraria "alterado" sem nada ter mudado.
  return Object.fromEntries(COLUNAS_ITENS.filter((c) => chaves.includes(c)).map((c) => [c, saida[c]]));
}

/**
 * Projeta as larguras nas colunas que REALMENTE saem no papel: sem o
 * preço unitário são três colunas, e o espaço dele é redistribuído em
 * vez de virar buraco. Pura.
 *
 * @param {any} larguras
 * @param {boolean} mostrarUnitario
 * @returns {object} porcentagens somando 100, só das colunas visíveis
 */
export function largurasVisiveis(larguras, mostrarUnitario) {
  const completas = normalizarLargurasItens(larguras);
  const chaves = mostrarUnitario ? COLUNAS_ITENS : COLUNAS_ITENS.filter((c) => c !== "unitario");
  return escalarPara100(completas, chaves);
}

/**
 * Larguras em CARACTERES para a térmica, que não tem porcentagem: só
 * colunas de tamanho inteiro numa linha de 32 ou 48.
 *
 * Duas garantias que valem mais que a proporção pedida:
 * 1. coluna de número nunca fica menor que o maior valor que ela precisa
 *    mostrar — cortar "R$ 32.50" em "R$ 32" imprimiria um valor ERRADO;
 * 2. o nome tem que caber INTEIRO na coluna dele; senão devolve `null` e
 *    o pedido inteiro sai no formato empilhado (nome usando a linha toda,
 *    valor à direita embaixo), que é o de hoje.
 *
 * A regra 2 existe porque o papel de 48 colunas é justamente o que
 * permite "Filé à parmegiana com fritas e arroz" sair numa linha só.
 * Espremer esse nome numa coluna de 18 caracteres para ganhar alinhamento
 * de números seria trocar o que se lê pelo que se admira.
 *
 * @param {Array<object>} itens - itens resolvidos (nome, qty, unitario, total)
 * @param {number} colunas - colunas reais da impressora (32/48)
 * @param {object} larguras - porcentagens das colunas visíveis
 * @param {boolean} mostrarUnitario
 * @returns {{nome: number, qtd: number, unitario: number, total: number}|null}
 */
export function largurasEmCaracteres(itens, colunas, larguras, mostrarUnitario) {
  const total = Math.max(1, Math.floor(Number(colunas) || 0));
  const pct = largurasVisiveis(larguras, mostrarUnitario);
  const lista = Array.isArray(itens) ? itens : [];
  const maior = (fn) => lista.reduce((m, it) => Math.max(m, String(fn(it) ?? "").length), 0);

  const largura = {
    qtd: Math.max(Math.round((pct.qtd * total) / 100), maior((it) => `${it.qty}x`) + 1),
    unitario: mostrarUnitario
      ? Math.max(Math.round((pct.unitario * total) / 100), maior((it) => it.unitario) + 1)
      : 0,
    total: Math.max(Math.round((pct.total * total) / 100), maior((it) => it.total) + 1),
  };

  const nome = total - largura.qtd - largura.unitario - largura.total;
  if (nome < MIN_CHARS_NOME || nome < maior((it) => it.nome)) return null;
  return { nome, ...largura };
}

/**
 * Catálogo dos blocos que podem compor a comanda. `props` declara o
 * que cada tipo aceita — é o que faz o painel de propriedades mostrar
 * só controle que tem efeito (alinhar um "Subtotal" não faz sentido:
 * ele é rótulo à esquerda e valor à direita, sempre).
 *
 * `repetivel` marca os blocos que podem entrar mais de uma vez
 * (texto livre, divisória, espaço). Os demais são únicos: duas linhas
 * de TOTAL no mesmo papel seria erro, não customização.
 */
export const TIPOS_BLOCO = {
  logo: {
    rotulo: "Logo",
    ajuda: "A imagem cadastrada na identidade do estabelecimento.",
    props: ["alinhamento"],
  },
  nome: {
    rotulo: "Nome do estabelecimento",
    ajuda: "O nome cadastrado na identidade.",
    props: ["alinhamento", "tamanho", "negrito", "maiuscula"],
  },
  endereco: {
    rotulo: "Endereço",
    ajuda: "Escreva o endereço que sai impresso.",
    props: ["alinhamento", "tamanho", "texto"],
    placeholder: "Rua, número, bairro — cidade/UF",
  },
  cnpj: {
    rotulo: "CNPJ",
    ajuda: "Sai com o prefixo “CNPJ:” na frente.",
    props: ["alinhamento", "tamanho", "texto"],
    placeholder: "00.000.000/0000-00",
  },
  dataHora: {
    rotulo: "Data e hora",
    ajuda: "O momento da impressão.",
    props: ["alinhamento", "tamanho"],
  },
  comanda: {
    rotulo: "Número da comanda",
    ajuda: "Comanda 42, Mesa 7 — como o pedido é identificado.",
    props: ["alinhamento", "tamanho", "negrito", "maiuscula"],
  },
  itens: {
    rotulo: "Lista dos itens",
    ajuda: "O que foi consumido, com quantidade e valor.",
    props: ["opcoesItens"],
  },
  subtotal: {
    rotulo: "Subtotal",
    ajuda: "Só aparece quando há taxa, desconto ou acréscimo.",
    props: ["tamanho", "negrito"],
  },
  taxa: {
    rotulo: "Taxa de serviço",
    ajuda: "Só aparece quando a venda tem taxa.",
    props: ["tamanho", "negrito"],
  },
  ajuste: {
    rotulo: "Desconto / acréscimo",
    ajuda: "Só aparece quando a venda tem desconto ou acréscimo.",
    props: ["tamanho", "negrito"],
  },
  total: {
    rotulo: "TOTAL",
    ajuda: "O valor que o cliente paga.",
    props: ["tamanho", "negrito"],
  },
  troco: {
    rotulo: "Troco",
    ajuda: "Só aparece quando houve troco em dinheiro.",
    props: ["tamanho", "negrito"],
  },
  pagamento: {
    rotulo: "Forma de pagamento",
    ajuda: "Pix, cartão, dinheiro — como foi pago.",
    props: ["alinhamento", "tamanho"],
  },
  avisoNaoFiscal: {
    rotulo: "Aviso de documento não fiscal",
    ajuda: "Sai só na conta do cliente (pré-nota), não no comprovante.",
    props: ["alinhamento", "tamanho"],
  },
  rodape: {
    rotulo: "Mensagem final",
    ajuda: "A última linha do papel — agradecimento, wi-fi, Instagram.",
    props: ["alinhamento", "tamanho", "texto"],
    placeholder: "Ex.: Obrigado pela preferência!",
  },
  texto: {
    rotulo: "Texto livre",
    ajuda: "Qualquer coisa que você quiser imprimir.",
    props: ["alinhamento", "tamanho", "negrito", "maiuscula", "texto"],
    placeholder: "Ex.: Wi-fi: gastro2026",
    repetivel: true,
  },
  separador: {
    rotulo: "Linha divisória",
    ajuda: "Uma linha tracejada de ponta a ponta.",
    props: [],
    repetivel: true,
  },
  espaco: {
    rotulo: "Espaço em branco",
    ajuda: "Respiro entre um bloco e outro.",
    props: ["linhasEmBranco"],
    repetivel: true,
  },
};

const TIPOS_VALIDOS = Object.keys(TIPOS_BLOCO);

function aceita(tipo, prop) {
  return Boolean(TIPOS_BLOCO[tipo]?.props?.includes(prop));
}

/**
 * Layout de fábrica — reproduz o papel que o sistema sempre imprimiu:
 * identidade no topo, itens no meio, totais, pagamento e a mensagem
 * final. É o ponto de partida de todo estabelecimento e o destino do
 * botão "Restaurar padrão".
 */
export const LAYOUT_COMANDA_PADRAO = Object.freeze([
  { id: "logo", tipo: "logo", visivel: true, alinhamento: "centro" },
  { id: "nome", tipo: "nome", visivel: true, alinhamento: "centro", tamanho: "grande", negrito: true },
  { id: "dataHora", tipo: "dataHora", visivel: true, alinhamento: "centro", tamanho: "pequeno" },
  { id: "endereco", tipo: "endereco", visivel: false, alinhamento: "centro", tamanho: "pequeno", texto: "" },
  { id: "cnpj", tipo: "cnpj", visivel: false, alinhamento: "centro", tamanho: "pequeno", texto: "" },
  { id: "comanda", tipo: "comanda", visivel: true, alinhamento: "centro", tamanho: "pequeno" },
  { id: "separador-1", tipo: "separador", visivel: true },
  { id: "itens", tipo: "itens", visivel: true, opcoes: { unitario: true, observacoes: true, emoji: true } },
  { id: "separador-2", tipo: "separador", visivel: true },
  { id: "subtotal", tipo: "subtotal", visivel: true, tamanho: "pequeno" },
  { id: "taxa", tipo: "taxa", visivel: true, tamanho: "pequeno" },
  { id: "ajuste", tipo: "ajuste", visivel: true, tamanho: "pequeno" },
  { id: "total", tipo: "total", visivel: true, tamanho: "grande", negrito: true },
  { id: "troco", tipo: "troco", visivel: true, tamanho: "pequeno" },
  { id: "pagamento", tipo: "pagamento", visivel: true, alinhamento: "centro", tamanho: "pequeno" },
  { id: "avisoNaoFiscal", tipo: "avisoNaoFiscal", visivel: true, alinhamento: "centro", tamanho: "pequeno" },
  { id: "separador-3", tipo: "separador", visivel: true },
  { id: "rodape", tipo: "rodape", visivel: true, alinhamento: "centro", tamanho: "pequeno", texto: "" },
]);

function textoLimpo(valor) {
  return String(valor ?? "").slice(0, MAX_TEXTO_BLOCO);
}

function umDe(valor, opcoes, padrao) {
  return opcoes.includes(valor) ? valor : padrao;
}

/**
 * Sanitiza um bloco vindo do banco (JSON livre): tipo desconhecido é
 * descartado pelo chamador, propriedade que o tipo não aceita não é
 * gravada, texto é cortado no limite. Pura.
 */
function normalizarBloco(bruto, id) {
  const tipo = bruto?.tipo;
  const bloco = { id, tipo, visivel: bruto?.visivel !== false };

  if (aceita(tipo, "alinhamento")) bloco.alinhamento = umDe(bruto?.alinhamento, ALINHAMENTOS, "centro");
  if (aceita(tipo, "tamanho")) bloco.tamanho = umDe(bruto?.tamanho, TAMANHOS, "normal");
  if (aceita(tipo, "negrito")) bloco.negrito = bruto?.negrito === true;
  if (aceita(tipo, "maiuscula")) bloco.maiuscula = bruto?.maiuscula === true;
  if (aceita(tipo, "texto")) bloco.texto = textoLimpo(bruto?.texto);
  if (aceita(tipo, "opcoesItens")) {
    bloco.opcoes = {
      unitario: bruto?.opcoes?.unitario !== false,
      observacoes: bruto?.opcoes?.observacoes !== false,
      emoji: bruto?.opcoes?.emoji !== false,
      larguras: normalizarLargurasItens(bruto?.opcoes?.larguras),
    };
  }
  if (aceita(tipo, "linhasEmBranco")) {
    const n = Math.round(Number(bruto?.opcoes?.linhas));
    bloco.opcoes = { linhas: Number.isFinite(n) ? Math.min(3, Math.max(1, n)) : 1 };
  }

  return bloco;
}

/**
 * Normaliza a lista inteira: descarta tipo desconhecido, remove
 * repetição de bloco único (dois TOTAL no mesmo papel é dado sujo, não
 * escolha) e garante id único e estável para cada bloco — o id é a
 * chave do React e o que a reordenação move. Determinística: não
 * sorteia id, deriva do tipo e da posição.
 *
 * @param {any} bruto
 * @returns {Array<object>} lista normalizada (vazia se `bruto` não for utilizável)
 */
export function normalizarLayoutComanda(bruto) {
  const lista = Array.isArray(bruto) ? bruto : Array.isArray(bruto?.blocos) ? bruto.blocos : null;
  if (!lista) return [];

  const usados = new Set();
  const blocos = [];

  for (const item of lista.slice(0, MAX_BLOCOS)) {
    const tipo = item?.tipo;
    if (!TIPOS_VALIDOS.includes(tipo)) continue;

    const repetivel = TIPOS_BLOCO[tipo].repetivel === true;
    if (!repetivel && usados.has(tipo)) continue;
    usados.add(tipo);

    const id = repetivel ? `${tipo}-${blocos.filter((b) => b.tipo === tipo).length + 1}` : tipo;
    blocos.push(normalizarBloco(item, id));
  }

  return blocos;
}

/**
 * Layout efetivo de um estabelecimento a partir da config de impressão.
 *
 * Quem nunca abriu o editor não tem `layoutComanda` gravado: aí o
 * padrão de fábrica é SEMEADO com o que já estava configurado
 * (endereço, CNPJ, mensagem final, mostrar logo). É isso que faz o
 * papel continuar exatamente igual depois da atualização — ninguém
 * perde a configuração antiga nem precisa refazer nada.
 *
 * @param {object} [config] - config_impressao
 * @returns {Array<object>}
 */
export function layoutComandaDeConfig(config) {
  const salvo = normalizarLayoutComanda(config?.layoutComanda);
  if (salvo.length > 0) return salvo;

  const mostrarFiscal = config?.mostrarEnderecoCnpj === true;
  return normalizarLayoutComanda(
    LAYOUT_COMANDA_PADRAO.map((bloco) => {
      if (bloco.tipo === "logo") return { ...bloco, visivel: config?.mostrarLogo !== false };
      if (bloco.tipo === "endereco") return { ...bloco, visivel: mostrarFiscal, texto: config?.endereco ?? "" };
      if (bloco.tipo === "cnpj") return { ...bloco, visivel: mostrarFiscal, texto: config?.cnpj ?? "" };
      if (bloco.tipo === "rodape") return { ...bloco, texto: config?.rodapePersonalizado ?? "" };
      return bloco;
    })
  );
}

/**
 * Campos antigos de `config_impressao` derivados dos blocos. O editor
 * grava os dois: o layout (verdade nova) e este espelho (o que
 * `resolverIdentidadeTenant` e telas antigas ainda leem). Sem ele,
 * desligar o bloco de endereço no editor deixaria a identidade
 * resolvida achando que ainda deve imprimir. Pura.
 *
 * @param {Array<object>} blocos
 * @returns {{mostrarLogo: boolean, mostrarEnderecoCnpj: boolean, endereco: string, cnpj: string, rodapePersonalizado: string}}
 */
export function configLegadoDeLayout(blocos) {
  const acha = (tipo) => (Array.isArray(blocos) ? blocos.find((b) => b?.tipo === tipo) : null);
  const endereco = acha("endereco");
  const cnpj = acha("cnpj");
  return {
    mostrarLogo: acha("logo")?.visivel !== false,
    mostrarEnderecoCnpj: Boolean(endereco?.visivel || cnpj?.visivel),
    endereco: endereco?.texto ?? "",
    cnpj: cnpj?.texto ?? "",
    rodapePersonalizado: acha("rodape")?.texto ?? "",
  };
}

/**
 * Completa a lista com os blocos únicos que faltam, DESLIGADOS e no
 * fim. É o que o editor mostra: a lista é o catálogo do que a comanda
 * pode ter, e o olho decide o que imprime. Sem isso, um layout gravado
 * sem o bloco "Endereço" esconderia do dono que endereço é uma opção.
 *
 * Só o editor usa — a impressão respeita a lista como está gravada.
 *
 * @param {Array<object>} blocos
 * @returns {Array<object>}
 */
export function completarLayoutComanda(blocos) {
  const atual = normalizarLayoutComanda(blocos);
  const presentes = new Set(atual.map((b) => b.tipo));
  const faltando = LAYOUT_COMANDA_PADRAO
    .filter((b) => !presentes.has(b.tipo))
    .map((b) => ({ ...b, visivel: false }));
  return normalizarLayoutComanda([...atual, ...faltando]);
}

/**
 * Cria um bloco novo com os defaults do tipo, com id que não colide
 * com os já existentes. Pura (o id vem da lista, não de sorteio).
 *
 * @param {string} tipo
 * @param {Array<object>} [existentes]
 * @returns {object|null}
 */
export function blocoNovo(tipo, existentes = []) {
  if (!TIPOS_VALIDOS.includes(tipo)) return null;
  const repetivel = TIPOS_BLOCO[tipo].repetivel === true;
  if (!repetivel && existentes.some((b) => b?.tipo === tipo)) return null;

  const ids = new Set(existentes.map((b) => b?.id));
  let id = tipo;
  for (let n = 1; ids.has(id); n += 1) id = `${tipo}-${n}`;

  return normalizarBloco({ tipo, visivel: true }, id);
}

// --- Formatação compartilhada pelos dois renderizadores ---------------
// Mora aqui de propósito: enquanto cada renderizador tinha a sua cópia,
// bastava alguém mexer em um para o preview passar a mostrar um valor
// diferente do que a térmica imprime.

export function fmtR(v) {
  return "R$ " + Number(v ?? 0).toFixed(2);
}

/**
 * Aplica a máscara 00.000.000/0000-00 conforme se digita. Prevenção de
 * erro (princípio nº1): o dono digita só números e o CNPJ sai formatado
 * igual no papel de todo mundo, sem depender de ele acertar a pontuação.
 * Pura.
 *
 * @param {any} valor
 * @returns {string}
 */
export function formatarCnpj(valor) {
  const d = String(valor ?? "").replace(/\D/g, "").slice(0, DIGITOS_CNPJ);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function fmtComanda(nome) {
  return /^\d+$/.test(String(nome ?? "").trim()) ? `Comanda ${nome}` : (nome ?? "—");
}

function aplicarCaixa(texto, bloco) {
  return bloco?.maiuscula ? String(texto ?? "").toUpperCase() : String(texto ?? "");
}

function estiloDoBloco(bloco) {
  return {
    alinhamento: bloco.alinhamento ?? "esquerda",
    tamanho: bloco.tamanho ?? "normal",
    negrito: bloco.negrito === true,
  };
}

// Linhas de um texto livre: o dono pode escrever em mais de uma linha
// (wi-fi numa, Instagram noutra) e as duas saídas respeitam isso.
function linhasDeTexto(texto) {
  return String(texto ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function itemResolvido(item, opcoes) {
  const emoji = opcoes.emoji && item.emoji ? `${item.emoji} ` : "";
  return {
    nome: `${emoji}${item.nome ?? ""}`,
    qty: Number(item.qty) || 1,
    unitario: fmtR(item.preco),
    total: fmtR((Number(item.preco) || 0) * (Number(item.qty) || 1)),
    obs: opcoes.observacoes ? (Array.isArray(item.obs) ? item.obs : []) : [],
  };
}

/**
 * Resolve o layout contra os dados de uma venda: devolve só os blocos
 * que REALMENTE saem no papel, já com o conteúdo pronto (texto
 * formatado, valores em reais, itens montados).
 *
 * As regras de "não imprimir" ficam todas aqui — bloco escondido, logo
 * sem imagem, taxa zerada, troco zerado, aviso fiscal fora da pré-nota,
 * texto em branco. Como os dois renderizadores consomem esta mesma
 * lista, o que a tela mostra é o que a impressora recebe.
 *
 * @param {Array<object>} layout - blocos normalizados
 * @param {object} dados - retorno de montarComprovantePagamento/montarCupomPreNota
 * @returns {Array<object>} blocos resolvidos: {tipo, estilo, ...conteudo}
 */
export function resolverBlocosComanda(layout, dados) {
  const blocos = Array.isArray(layout) && layout.length > 0 ? layout : LAYOUT_COMANDA_PADRAO;
  const d = dados ?? {};
  const identidade = d.identidade ?? {};
  const agora = d.agora instanceof Date ? d.agora : new Date();
  const pagamentos = (Array.isArray(d.pagamentos) ? d.pagamentos : []).filter((p) => p?.metodo);
  const valorTaxa = Number(d.valorTaxa) || 0;
  const valorAjuste = Number(d.valorAjuste) || 0;
  const trocoTotal = Number(d.trocoTotal) || 0;

  const saida = [];

  for (const bloco of blocos) {
    if (bloco?.visivel === false) continue;
    const estilo = estiloDoBloco(bloco);
    const texto = (t) => aplicarCaixa(t, bloco);

    switch (bloco.tipo) {
      case "logo": {
        // Sem logo cadastrada (ou com URL recusada pela allowlist de
        // esquema) o bloco simplesmente não sai — quem imprime o nome é
        // o bloco "Nome do estabelecimento", que é independente.
        if (!logoUrlSegura(identidade.logoUrl)) break;
        saida.push({ tipo: "logo", estilo, url: identidade.logoUrl, alt: identidade.nome ?? "" });
        break;
      }
      case "nome": {
        if (!identidade.nome) break;
        saida.push({ tipo: "texto", estilo, classe: "cabecalho__nome", linhas: [texto(identidade.nome)] });
        break;
      }
      case "endereco": {
        const valor = bloco.texto || identidade.endereco || "";
        if (!valor.trim()) break;
        saida.push({ tipo: "texto", estilo, classe: "identidade-fiscal", linhas: linhasDeTexto(texto(valor)) });
        break;
      }
      case "cnpj": {
        const valor = bloco.texto || identidade.cnpj || "";
        if (!valor.trim()) break;
        saida.push({ tipo: "texto", estilo, classe: "identidade-fiscal", linhas: [`CNPJ: ${valor.trim()}`] });
        break;
      }
      case "dataHora": {
        saida.push({ tipo: "texto", estilo, classe: "cabecalho__linha", linhas: [agora.toLocaleString("pt-BR")] });
        break;
      }
      case "comanda": {
        saida.push({ tipo: "texto", estilo, classe: "cabecalho__linha", linhas: [texto(fmtComanda(d.comanda))] });
        break;
      }
      case "itens": {
        const opcoes = bloco.opcoes ?? { unitario: true, observacoes: true, emoji: true };
        const unitario = opcoes.unitario !== false;
        saida.push({
          tipo: "itens",
          estilo,
          unitario,
          // Já projetadas nas colunas que saem: os dois renderizadores
          // recebem a MESMA proporção e só mudam a unidade (porcentagem
          // no navegador, caractere na térmica).
          larguras: largurasVisiveis(opcoes.larguras, unitario),
          itens: (Array.isArray(d.itens) ? d.itens : []).map((i) => itemResolvido(i, opcoes)),
        });
        break;
      }
      case "subtotal": {
        // Mesma regra de sempre: sem taxa e sem ajuste, subtotal e total
        // seriam o mesmo número duas vezes — papel gasto à toa.
        if (valorTaxa <= 0 && valorAjuste === 0) break;
        saida.push({ tipo: "valor", estilo, rotulo: "Subtotal", valor: fmtR(d.subtotal) });
        break;
      }
      case "taxa": {
        if (valorTaxa <= 0) break;
        saida.push({ tipo: "valor", estilo, rotulo: "Taxa de Serviço", valor: fmtR(valorTaxa) });
        break;
      }
      case "ajuste": {
        if (valorAjuste === 0) break;
        const rotulo = d.ajuste?.tipo === "desconto" ? "Desconto" : "Acréscimo";
        const sinal = valorAjuste < 0 ? "-" : "+";
        saida.push({ tipo: "valor", estilo, rotulo, valor: `${sinal}${fmtR(Math.abs(valorAjuste))}` });
        break;
      }
      case "total": {
        saida.push({ tipo: "valor", estilo, destaque: true, rotulo: "TOTAL", valor: fmtR(d.total) });
        break;
      }
      case "troco": {
        if (trocoTotal <= 0) break;
        saida.push({ tipo: "valor", estilo, rotulo: "Troco", valor: fmtR(trocoTotal) });
        break;
      }
      case "pagamento": {
        if (pagamentos.length === 0) break;
        saida.push({
          tipo: "texto",
          estilo,
          classe: "metodo",
          linhas: pagamentos.map((p) => {
            const prefixo = pagamentos.length > 1 ? `${fmtR(p.valor)} · ` : "";
            return `${prefixo}Pagamento: ${rotuloMetodo(p.metodo)}`;
          }),
        });
        break;
      }
      case "avisoNaoFiscal": {
        if (!d.naoFiscal || !d.avisoNaoFiscal) break;
        saida.push({ tipo: "aviso", estilo, linhas: [d.avisoNaoFiscal] });
        break;
      }
      case "rodape": {
        const valor = bloco.texto || identidade.rodape || "";
        if (!valor.trim()) break;
        saida.push({ tipo: "texto", estilo, classe: "rodape", linhas: linhasDeTexto(texto(valor)) });
        break;
      }
      case "texto": {
        const linhas = linhasDeTexto(texto(bloco.texto));
        if (linhas.length === 0) break;
        saida.push({ tipo: "texto", estilo, classe: "livre", linhas });
        break;
      }
      case "separador": {
        saida.push({ tipo: "separador", estilo });
        break;
      }
      case "espaco": {
        saida.push({ tipo: "espaco", estilo, linhas: bloco.opcoes?.linhas ?? 1 });
        break;
      }
      default:
        break;
    }
  }

  return limparBordas(saida);
}

/**
 * Tira do papel o que só existia para separar coisa nenhuma: divisória
 * ou espaço na primeira/última posição e duas divisórias seguidas. Sem
 * isso, esconder um bloco do meio deixaria dois tracejados colados ou
 * um traço sozinho no fim do cupom. Pura.
 */
function limparBordas(blocos) {
  const enfeite = (b) => b?.tipo === "separador" || b?.tipo === "espaco";
  const saida = [];

  for (const bloco of blocos) {
    const anterior = saida[saida.length - 1];
    if (enfeite(bloco) && saida.length === 0) continue;
    if (bloco.tipo === "separador" && anterior?.tipo === "separador") continue;
    saida.push(bloco);
  }

  while (saida.length > 0 && enfeite(saida[saida.length - 1])) saida.pop();
  return saida;
}
