import { describe, it, expect } from "vitest";
import {
  LAYOUT_COMANDA_PADRAO,
  TIPOS_BLOCO,
  MAX_TEXTO_BLOCO,
  normalizarLayoutComanda,
  layoutComandaDeConfig,
  configLegadoDeLayout,
  blocoNovo,
  completarLayoutComanda,
  resolverBlocosComanda,
  COLUNAS_ITENS,
  LARGURAS_ITENS_PADRAO,
  MIN_LARGURA_COLUNA,
  normalizarLargurasItens,
  largurasVisiveis,
  largurasEmCaracteres,
} from "./layoutComanda";
import { renderizarRecibo } from "./renderizar";
import { formatarComprovanteEscpos } from "./escposFormatador";
import { colunasEscpos } from "./largura";

const COLUNAS = colunasEscpos(80);

function venda(overrides = {}) {
  return {
    identidade: {
      nome: "Restaurante Exemplo",
      logoUrl: null,
      endereco: "Rua das Flores, 10",
      cnpj: "12.345.678/0001-90",
      rodape: "Obrigado pela preferência!",
    },
    comanda: "12",
    itens: [{ nome: "Prato do dia", qty: 2, preco: 30, emoji: "🍽️", obs: ["sem cebola"] }],
    subtotal: 60,
    valorTaxa: 6,
    ajuste: null,
    valorAjuste: 0,
    total: 66,
    pagamentos: [{ metodo: "pix", valor: 66, troco: 0 }],
    trocoTotal: 0,
    agora: new Date("2026-08-24T15:30:00Z"),
    ...overrides,
  };
}

// As duas saídas de verdade: o HTML que o navegador imprime e o texto
// que a Ponte manda pra térmica. Todo teste de layout confere as duas —
// é o que garante que a pré-visualização não minta pra quem usa térmica.
const papel = (dados) => renderizarRecibo(dados);
const termica = (dados) => formatarComprovanteEscpos(dados, COLUNAS).join("\n");

describe("normalizarLayoutComanda", () => {
  it("descarta tipo de bloco que não existe (JSON livre do banco)", () => {
    const blocos = normalizarLayoutComanda([{ tipo: "total" }, { tipo: "banner_animado" }]);

    expect(blocos.map((b) => b.tipo)).toEqual(["total"]);
  });

  it("mantém só a primeira ocorrência de um bloco único, e repete os repetíveis", () => {
    const blocos = normalizarLayoutComanda([
      { tipo: "total" }, { tipo: "total" },
      { tipo: "texto", texto: "um" }, { tipo: "texto", texto: "dois" },
    ]);

    expect(blocos.map((b) => b.tipo)).toEqual(["total", "texto", "texto"]);
    expect(blocos.map((b) => b.id)).toEqual(["total", "texto-1", "texto-2"]);
  });

  it("corta texto gigante — em 32 colunas ele viraria um bloco ilegível", () => {
    const [bloco] = normalizarLayoutComanda([{ tipo: "texto", texto: "a".repeat(5000) }]);

    expect(bloco.texto).toHaveLength(MAX_TEXTO_BLOCO);
  });

  it("recusa valor fora da lista em alinhamento e tamanho", () => {
    const [bloco] = normalizarLayoutComanda([{ tipo: "nome", alinhamento: "diagonal", tamanho: "gigante" }]);

    expect(bloco.alinhamento).toBe("centro");
    expect(bloco.tamanho).toBe("normal");
  });

  it("não grava propriedade que o tipo não aceita (separador não tem alinhamento)", () => {
    const [bloco] = normalizarLayoutComanda([{ tipo: "separador", alinhamento: "direita", texto: "x" }]);

    expect(bloco).not.toHaveProperty("alinhamento");
    expect(bloco).not.toHaveProperty("texto");
  });

  it("devolve lista vazia quando não há nada utilizável", () => {
    expect(normalizarLayoutComanda(null)).toEqual([]);
    expect(normalizarLayoutComanda("layout")).toEqual([]);
    expect(normalizarLayoutComanda([{ tipo: "nada" }])).toEqual([]);
  });
});

