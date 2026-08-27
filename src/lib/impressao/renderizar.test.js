import { describe, it, expect } from "vitest";
import { esc, logoUrlSegura, renderizarRecibo, renderizarViaProducao, renderizarComprovanteCaixa } from "./renderizar";

describe("esc", () => {
  it("escapa os metacaracteres de HTML", () => {
    expect(esc(`<img src=x onerror="alert('1')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;"
    );
  });

  it("aceita null/undefined/números sem lançar", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
    expect(esc(2)).toBe("2");
  });
});

describe("logoUrlSegura", () => {
  it("aceita http/https e data:image (X2 — allowlist de esquema do logo do tenant)", () => {
    expect(logoUrlSegura("https://cdn.exemplo.com/logo.png")).toBe(true);
    expect(logoUrlSegura("http://cdn.exemplo.com/logo.png")).toBe(true);
    expect(logoUrlSegura("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==")).toBe(true);
  });

  it("rejeita esquemas perigosos ou não-imagem", () => {
    expect(logoUrlSegura("javascript:alert(1)")).toBe(false);
    expect(logoUrlSegura("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(logoUrlSegura("")).toBe(false);
    expect(logoUrlSegura(null)).toBe(false);
    expect(logoUrlSegura(undefined)).toBe(false);
  });
});

describe("renderizarRecibo", () => {
  const dadosBase = {
    identidade: { nome: "GastroMundi", logoUrl: null, endereco: "", cnpj: "", rodape: "Obrigado pela preferência!" },
    comanda: "12",
    itens: [{ nome: "X-Burguer", qty: 2, preco: 30, emoji: "🍔", obs: [] }],
    subtotal: 60,
    valorTaxa: 0,
    ajuste: null,
    valorAjuste: 0,
    total: 60,
    pagamentos: [{ metodo: "dinheiro", valor: 60, recebido: 60, troco: 0 }],
    trocoTotal: 0,
  };

  it("inclui o nome do tenant (identidade) no cabeçalho", () => {
    const html = renderizarRecibo(dadosBase);

    expect(html).toContain("GastroMundi");
  });

  it("usa o logo em vez do nome em texto quando logoUrl está presente", () => {
    const html = renderizarRecibo({ ...dadosBase, identidade: { ...dadosBase.identidade, logoUrl: "https://cdn/logo.png" } });

    expect(html).toContain('src="https://cdn/logo.png"');
  });

  it("inclui os itens e o total", () => {
    const html = renderizarRecibo(dadosBase);

    expect(html).toContain("X-Burguer");
    expect(html).toContain("R$ 60.00");
  });

  it("inclui o aviso de não-fiscal só quando naoFiscal é true (cupom/pré-nota)", () => {
    const semAviso = renderizarRecibo(dadosBase);
    const comAviso = renderizarRecibo({ ...dadosBase, naoFiscal: true, avisoNaoFiscal: "Documento sem valor fiscal." });

    expect(semAviso).not.toContain("Documento sem valor fiscal");
    expect(comAviso).toContain("Documento sem valor fiscal");
  });

  it("nunca lança mesmo com dados incompletos", () => {
    expect(() => renderizarRecibo({ identidade: {}, itens: [], pagamentos: [] })).not.toThrow();
  });

  it("X2 — descarta logo com esquema perigoso e cai pro nome em texto", () => {
    const html = renderizarRecibo({
      ...dadosBase,
      identidade: { ...dadosBase.identidade, logoUrl: "javascript:alert(document.cookie)" },
    });

    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('class="cabecalho__nome b-centro b-gr b-negrito"');
    expect(html).toContain("GastroMundi");
  });

  // A largura fixa das colunas (que é o que impede o valor de sair fora
  // do papel de 58mm) está presa a esta classe — sem ela a tabela volta
  // à largura automática, e a tabela dos comprovantes de caixa não pode
  // herdar essas larguras.
  it("marca a lista de itens com a classe que ancora a largura das colunas", () => {
    const html = renderizarRecibo(dadosBase);

    expect(html).toContain('<table class="itens">');
  });

  it("escapa nome de produto e observação maliciosos (stored XSS na impressão)", () => {
    const html = renderizarRecibo({
      ...dadosBase,
      itens: [{ nome: `<img src=x onerror=alert(1)>`, qty: 1, preco: 10, emoji: "", obs: ["<script>fetch('/x')</script>"] }],
    });

    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("renderizarViaProducao", () => {
  it("inclui os itens produzíveis, sem preço no HTML", () => {
    const html = renderizarViaProducao({
      comanda: "7", mesa: "3", garcom: "joao", horario: "2026-07-21T12:00:00.000Z",
      itens: [{ nome: "X-Burguer", qty: 1, emoji: "🍔", obs: ["sem cebola"] }],
    });

    expect(html).toContain("X-Burguer");
    expect(html).toContain("sem cebola");
    expect(html).not.toContain("R$");
  });

  it("escapa observação maliciosa na via de produção", () => {
    const html = renderizarViaProducao({
      comanda: "7", horario: "2026-07-21T12:00:00.000Z",
      itens: [{ nome: "X", qty: 1, emoji: "", obs: ["<svg onload=alert(1)>"] }],
    });

    expect(html).not.toContain("<svg");
    expect(html).toContain("&lt;svg onload=alert(1)&gt;");
  });

  it("mostra mensagem clara quando não há itens produzíveis", () => {
    const html = renderizarViaProducao({ comanda: "7", horario: "2026-07-21T12:00:00.000Z", itens: [] });

    expect(html).toContain("Nenhum item produzível");
  });

  it("imprime o apelido (complemento) como linha própria quando presente", () => {
    const html = renderizarViaProducao({
      comanda: "7", apelido: "Mesa VIP", horario: "2026-07-21T12:00:00.000Z",
      itens: [{ nome: "X", qty: 1, emoji: "", obs: [] }],
    });

    expect(html).toContain("cabecalho__apelido");
    expect(html).toContain("Mesa VIP");
  });

  it("não renderiza a linha de apelido quando ele está ausente", () => {
    const html = renderizarViaProducao({
      comanda: "7", horario: "2026-07-21T12:00:00.000Z",
      itens: [{ nome: "X", qty: 1, emoji: "", obs: [] }],
    });

    expect(html).not.toContain("cabecalho__apelido");
  });

  it("escapa apelido malicioso na via de produção", () => {
    const html = renderizarViaProducao({
      comanda: "7", apelido: "<img src=x onerror=alert(1)>", horario: "2026-07-21T12:00:00.000Z",
      itens: [{ nome: "X", qty: 1, emoji: "", obs: [] }],
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("mostra o nome do ponto de impressão quando a via é de um ponto específico", () => {
    const html = renderizarViaProducao({
      comanda: "7", pontoNome: "Bar", horario: "2026-07-21T12:00:00.000Z",
      itens: [{ nome: "Caipirinha", qty: 1, emoji: "", obs: [] }],
    });

    expect(html).toContain('<div class="cabecalho__ponto">Bar</div>');
  });

  it("sem ponto informado, o cabeçalho fica igual ao de antes (um ponto só)", () => {
    const html = renderizarViaProducao({
      comanda: "7", horario: "2026-07-21T12:00:00.000Z",
      itens: [{ nome: "X", qty: 1, emoji: "", obs: [] }],
    });

    expect(html).not.toContain("cabecalho__ponto");
  });

  it("escapa nome de ponto malicioso (o nome é digitado na configuração)", () => {
    const html = renderizarViaProducao({
      comanda: "7", pontoNome: "<img src=x onerror=alert(1)>", horario: "2026-07-21T12:00:00.000Z",
      itens: [{ nome: "X", qty: 1, emoji: "", obs: [] }],
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("renderizarComprovanteCaixa", () => {
  const dadosCaixa = {
    identidade: { nome: "GastroMundi", logoUrl: null, endereco: "Rua A, 10", cnpj: "00.000.000/0001-00", rodape: "Confira antes de assinar" },
    titulo: "SANGRIA",
    emitidoEm: "2026-07-21T12:00:00.000Z",
    destaque: { rotulo: "Valor retirado", valor: 50 },
    linhas: [{ rotulo: "Saldo depois", valor: 200, forte: true }],
    notas: [{ rotulo: "Motivo", texto: "Troco do turno" }],
  };

  // Sangria, suprimento e fechamento não passam pelo editor de blocos, e
  // por isso não podem reusar as classes da comanda: quando os blocos
  // chegaram, as `.cabecalho*` largaram alinhamento e tamanho (lá quem
  // manda é o dono), e esses papéis passaram a sair com o nome do
  // estabelecimento encostado à esquerda, em corpo de texto normal.
  it("usa o cabeçalho próprio do caixa, não as classes da comanda", () => {
    const html = renderizarComprovanteCaixa(dadosCaixa);

    expect(html).toContain('class="caixa-cabecalho"');
    expect(html).toContain('class="caixa-cabecalho__nome"');
    expect(html).toContain('class="caixa-cabecalho__linha"');
    expect(html).toContain('class="caixa-identidade"');
    expect(html).toContain('class="caixa-rodape"');
    // Com `class="…"` porque o CSS vai inteiro dentro do HTML: procurar
    // só o nome da classe casaria com a folha de estilo, não com a marcação.
    expect(html).not.toContain('class="cabecalho"');
    expect(html).not.toContain('class="cabecalho__nome"');
    expect(html).not.toContain('class="identidade-fiscal"');
  });

  // Decisão 018: o alinhamento do título mora no CSS, não num `style=`
  // no meio do template.
  it("não carrega estilo inline no título", () => {
    const html = renderizarComprovanteCaixa(dadosCaixa);

    expect(html).toContain('<div class="caixa-cabecalho__titulo">SANGRIA</div>');
    expect(html).not.toContain("style=\"text-align:center;font-weight:bold;\"");
  });

  it("usa o logo do caixa quando a identidade tem imagem válida", () => {
    const html = renderizarComprovanteCaixa({
      ...dadosCaixa,
      identidade: { ...dadosCaixa.identidade, logoUrl: "https://cdn.exemplo.com/logo.png" },
    });

    expect(html).toContain('class="caixa-cabecalho__logo"');
    expect(html).not.toContain('class="caixa-cabecalho__nome"');
  });

  it("nunca lança com dados incompletos", () => {
    expect(() => renderizarComprovanteCaixa({ identidade: {}, titulo: "FECHAMENTO" })).not.toThrow();
  });
});
