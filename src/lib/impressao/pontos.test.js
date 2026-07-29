import { describe, it, expect } from "vitest";
import {
  PONTO_PADRAO_ID,
  normalizarPontos,
  novoPonto,
  removerPonto,
  definirPadrao,
  pontoDoItem,
  agruparItensPorPonto,
  destinoDaCategoria,
  definirRotaCategoria,
  categoriasOrfas,
} from "./pontos";

const COZINHA = { id: "p1", nome: "Cozinha", impressora: { tipo: "windows", nome: "EPSON-COZINHA" }, padrao: true };
const BAR = { id: "p2", nome: "Bar", impressora: { tipo: "rede", host: "192.168.0.50", porta: 9100 }, padrao: false };

const DOIS_PONTOS = [COZINHA, BAR];

describe("normalizarPontos", () => {
  it("sem pontos gravados, sintetiza o ponto padrão com a impressora do perfil (quem já usava não perde impressão)", () => {
    const perfil = { impressora: { tipo: "windows", nome: "EPSON-TM20" } };

    expect(normalizarPontos([], perfil)).toEqual([
      { id: PONTO_PADRAO_ID, nome: "Cozinha", impressora: { tipo: "windows", nome: "EPSON-TM20" }, padrao: true },
    ]);
  });

  it("aceita pontos ausentes/nulos/lixo sem lançar e ainda devolve um ponto", () => {
    for (const entrada of [undefined, null, "x", 7, {}, [null, "a", 3]]) {
      const lista = normalizarPontos(entrada);
      expect(lista).toHaveLength(1);
      expect(lista[0].padrao).toBe(true);
    }
  });

  it("sem perfil e sem pontos, o padrão nasce sem impressora (o driver recusa com mensagem clara)", () => {
    expect(normalizarPontos(undefined, undefined)[0].impressora).toBeNull();
  });

  it("preserva a lista já correta (idempotente)", () => {
    expect(normalizarPontos(normalizarPontos(DOIS_PONTOS))).toEqual(DOIS_PONTOS);
  });

  it("dois marcados como padrão: só o primeiro continua padrão", () => {
    const lista = normalizarPontos([{ ...COZINHA }, { ...BAR, padrao: true }]);

    expect(lista.filter((p) => p.padrao).map((p) => p.id)).toEqual(["p1"]);
  });

  it("nenhum marcado como padrão: promove o primeiro da lista", () => {
    const lista = normalizarPontos([{ ...COZINHA, padrao: false }, { ...BAR }]);

    expect(lista.filter((p) => p.padrao).map((p) => p.id)).toEqual(["p1"]);
  });

  it("ids repetidos ganham id novo — senão duas linhas da tela editariam o mesmo ponto", () => {
    const lista = normalizarPontos([{ id: "p1", nome: "A" }, { id: "p1", nome: "B" }, { id: "p1", nome: "C" }]);

    expect(lista.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(lista.map((p) => p.nome)).toEqual(["A", "B", "C"]);
  });

  it("id ausente ou fora do padrão (espaço, acento, longo demais) é regerado", () => {
    const lista = normalizarPontos([
      { nome: "Sem id" },
      { id: "com espaço", nome: "Espaço" },
      { id: "ç", nome: "Acento" },
      { id: "x".repeat(30), nome: "Longo" },
      { id: "bar-2", nome: "Válido" },
    ]);

    expect(lista.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4", "bar-2"]);
  });

  it("nome vazio/só espaço cai num rótulo utilizável em vez de linha em branco na tela", () => {
    const lista = normalizarPontos([{ id: "p1", nome: "   " }, { id: "p2", nome: null }]);

    expect(lista[0].nome).toBe("Cozinha");
    expect(lista[1].nome).toBe("Ponto 2");
  });

  it("corta nome em 40 caracteres", () => {
    const lista = normalizarPontos([{ id: "p1", nome: "N".repeat(80) }]);

    expect(lista[0].nome).toHaveLength(40);
  });

  it("remove caracteres de controle do nome (bagunçam a térmica e o log)", () => {
    const sujo = `Coz${String.fromCharCode(0)}inha${String.fromCharCode(10)}Quente${String.fromCharCode(27)}`;

    const lista = normalizarPontos([{ id: "p1", nome: sujo }]);

    expect(lista[0].nome).toBe("Coz inha Quente");
    expect(/[\x00-\x1f]/.test(lista[0].nome)).toBe(false);
  });

  it("normaliza os dois formatos de impressora e descarta destino incompleto/desconhecido", () => {
    const lista = normalizarPontos([
      { id: "p1", nome: "A", impressora: { tipo: "windows", nome: "  EPSON  " } },
      { id: "p2", nome: "B", impressora: { tipo: "rede", host: "10.0.0.9", porta: "9100" } },
      { id: "p3", nome: "C", impressora: { tipo: "windows" } },
      { id: "p4", nome: "D", impressora: { tipo: "rede" } },
      { id: "p5", nome: "E", impressora: { tipo: "usb", nome: "X" } },
      { id: "p6", nome: "F", impressora: "EPSON" },
    ]);

    expect(lista[0].impressora).toEqual({ tipo: "windows", nome: "EPSON" });
    expect(lista[1].impressora).toEqual({ tipo: "rede", host: "10.0.0.9", porta: 9100 });
    expect(lista[2].impressora).toBeNull();
    expect(lista[3].impressora).toBeNull();
    expect(lista[4].impressora).toBeNull();
    expect(lista[5].impressora).toBeNull();
  });

  it("rede sem porta assume 9100 (porta padrão da térmica RAW)", () => {
    const lista = normalizarPontos([{ id: "p1", nome: "A", impressora: { tipo: "rede", host: "10.0.0.9" } }]);

    expect(lista[0].impressora.porta).toBe(9100);
  });

  it("não muta a lista recebida", () => {
    const original = [{ id: "p1", nome: "Cozinha", padrao: false }];
    const copia = JSON.parse(JSON.stringify(original));

    normalizarPontos(original);

    expect(original).toEqual(copia);
  });
});

describe("novoPonto", () => {
  it("gera id livre em relação aos existentes", () => {
    expect(novoPonto(DOIS_PONTOS, "Chapa")).toEqual({ id: "p3", nome: "Chapa", impressora: null, padrao: false });
  });

  it("reaproveita buraco na sequência de ids", () => {
    expect(novoPonto([{ id: "p1" }, { id: "p3" }], "Bar").id).toBe("p2");
  });

  it("nunca nasce padrão — adicionar um ponto não pode mudar para onde a produção já ia", () => {
    expect(novoPonto(DOIS_PONTOS, "Chapa").padrao).toBe(false);
  });

  it("nasce sem impressora — quem clicou em adicionar ainda não escolheu nada", () => {
    expect(novoPonto(DOIS_PONTOS, "Chapa").impressora).toBeNull();
  });

  it("sem nome, recebe um rótulo numerado utilizável", () => {
    expect(novoPonto(DOIS_PONTOS).nome).toBe("Ponto 3");
    expect(novoPonto([]).nome).toBe("Cozinha");
  });

  it("sanitiza e corta o nome digitado", () => {
    expect(novoPonto([], "B".repeat(60))).toMatchObject({ nome: "B".repeat(40) });
    expect(novoPonto([], `Ba${String.fromCharCode(7)}r`).nome).toBe("Ba r");
  });
});

describe("removerPonto", () => {
  const roteamento = { categorias: { Bebidas: "p2", Lanches: "p1" }, produtos: { 17: "p2", 42: "p1" } };

  it("remove o ponto e apaga as rotas que apontavam pra ele (nada de id órfão no banco)", () => {
    const { pontos, roteamento: limpo } = removerPonto(DOIS_PONTOS, roteamento, "p2");

    expect(pontos.map((p) => p.id)).toEqual(["p1"]);
    expect(limpo).toEqual({ categorias: { Lanches: "p1" }, produtos: { 42: "p1" } });
  });

  it("apagar o padrão promove outro — é impossível ficar sem padrão", () => {
    const { pontos } = removerPonto(DOIS_PONTOS, roteamento, "p1");

    expect(pontos.map((p) => p.id)).toEqual(["p2"]);
    expect(pontos[0].padrao).toBe(true);
  });

  it("limpa também rotas órfãs que já estavam gravadas apontando pra ponto inexistente", () => {
    const sujo = { categorias: { Bebidas: "p9", Lanches: "p1" }, produtos: { 17: "fantasma" } };

    const { roteamento: limpo } = removerPonto(DOIS_PONTOS, sujo, "p2");

    expect(limpo).toEqual({ categorias: { Lanches: "p1" }, produtos: {} });
  });

  it("não remove o último ponto — a produção não pode ficar sem destino", () => {
    const { pontos, roteamento: limpo } = removerPonto([COZINHA], roteamento, "p1");

    expect(pontos.map((p) => p.id)).toEqual(["p1"]);
    expect(pontos[0].impressora).toEqual(COZINHA.impressora);
    expect(limpo).toEqual({ categorias: { Lanches: "p1" }, produtos: { 42: "p1" } });
  });

  it("id inexistente não apaga nada, mas ainda devolve o roteamento sem órfãos", () => {
    const { pontos, roteamento: limpo } = removerPonto(DOIS_PONTOS, roteamento, "p9");

    expect(pontos.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(limpo).toEqual(roteamento);
  });

  it("roteamento ausente/lixo vira mapas vazios em vez de quebrar", () => {
    expect(removerPonto(DOIS_PONTOS, undefined, "p2").roteamento).toEqual({ categorias: {}, produtos: {} });
    expect(removerPonto(DOIS_PONTOS, { categorias: "x", produtos: 3 }, "p2").roteamento).toEqual({ categorias: {}, produtos: {} });
  });
});

describe("definirPadrao", () => {
  it("marca o alvo e desmarca os demais", () => {
    const lista = definirPadrao(DOIS_PONTOS, "p2");

    expect(lista.filter((p) => p.padrao).map((p) => p.id)).toEqual(["p2"]);
  });

  it("id inexistente mantém o padrão atual (nunca zera o padrão)", () => {
    const lista = definirPadrao(DOIS_PONTOS, "p9");

    expect(lista.filter((p) => p.padrao).map((p) => p.id)).toEqual(["p1"]);
  });

  it("normaliza lista suja e ainda garante um único padrão", () => {
    const lista = definirPadrao([{ id: "p1", nome: "A", padrao: true }, { id: "p2", nome: "B", padrao: true }], "p2");

    expect(lista.filter((p) => p.padrao).map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("pontoDoItem", () => {
  const roteamento = { categorias: { Bebidas: "p2" }, produtos: { 17: "p1" } };
  const ctx = { pontos: DOIS_PONTOS, roteamento };

  it("roteia pela categoria do produto", () => {
    expect(pontoDoItem({ id: 3, category: "Bebidas" }, ctx).id).toBe("p2");
  });

  it("exceção por produto VENCE a categoria", () => {
    // Chocolate quente é "Bebidas" (bar), mas é feito na cozinha.
    expect(pontoDoItem({ id: 17, category: "Bebidas" }, ctx).id).toBe("p1");
  });

  it("compara o id do produto como string (o banco devolve número, o mapa guarda texto)", () => {
    expect(pontoDoItem({ id: "17", category: "Bebidas" }, ctx).id).toBe("p1");
  });

  it("item sem categoria configurada cai no padrão", () => {
    expect(pontoDoItem({ id: 3, category: "Sobremesas" }, ctx).id).toBe("p1");
  });

  it("item sem id e sem category cai no padrão", () => {
    expect(pontoDoItem({ nome: "Avulso" }, ctx).id).toBe("p1");
    expect(pontoDoItem({}, ctx).id).toBe("p1");
  });

  it("item nulo/indefinido não lança e cai no padrão", () => {
    expect(pontoDoItem(undefined, ctx).id).toBe("p1");
    expect(pontoDoItem(null, ctx).id).toBe("p1");
  });

  it("rota apontando pra ponto que foi apagado cai no padrão (nunca some da produção)", () => {
    const orfao = { categorias: { Bebidas: "p9" }, produtos: { 17: "p9" } };

    expect(pontoDoItem({ id: 17, category: "Bebidas" }, { pontos: DOIS_PONTOS, roteamento: orfao }).id).toBe("p1");
  });

  it("respeita o padrão escolhido, não a primeira posição", () => {
    const pontos = definirPadrao(DOIS_PONTOS, "p2");

    expect(pontoDoItem({ id: 99, category: "Sobremesas" }, { pontos, roteamento }).id).toBe("p2");
  });

  it("sem pontos e sem roteamento, devolve o ponto sintetizado — nunca undefined", () => {
    expect(pontoDoItem({ id: 1, category: "Bebidas" }, {})).toMatchObject({ id: "p1", padrao: true });
    expect(pontoDoItem({ id: 1 }, undefined)).toMatchObject({ id: "p1", padrao: true });
  });

  it("chave herdada do prototype não é lida como rota (constructor/toString)", () => {
    expect(pontoDoItem({ id: "constructor" }, ctx).id).toBe("p1");
    expect(pontoDoItem({ category: "toString" }, ctx).id).toBe("p1");
  });

  it("categoria não-string (null, número) cai no padrão", () => {
    expect(pontoDoItem({ id: 3, category: null }, ctx).id).toBe("p1");
    expect(pontoDoItem({ id: 3, category: 5 }, ctx).id).toBe("p1");
  });

  // O cardápio guarda a categoria como o dono digitou; a rota foi gravada em
  // outro momento, com outra grafia. Comparar cru mandava o item pro padrão
  // calado — que é exatamente a falha que este achado corrigiu.
  it("acha a rota mesmo com acento, caixa e espaço diferentes entre o cardápio e o mapa", () => {
    const solto = { categorias: { "  BEBIDAS  ": "p2" }, produtos: {} };
    const comAcento = { categorias: { Refeições: "p2" }, produtos: {} };

    expect(pontoDoItem({ id: 3, category: "bebidas" }, { pontos: DOIS_PONTOS, roteamento: solto }).id).toBe("p2");
    expect(pontoDoItem({ id: 3, category: "refeicoes" }, { pontos: DOIS_PONTOS, roteamento: comAcento }).id).toBe("p2");
  });
});

describe("destinoDaCategoria", () => {
  it("acha a rota pela grafia canônica, não pela literal", () => {
    expect(destinoDaCategoria({ Bebidas: "p2" }, "bebidas")).toBe("p2");
    expect(destinoDaCategoria({ "  Refeições ": "p2" }, "REFEICOES")).toBe("p2");
  });

  it("categoria sem rota devolve null (a tela mostra o select vazio)", () => {
    expect(destinoDaCategoria({ Bebidas: "p2" }, "Sobremesas")).toBeNull();
    expect(destinoDaCategoria({}, "Bebidas")).toBeNull();
  });

  it("mapa ou categoria inválidos não lançam", () => {
    expect(destinoDaCategoria(undefined, "Bebidas")).toBeNull();
    expect(destinoDaCategoria(null, null)).toBeNull();
    expect(destinoDaCategoria({ Bebidas: "p2" }, "   ")).toBeNull();
  });

  it("chave herdada do prototype não vira rota", () => {
    expect(destinoDaCategoria({}, "constructor")).toBeNull();
    expect(destinoDaCategoria({}, "toString")).toBeNull();
  });
});

describe("definirRotaCategoria", () => {
  it("grava a rota da categoria sem tocar nas outras", () => {
    const saida = definirRotaCategoria({ Bebidas: "p2" }, "Lanches", "p1");

    expect(saida).toEqual({ Bebidas: "p2", Lanches: "p1" });
  });

  // Sem isto, renomear "Bebida" para "Bebidas" no cardápio deixaria as duas
  // chaves no mapa e a antiga ficaria órfã pra sempre.
  it("substitui a grafia antiga em vez de acumular uma chave nova", () => {
    const saida = definirRotaCategoria({ " bebidas ": "p1" }, "Bebidas", "p2");

    expect(saida).toEqual({ Bebidas: "p2" });
  });

  it("ponto vazio remove a rota", () => {
    expect(definirRotaCategoria({ Bebidas: "p2", Lanches: "p1" }, "Bebidas", "")).toEqual({ Lanches: "p1" });
    expect(definirRotaCategoria({ Bebidas: "p2" }, "bebidas", null)).toEqual({});
  });

  it("não muda o objeto recebido (o setState compara referência)", () => {
    const original = { Bebidas: "p2" };
    const saida = definirRotaCategoria(original, "Lanches", "p1");

    expect(original).toEqual({ Bebidas: "p2" });
    expect(saida).not.toBe(original);
  });

  it("entrada inválida não lança e devolve mapa utilizável", () => {
    expect(definirRotaCategoria(undefined, "Bebidas", "p2")).toEqual({ Bebidas: "p2" });
    expect(definirRotaCategoria(null, "  ", "p2")).toEqual({});
  });
});

describe("categoriasOrfas", () => {
  it("lista a rota gravada para categoria que sumiu do cardápio", () => {
    expect(categoriasOrfas({ Bebidas: "p2", Narguilé: "p1" }, ["Bebidas", "Lanches"])).toEqual(["Narguilé"]);
  });

  it("categoria viva com grafia diferente NÃO é órfã (senão o aviso mentiria)", () => {
    expect(categoriasOrfas({ " BEBIDAS ": "p2" }, ["Bebidas"])).toEqual([]);
  });

  it("devolve a chave como está gravada, para o aviso mostrar o que o dono vai remover", () => {
    expect(categoriasOrfas({ "  Narguilé  ": "p1" }, [])).toEqual(["  Narguilé  "]);
  });

  it("chave sem ponto de destino não conta como órfã", () => {
    expect(categoriasOrfas({ Narguilé: "" }, [])).toEqual([]);
  });

  it("sem rota nenhuma ou sem cardápio carregado não lança", () => {
    expect(categoriasOrfas({}, ["Bebidas"])).toEqual([]);
    expect(categoriasOrfas(undefined, undefined)).toEqual([]);
  });
});

describe("agruparItensPorPonto", () => {
  const roteamento = { categorias: { Bebidas: "p2" }, produtos: { 17: "p1" } };
  const ctx = { pontos: DOIS_PONTOS, roteamento };

  const itens = [
    { id: 1, nome: "X-Burguer", category: "Lanches" },
    { id: 3, nome: "Refrigerante", category: "Bebidas" },
    { id: 17, nome: "Chocolate quente", category: "Bebidas" },
    { id: 9, nome: "Pudim", category: "Sobremesas" },
  ];

  it("separa os itens por ponto, respeitando exceção por produto", () => {
    const grupos = agruparItensPorPonto(itens, ctx);

    expect(grupos.map((g) => g.ponto.id)).toEqual(["p1", "p2"]);
    expect(grupos[0].itens.map((i) => i.nome)).toEqual(["X-Burguer", "Chocolate quente", "Pudim"]);
    expect(grupos[1].itens.map((i) => i.nome)).toEqual(["Refrigerante"]);
  });

  it("cada item sai em exatamente um grupo (nada duplica, nada se perde)", () => {
    const grupos = agruparItensPorPonto(itens, ctx);
    const saida = grupos.flatMap((g) => g.itens);

    expect(saida).toHaveLength(itens.length);
    expect(new Set(saida.map((i) => i.id)).size).toBe(itens.length);
  });

  it("não devolve grupo vazio — ponto configurado que não recebeu nada não gasta papel", () => {
    const grupos = agruparItensPorPonto([{ id: 1, category: "Lanches" }], ctx);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].ponto.id).toBe("p1");
  });

  it("ordem estável: os grupos saem na ordem da lista de pontos, não na ordem dos itens", () => {
    const grupos = agruparItensPorPonto([{ id: 3, category: "Bebidas" }, { id: 1, category: "Lanches" }], ctx);

    expect(grupos.map((g) => g.ponto.id)).toEqual(["p1", "p2"]);
  });

  it("com um ponto só, devolve um grupo com todos os itens (comportamento de hoje)", () => {
    const grupos = agruparItensPorPonto(itens, { pontos: [COZINHA], roteamento });

    expect(grupos).toHaveLength(1);
    expect(grupos[0].itens).toHaveLength(itens.length);
  });

  it("sem itens devolve lista vazia (quem chama decide o que fazer)", () => {
    expect(agruparItensPorPonto([], ctx)).toEqual([]);
    expect(agruparItensPorPonto(undefined, ctx)).toEqual([]);
  });

  it("preserva as referências dos itens (obs, emoji e o resto do item vão intactos pro papel)", () => {
    const item = { id: 1, category: "Lanches", obs: ["sem cebola"] };

    expect(agruparItensPorPonto([item], ctx)[0].itens[0]).toBe(item);
  });

  it("devolve o ponto já normalizado, com a impressora que o despacho vai usar", () => {
    const grupos = agruparItensPorPonto(itens, ctx);

    expect(grupos[1].ponto).toEqual({ id: "p2", nome: "Bar", impressora: BAR.impressora, padrao: false });
  });
});