describe("layoutComandaDeConfig — quem nunca abriu o editor não perde nada", () => {
  it("semeia o padrão com o endereço, CNPJ e rodapé já configurados", () => {
    const blocos = layoutComandaDeConfig({
      mostrarEnderecoCnpj: true,
      endereco: "Av. Central, 500",
      cnpj: "11.222.333/0001-44",
      rodapePersonalizado: "Volte sempre!",
    });

    const acha = (tipo) => blocos.find((b) => b.tipo === tipo);
    expect(acha("endereco")).toMatchObject({ visivel: true, texto: "Av. Central, 500" });
    expect(acha("cnpj")).toMatchObject({ visivel: true, texto: "11.222.333/0001-44" });
    expect(acha("rodape").texto).toBe("Volte sempre!");
  });

  it("respeita quem tinha o endereço desligado e o logo escondido", () => {
    const blocos = layoutComandaDeConfig({ mostrarEnderecoCnpj: false, mostrarLogo: false });

    expect(blocos.find((b) => b.tipo === "endereco").visivel).toBe(false);
    expect(blocos.find((b) => b.tipo === "logo").visivel).toBe(false);
  });

  it("layout já editado vence os campos antigos", () => {
    const blocos = layoutComandaDeConfig({
      rodapePersonalizado: "antigo",
      layoutComanda: [{ tipo: "rodape", texto: "novo" }],
    });

    expect(blocos).toHaveLength(1);
    expect(blocos[0].texto).toBe("novo");
  });
});

describe("configLegadoDeLayout — espelho dos campos antigos", () => {
  it("desligar o bloco de endereço desliga também a flag que a identidade lê", () => {
    const blocos = layoutComandaDeConfig({ mostrarEnderecoCnpj: true, endereco: "Rua X" })
      .map((b) => (b.tipo === "endereco" || b.tipo === "cnpj" ? { ...b, visivel: false } : b));

    expect(configLegadoDeLayout(blocos).mostrarEnderecoCnpj).toBe(false);
  });

  it("leva texto e visibilidade dos blocos para os campos antigos", () => {
    const blocos = normalizarLayoutComanda([
      { tipo: "logo", visivel: false },
      { tipo: "endereco", visivel: true, texto: "Rua Y, 9" },
      { tipo: "rodape", texto: "Até logo" },
    ]);

    expect(configLegadoDeLayout(blocos)).toEqual({
      mostrarLogo: false,
      mostrarEnderecoCnpj: true,
      endereco: "Rua Y, 9",
      cnpj: "",
      rodapePersonalizado: "Até logo",
    });
  });
});

describe("completarLayoutComanda — a lista do editor mostra tudo que a comanda pode ter", () => {
  it("traz de volta, desligados, os blocos que faltavam no layout gravado", () => {
    const completo = completarLayoutComanda([{ tipo: "nome" }, { tipo: "total" }]);

    const endereco = completo.find((b) => b.tipo === "endereco");
    expect(endereco).toBeDefined();
    expect(endereco.visivel).toBe(false);
    expect(completo.find((b) => b.tipo === "nome").visivel).toBe(true);
  });

  it("não mexe na ordem nem na visibilidade do que já estava lá", () => {
    const completo = completarLayoutComanda([{ tipo: "rodape", texto: "Tchau" }, { tipo: "nome" }]);

    expect(completo.slice(0, 2).map((b) => b.tipo)).toEqual(["rodape", "nome"]);
    expect(completo[0].texto).toBe("Tchau");
  });

  it("o que sai impresso continua sendo só o que está ligado", () => {
    const completo = completarLayoutComanda([{ tipo: "nome" }]);

    expect(resolverBlocosComanda(completo, venda()).map((b) => b.tipo)).toEqual(["texto"]);
  });
});

describe("blocoNovo", () => {
  it("recusa duplicar bloco único e aceita repetir os repetíveis", () => {
    const existentes = [{ id: "total", tipo: "total" }, { id: "texto-1", tipo: "texto" }];

    expect(blocoNovo("total", existentes)).toBeNull();
    expect(blocoNovo("texto", existentes)).toMatchObject({ tipo: "texto" });
  });

  it("nunca repete id (a lista usa id como chave e é ele que a reordenação move)", () => {
    const existentes = [{ id: "texto", tipo: "texto" }, { id: "texto-1", tipo: "texto" }];

    expect(blocoNovo("texto", existentes).id).toBe("texto-2");
  });

  it("recusa tipo inexistente", () => {
    expect(blocoNovo("carrossel", [])).toBeNull();
  });
});

describe("o layout manda nas DUAS impressões (navegador e térmica)", () => {
  it("padrão de fábrica imprime identidade, itens, total e rodapé", () => {
    const dados = { ...venda(), layout: LAYOUT_COMANDA_PADRAO };

    for (const saida of [papel(dados), termica(dados)]) {
      expect(saida).toContain("Restaurante Exemplo");
      expect(saida).toContain("Prato do dia");
      expect(saida).toContain("R$ 66.00");
      expect(saida).toContain("Obrigado pela preferência!");
    }
  });

  it("esconder um bloco tira ele do papel e da térmica juntos", () => {
    const layout = LAYOUT_COMANDA_PADRAO.map((b) => (b.tipo === "rodape" ? { ...b, visivel: false } : b));
    const dados = { ...venda(), layout: normalizarLayoutComanda(layout) };

    expect(papel(dados)).not.toContain("Obrigado pela preferência!");
    expect(termica(dados)).not.toContain("Obrigado pela preferência!");
  });

  it("mudar a ordem muda a ordem impressa nos dois", () => {
    const layout = normalizarLayoutComanda([
      { tipo: "rodape", texto: "Primeiro de tudo" },
      { tipo: "nome" },
      { tipo: "itens" },
      { tipo: "total" },
    ]);
    const dados = { ...venda(), layout };

    const html = papel(dados);
    expect(html.indexOf("Primeiro de tudo")).toBeLessThan(html.indexOf("Restaurante Exemplo"));

    const texto = termica(dados);
    expect(texto.indexOf("Primeiro de tudo")).toBeLessThan(texto.indexOf("Restaurante Exemplo"));
  });

  it("texto livre sai nas duas saídas, inclusive em mais de uma linha", () => {
    const layout = normalizarLayoutComanda([
      { tipo: "total" },
      { tipo: "texto", texto: "Wi-fi: gastro2026\nInstagram: @exemplo" },
    ]);
    const dados = { ...venda(), layout };

    for (const saida of [papel(dados), termica(dados)]) {
      expect(saida).toContain("Wi-fi: gastro2026");
      expect(saida).toContain("Instagram: @exemplo");
    }
  });

  it("MAIÚSCULAS valem para os dois", () => {
    const layout = normalizarLayoutComanda([{ tipo: "nome", maiuscula: true }]);
    const dados = { ...venda(), layout };

    expect(papel(dados)).toContain("RESTAURANTE EXEMPLO");
    expect(termica(dados)).toContain("RESTAURANTE EXEMPLO");
  });

  it("desligar observações do item tira o 'sem cebola' dos dois", () => {
    const layout = normalizarLayoutComanda([
      { tipo: "itens", opcoes: { unitario: true, observacoes: false, emoji: true } },
    ]);
    const dados = { ...venda(), layout };

    expect(papel(dados)).not.toContain("sem cebola");
    expect(termica(dados)).not.toContain("sem cebola");
  });

  it("desligar o preço unitário tira a coluna do papel do navegador", () => {
    const comUnitario = normalizarLayoutComanda([{ tipo: "itens" }]);
    const semUnitario = normalizarLayoutComanda([
      { tipo: "itens", opcoes: { unitario: false, observacoes: true, emoji: true } },
    ]);

    expect(papel({ ...venda(), layout: comUnitario })).toContain("Unit.");
    expect(papel({ ...venda(), layout: semUnitario })).not.toContain("Unit.");
  });

  it("alinhamento à direita empurra o texto na térmica", () => {
    const layout = normalizarLayoutComanda([{ tipo: "nome", alinhamento: "direita" }]);
    const linhas = formatarComprovanteEscpos({ ...venda(), layout }, COLUNAS);

    expect(linhas[0]).toMatch(/^\s+Restaurante Exemplo$/);
    expect(linhas[0]).toHaveLength(COLUNAS);
  });

  it("nenhuma linha da térmica passa da largura do papel, com layout customizado", () => {
    const layout = normalizarLayoutComanda([
      { tipo: "texto", texto: "Uma mensagem bem comprida que não cabe de jeito nenhum numa linha só de papel térmico", alinhamento: "centro" },
      { tipo: "itens" },
      { tipo: "total" },
    ]);
    const linhas = formatarComprovanteEscpos({ ...venda(), layout }, colunasEscpos(58));

    for (const linha of linhas) expect(linha.length).toBeLessThanOrEqual(colunasEscpos(58));
  });
});

describe("o que nunca sai no papel", () => {
  it("logo com esquema perigoso é descartado (XSS na janela de impressão)", () => {
    const dados = {
      ...venda({ identidade: { ...venda().identidade, logoUrl: "javascript:alert(1)" } }),
      layout: normalizarLayoutComanda([{ tipo: "logo" }, { tipo: "nome" }]),
    };

    expect(papel(dados)).not.toContain("javascript:");
    expect(papel(dados)).not.toContain("<img");
  });

  it("texto digitado pelo dono nunca vira HTML", () => {
    const layout = normalizarLayoutComanda([{ tipo: "texto", texto: "<img src=x onerror=alert(1)>" }]);

    const html = papel({ ...venda(), layout });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("bloco de valor que não se aplica àquela venda não é impresso", () => {
    const dados = {
      ...venda({ valorTaxa: 0, trocoTotal: 0, valorAjuste: 0 }),
      layout: LAYOUT_COMANDA_PADRAO,
    };

    expect(termica(dados)).not.toContain("Taxa de Serviço");
    expect(termica(dados)).not.toContain("Troco");
    expect(termica(dados)).not.toContain("Subtotal");
  });

  it("aviso de não fiscal só sai na conta do cliente", () => {
    const dados = { ...venda(), layout: LAYOUT_COMANDA_PADRAO };
    const comAviso = { ...dados, naoFiscal: true, avisoNaoFiscal: "Documento sem valor fiscal." };

    expect(termica(dados)).not.toContain("sem valor fiscal");
    expect(termica(comAviso)).toContain("sem valor fiscal");
  });

  it("texto em branco não deixa linha vazia no papel", () => {
    const layout = normalizarLayoutComanda([{ tipo: "nome" }, { tipo: "texto", texto: "   " }]);

    expect(formatarComprovanteEscpos({ ...venda(), layout }, COLUNAS)).toHaveLength(1);
  });
});

describe("divisórias não sobram no papel", () => {
  it("divisória sozinha no começo ou no fim não é impressa", () => {
    const layout = normalizarLayoutComanda([
      { tipo: "separador" }, { tipo: "total" }, { tipo: "separador" },
    ]);

    expect(resolverBlocosComanda(layout, venda()).map((b) => b.tipo)).toEqual(["valor"]);
  });

  it("esconder o bloco do meio não deixa duas divisórias coladas", () => {
    const layout = normalizarLayoutComanda([
      { tipo: "nome" },
      { tipo: "separador" },
      { tipo: "rodape", visivel: false, texto: "escondido" },
      { tipo: "separador" },
      { tipo: "total" },
    ]);

    expect(resolverBlocosComanda(layout, venda()).map((b) => b.tipo)).toEqual(["texto", "separador", "valor"]);
  });
});

const soma = (obj) => Object.values(obj).reduce((t, n) => t + n, 0);

describe("largura das colunas da lista de itens", () => {
  it("normaliza qualquer lixo do banco para larguras que somam 100", () => {
    for (const bruto of [null, undefined, {}, { nome: "x" }, { nome: -5, qtd: 0 }, { nome: 900 }]) {
      const l = normalizarLargurasItens(bruto);
      expect(Object.keys(l), JSON.stringify(bruto)).toEqual(COLUNAS_ITENS);
      expect(soma(l), JSON.stringify(bruto)).toBeCloseTo(100, 1);
    }
  });

  it("mantém a proporção que o dono arrastou", () => {
    const l = normalizarLargurasItens({ nome: 50, qtd: 10, unitario: 20, total: 20 });

    expect(l.nome).toBeGreaterThan(l.unitario);
    expect(soma(l)).toBeCloseTo(100, 1);
  });

  it("nenhuma coluna fica abaixo do próprio piso, nem quando o valor gravado é zero", () => {
    const l = normalizarLargurasItens({ nome: 97, qtd: 1, unitario: 1, total: 1 });

    for (const coluna of COLUNAS_ITENS) {
      expect(l[coluna], `piso de ${coluna}`).toBeGreaterThanOrEqual(MIN_LARGURA_COLUNA[coluna]);
    }
    expect(soma(l)).toBeCloseTo(100, 1);
  });

  it("sem preço unitário sobram três colunas e o espaço dele é redistribuído", () => {
    const visiveis = largurasVisiveis(LARGURAS_ITENS_PADRAO, false);

    expect(Object.keys(visiveis)).toEqual(["nome", "qtd", "total"]);
    expect(soma(visiveis)).toBeCloseTo(100, 1);
    expect(visiveis.nome).toBeGreaterThan(LARGURAS_ITENS_PADRAO.nome);
  });

  // Ida e volta: o editor mostra a projeção de 3 colunas, grava o objeto
  // de 4 e projeta de novo. Se a proporção mudasse no caminho, a barra
  // saltaria sozinha depois de salvar.
  it("a proporção entre as colunas visíveis sobrevive à ida e volta pelo banco", () => {
    const editado = { nome: 55, qtd: 10, total: 35 };
    const gravado = normalizarLargurasItens({ ...LARGURAS_ITENS_PADRAO, ...editado });

    const devolta = largurasVisiveis(gravado, false);

    expect(devolta.nome).toBeCloseTo(editado.nome, 0);
    expect(devolta.qtd).toBeCloseTo(editado.qtd, 0);
    expect(devolta.total).toBeCloseTo(editado.total, 0);
  });
});

describe("largurasEmCaracteres (a mesma proporção, na régua da térmica)", () => {
  const itensCurtos = [
    { nome: "Coca lata", qty: 2, unitario: "R$ 6.00", total: "R$ 12.00", obs: [] },
    { nome: "Pastel", qty: 1, unitario: "R$ 8.50", total: "R$ 8.50", obs: [] },
  ];

  it("em 48 colunas com nomes curtos, devolve colunas que somam o papel inteiro", () => {
    const larg = largurasEmCaracteres(itensCurtos, 48, LARGURAS_ITENS_PADRAO, true);

    expect(larg).not.toBeNull();
    expect(larg.nome + larg.qtd + larg.unitario + larg.total).toBe(48);
  });

  // Cortar "R$ 32.50" em "R$ 32" imprimiria um valor ERRADO no papel do
  // cliente — a coluna cresce além da proporção pedida antes disso.
  it("coluna de valor nunca fica menor que o valor que precisa mostrar", () => {
    const caros = [{ nome: "Prato", qty: 1, unitario: "R$ 1234.50", total: "R$ 1234.50", obs: [] }];

    const larg = largurasEmCaracteres(caros, 48, { nome: 80, qtd: 7, unitario: 14, total: 16 }, true);

    expect(larg.total).toBeGreaterThanOrEqual("R$ 1234.50".length);
    expect(larg.unitario).toBeGreaterThanOrEqual("R$ 1234.50".length);
  });

  // É o que preserva o ganho das 48 colunas: nome comprido continua
  // usando a linha toda em vez de ser espremido numa coluna estreita.
  it("desiste das colunas quando o nome não cabe inteiro", () => {
    const compridos = [
      { nome: "Filé à parmegiana com fritas e arroz", qty: 1, unitario: "R$ 62.00", total: "R$ 62.00", obs: [] },
    ];

    expect(largurasEmCaracteres(compridos, 48, LARGURAS_ITENS_PADRAO, true)).toBeNull();
  });

  // Em 58mm (32 colunas) sobram 12 caracteres para o nome com as quatro
  // colunas ligadas: nome curtinho passa, o resto cai no empilhado.
  it("no papel de 58mm as quatro colunas só servem a nome bem curto", () => {
    expect(largurasEmCaracteres(itensCurtos, 32, LARGURAS_ITENS_PADRAO, true)).not.toBeNull();

    const medio = [{ nome: "Suco de laranja", qty: 1, unitario: "R$ 9.00", total: "R$ 9.00", obs: [] }];
    expect(largurasEmCaracteres(medio, 32, LARGURAS_ITENS_PADRAO, true)).toBeNull();
  });

  it("sem lista de itens não inventa coluna", () => {
    expect(largurasEmCaracteres([], 48, LARGURAS_ITENS_PADRAO, true)).not.toBeNull();
    expect(() => largurasEmCaracteres(null, 48, null, false)).not.toThrow();
  });
});

describe("catálogo de blocos", () => {
  it("todo bloco do padrão de fábrica existe no catálogo", () => {
    for (const bloco of LAYOUT_COMANDA_PADRAO) {
      expect(TIPOS_BLOCO[bloco.tipo], `tipo ${bloco.tipo}`).toBeDefined();
    }
  });

  it("todo tipo do catálogo tem rótulo em português para a tela", () => {
    for (const [tipo, meta] of Object.entries(TIPOS_BLOCO)) {
      expect(meta.rotulo, `rótulo de ${tipo}`).toBeTruthy();
      expect(meta.ajuda, `ajuda de ${tipo}`).toBeTruthy();
    }
  });
});
