// Testes do cliente da Ponte KORA (Leva 13) — fetch mockado.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PONTE_URL,
  pingPonte,
  buscarInfoPonte,
  enviarSnapshotPonte,
  buscarPedidosPonte,
  confirmarPedidosPonte,
  montarEnderecoPalm,
  listarImpressorasPonte,
  enviarImpressaoPonte,
  buscarFilaImpressaoPonte,
} from "./ponte.js";
import { imprimir as imprimirPelaPonte } from "./impressao/drivers/escposPonte.js";

const respostaJson = (corpo, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(corpo),
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pingPonte", () => {
  it("devolve os dados de /saude quando a ponte responde", async () => {
    fetch.mockResolvedValue(respostaJson({ ok: true, nome: "KORA Ponte", pendentes: 0 }));
    const { data, error } = await pingPonte();
    expect(error).toBeNull();
    expect(data.nome).toBe("KORA Ponte");
    expect(fetch.mock.calls[0][0]).toBe(`${PONTE_URL}/saude`);
  });

  it("devolve error (sem lançar) quando a ponte não está rodando", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const { data, error } = await pingPonte();
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});

describe("buscarInfoPonte", () => {
  it("chama GET /info", async () => {
    fetch.mockResolvedValue(respostaJson({ token: "abc", enderecos: ["192.168.0.2"], porta: 8123 }));
    const { data, error } = await buscarInfoPonte();
    expect(error).toBeNull();
    expect(data.token).toBe("abc");
    expect(fetch.mock.calls[0][0]).toBe(`${PONTE_URL}/info`);
  });
});

describe("enviarSnapshotPonte", () => {
  it("faz POST com o corpo em JSON", async () => {
    fetch.mockResolvedValue(respostaJson({ ok: true }));
    const { error } = await enviarSnapshotPonte({ products: [{ id: 1 }] });
    expect(error).toBeNull();
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${PONTE_URL}/snapshot`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ products: [{ id: 1 }] });
  });
});

describe("buscarPedidosPonte / confirmarPedidosPonte", () => {
  it("busca pedidos pendentes", async () => {
    fetch.mockResolvedValue(respostaJson({ pedidos: [{ id: "p1" }] }));
    const { data } = await buscarPedidosPonte();
    expect(data.pedidos).toHaveLength(1);
  });

  it("confirma enviando { ids }", async () => {
    fetch.mockResolvedValue(respostaJson({ ok: true, confirmados: 2 }));
    const { data } = await confirmarPedidosPonte(["a", "b"]);
    expect(data.confirmados).toBe(2);
    const [, opts] = fetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ ids: ["a", "b"] });
  });

  it("propaga o erro amigável do servidor em status não-2xx", async () => {
    fetch.mockResolvedValue(respostaJson({ erro: "snapshot inválido" }, { status: 400 }));
    const { data, error } = await enviarSnapshotPonte(null);
    expect(data).toBeNull();
    expect(error.message).toBe("snapshot inválido");
  });
});

describe("impressão pela Ponte", () => {
  it("lista as impressoras do PC (GET /impressoras)", async () => {
    fetch.mockResolvedValue(respostaJson({ impressoras: [{ nome: "EPSON TM-T20", padrao: true }] }));

    const { data, error } = await listarImpressorasPonte();

    expect(error).toBeNull();
    expect(data.impressoras[0].nome).toBe("EPSON TM-T20");
    expect(fetch.mock.calls[0][0]).toBe(`${PONTE_URL}/impressoras`);
  });

  it("envia o trabalho de impressão (POST /imprimir) com destino e linhas", async () => {
    fetch.mockResolvedValue(respostaJson({ id: "a1b2", estado: "na_fila" }, { status: 202 }));
    const trabalho = {
      destino: { tipo: "windows", nome: "EPSON TM-T20" },
      linhas: ["Comanda 12", "1x X-Burguer"],
      cortaPapel: true,
      copias: 1,
    };

    const { data, error } = await enviarImpressaoPonte(trabalho);

    expect(error).toBeNull();
    expect(data).toEqual({ id: "a1b2", estado: "na_fila" });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${PONTE_URL}/imprimir`);
    expect(opts.method).toBe("POST");
    // O `id` acompanha o trabalho: é por ele que a Ponte reconhece reenvio.
    expect(JSON.parse(opts.body)).toEqual({ ...trabalho, id: expect.any(String) });
  });

  it("lê a fila de impressão (GET /impressao)", async () => {
    fetch.mockResolvedValue(respostaJson({ trabalhos: [{ id: "a1b2" }], pendentes: 1 }));

    const { data } = await buscarFilaImpressaoPonte();

    expect(data.pendentes).toBe(1);
    expect(fetch.mock.calls[0][0]).toBe(`${PONTE_URL}/impressao`);
  });

  it("Ponte fechada vira instrução do que fazer, não erro técnico de rede", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));

    const { data, error } = await enviarImpressaoPonte({ destino: {}, linhas: [] });

    expect(data).toBeNull();
    expect(error.message).toContain("Ponte KORA não está rodando");
    expect(error.message).not.toMatch(/fetch|TypeError/i);
    // A tela ramifica por esta marca, não pela mensagem: a mensagem daqui é
    // em português e nenhum farejo de "failed to fetch" acertaria nela.
    expect(error.foraDoAr).toBe(true);
  });

  it("timeout (AbortError) também vira a mesma instrução", async () => {
    const abortado = new Error("aborted");
    abortado.name = "AbortError";
    fetch.mockRejectedValue(abortado);

    const { error } = await listarImpressorasPonte();

    expect(error.message).toContain("Ponte KORA não está rodando");
    expect(error.foraDoAr).toBe(true);
  });

  it("erro que a própria Ponte explicou passa direto (já está em português)", async () => {
    fetch.mockResolvedValue(respostaJson({ erro: "destino de impressão inválido" }, { status: 400 }));

    const { error } = await enviarImpressaoPonte({ destino: null, linhas: [] });

    expect(error.message).toBe("destino de impressão inválido");
  });

  it("erro da própria Ponte NÃO é marcado como fora do ar", async () => {
    // Ponte de pé respondendo 500: a tela tem que mostrar erro vermelho com
    // o texto dela, não a orientação amarela de "abra o KoraPonte.exe".
    fetch.mockResolvedValue(respostaJson({ erro: "spooler do Windows não respondeu" }, { status: 500 }));

    const { error } = await listarImpressorasPonte();

    expect(error.message).toBe("spooler do Windows não respondeu");
    expect(error.foraDoAr).toBeUndefined();
  });
});

// A impressora ocupada demora mais que o prazo do fetch, o app mostra erro e o
// operador clica de novo. Sem identificação, os dois trabalhos entram na fila e
// a cozinha recebe a mesma comanda duas vezes — o que vira prato em dobro.
describe("impressão que não pode sair duas vezes", () => {
  const idEnviado = (indice) => JSON.parse(fetch.mock.calls[indice][1].body).id;

  /** Trabalho com conteúdo próprio por teste (a memória de reenvio é do módulo). */
  const trabalho = (marca) => ({
    destino: { tipo: "windows", nome: "EPSON TM-T20" },
    linhas: [`Comanda ${marca}`, "1x X-Burguer"],
    cortaPapel: true,
    copias: 1,
  });

  it("todo trabalho sai identificado, e trabalhos diferentes nunca dividem o mesmo id", async () => {
    fetch.mockResolvedValue(respostaJson({ id: "fila-1", estado: "na_fila" }, { status: 202 }));

    await enviarImpressaoPonte(trabalho("31"));
    await enviarImpressaoPonte(trabalho("32"));

    expect(idEnviado(0)).toEqual(expect.any(String));
    // A Ponte só honra `id` com 8 caracteres ou mais (ponte/servidor.js):
    // id mais curto que isso desligaria a proteção em silêncio.
    expect(idEnviado(0).length).toBeGreaterThanOrEqual(8);
    expect(idEnviado(1)).not.toBe(idEnviado(0));
  });

  it("clicar de novo depois do erro repete o MESMO id — a Ponte reconhece e não imprime duas vezes", async () => {
    const demorou = new Error("aborted");
    demorou.name = "AbortError";
    fetch.mockRejectedValueOnce(demorou);
    fetch.mockResolvedValueOnce(respostaJson({ ok: true, id: "qualquer", duplicado: true }));
    fetch.mockResolvedValueOnce(respostaJson({ id: "fila-4", estado: "na_fila" }, { status: 202 }));

    const primeira = await enviarImpressaoPonte(trabalho("41"));
    expect(primeira.error.foraDoAr).toBe(true); // o operador viu erro na tela

    const segunda = await enviarImpressaoPonte(trabalho("41"));

    expect(idEnviado(1)).toBe(idEnviado(0));
    // Trabalho já conhecido pela Ponte é a proteção funcionando, não falha:
    // a tela mostra sucesso e ninguém tenta uma terceira vez.
    expect(segunda.error).toBeNull();
    expect(segunda.data.duplicado).toBe(true);

    // A tentativa TERMINOU no envio que deu certo, e a memória tem que ser
    // apagada ali mesmo. Se ela sobrevivesse ao sucesso, o id ficaria
    // grudado neste trabalho até a janela vencer e toda impressão pedida
    // nesse meio-tempo voltaria como "duplicada": a comanda nunca mais sai.
    await enviarImpressaoPonte(trabalho("41"));
    expect(idEnviado(2)).not.toBe(idEnviado(1));
  });

  it("depois que a impressão dá certo, pedir a mesma de novo é impressão NOVA (a reimpressão da Cozinha sai no papel)", async () => {
    fetch.mockResolvedValue(respostaJson({ id: "fila-2", estado: "na_fila" }, { status: 202 }));

    await enviarImpressaoPonte(trabalho("51"));
    await enviarImpressaoPonte(trabalho("51"));

    // Mesmo texto, papel novo: a via de produção de uma comanda é idêntica
    // toda vez, e quem apertou "imprimir" na Cozinha quer o papel na mão.
    expect(idEnviado(1)).not.toBe(idEnviado(0));
  });

  it("reimpressão que o operador pediu DEPOIS de ler o aviso é impressão nova, não duplicata", async () => {
    // A cadeia que a janela longa criava: o envio estourou o prazo do fetch
    // mas chegou na Ponte; lá o papel estava preso e o trabalho FALHOU; o
    // aviso da tela mandou reimprimir pela Cozinha; a via reimpressa é
    // idêntica letra por letra, então a assinatura batia e o mesmo id
    // voltava — a Ponte respondia "duplicado", a tela dizia que deu certo e
    // o papel nunca saía. Vinte segundos é menos do que qualquer pessoa leva
    // para ler um aviso e ir clicar, e a janela de reenvio já venceu.
    const relogio = vi.spyOn(Date, "now");
    try {
      relogio.mockReturnValue(1_000_000);
      fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await enviarImpressaoPonte(trabalho("61"));

      relogio.mockReturnValue(1_000_000 + 20 * 1000);
      fetch.mockResolvedValueOnce(respostaJson({ id: "fila-3", estado: "na_fila" }, { status: 202 }));
      await enviarImpressaoPonte(trabalho("61"));

      expect(idEnviado(1)).not.toBe(idEnviado(0));
    } finally {
      relogio.mockRestore();
    }
  });

  it("duas abas do PDV no mesmo milissegundo não geram o mesmo id", async () => {
    // Dois PDVs abertos no mesmo PC é rotina no caixa. Cada aba começa a
    // sequência em 1; sem a marca sorteada por aba, a primeira impressão de
    // cada uma sairia com o id idêntico e a Ponte engoliria uma comanda
    // legítima como duplicata.
    const relogio = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const sorteios = [0.111111, 0.987654];
    const sorteio = vi.spyOn(Math, "random").mockImplementation(() => sorteios.shift() ?? 0.5);
    try {
      vi.resetModules();
      const abaA = await import("./ponte.js");
      vi.resetModules();
      const abaB = await import("./ponte.js");

      fetch.mockResolvedValue(respostaJson({ id: "fila-6", estado: "na_fila" }, { status: 202 }));
      await abaA.enviarImpressaoPonte(trabalho("81"));
      await abaB.enviarImpressaoPonte(trabalho("81"));

      expect(idEnviado(1)).not.toBe(idEnviado(0));
      expect(idEnviado(1).length).toBeGreaterThanOrEqual(8);
    } finally {
      sorteio.mockRestore();
      relogio.mockRestore();
      vi.resetModules();
    }
  });

  it("a janela de reenvio conta a partir do instante em que a falha apareceu", async () => {
    // A tentativa que falha por tempo esgotado é justamente a demorada: ela
    // gasta o prazo inteiro do fetch antes de virar erro na tela. Datada no
    // começo da tentativa, a janela nasceria parcialmente gasta e o clique do
    // operador em cima do aviso viraria papel novo — a comanda em dobro que
    // toda esta memória existe para evitar.
    let agoraFalso = 5_000_000;
    const relogio = vi.spyOn(Date, "now").mockImplementation(() => agoraFalso);
    try {
      let recusar;
      fetch.mockImplementationOnce(() => new Promise((_, rej) => { recusar = rej; }));

      const primeira = enviarImpressaoPonte(trabalho("101"));
      agoraFalso += 10 * 1000; // a chamada só desistiu 10s depois de começar
      recusar(new TypeError("Failed to fetch"));
      expect((await primeira).error.foraDoAr).toBe(true);

      agoraFalso += 3 * 1000; // o operador clica 3s depois de ver o erro
      fetch.mockResolvedValueOnce(respostaJson({ ok: true, id: "qualquer", duplicado: true }));
      await enviarImpressaoPonte(trabalho("101"));

      expect(idEnviado(1)).toBe(idEnviado(0));
    } finally {
      relogio.mockRestore();
    }
  });

  it("id mandado por quem chama passa intacto (aí o reenvio é responsabilidade dele)", async () => {
    fetch.mockResolvedValue(respostaJson({ ok: true, id: "comanda-42-via-1", estado: "na_fila" }, { status: 202 }));

    await enviarImpressaoPonte({ ...trabalho("71"), id: "comanda-42-via-1" });

    expect(idEnviado(0)).toBe("comanda-42-via-1");
  });

  it("id curto demais para a Ponte honrar não passa: entra o id desta aba", async () => {
    // A Ponte só olha `id` com 8 caracteres ou mais. Repassar "abc" como
    // veio faria quem chamou acreditar que ativou a proteção sem ter
    // ativado nada — e o outro lado agora recusa id curto em vez de engolir.
    fetch.mockResolvedValue(respostaJson({ id: "fila-7", estado: "na_fila" }, { status: 202 }));

    await enviarImpressaoPonte({ ...trabalho("72"), id: "abc" });

    expect(idEnviado(0)).not.toBe("abc");
    expect(idEnviado(0).length).toBeGreaterThanOrEqual(8);
  });
});

// O id que protege contra comanda dobrada nasce no despacho da impressão
// (src/lib/impressao/despacho.js) e viaja no perfil da impressora. Se ele se
// perdesse neste último trecho, a proteção não chegaria à Ponte — que só
// deduplica pelo campo `id` do corpo.
describe("o driver da térmica leva o id da ação até a Ponte", () => {
  const VIA = {
    tipo: "via_producao",
    comanda: "12",
    horario: "2026-07-26T18:00:00.000Z",
    itens: [{ nome: "X-Burguer", qty: 1 }],
  };
  const PERFIL = { larguraMm: 58, impressora: { tipo: "windows", nome: "EPSON TM-T20" } };
  const corpoEnviado = () => JSON.parse(fetch.mock.calls[0][1].body);

  it("o `idImpressao` do perfil vira o `id` do trabalho", async () => {
    fetch.mockResolvedValue(respostaJson({ id: "fila-9", estado: "na_fila" }, { status: 202 }));

    const { error } = await imprimirPelaPonte(VIA, { ...PERFIL, idImpressao: "imp-9k3m1p7q4x2z0a" });

    expect(error).toBeNull();
    expect(corpoEnviado().id).toBe("imp-9k3m1p7q4x2z0a");
  });

  it("perfil sem `idImpressao` continua saindo com o id desta aba", async () => {
    fetch.mockResolvedValue(respostaJson({ id: "fila-10", estado: "na_fila" }, { status: 202 }));

    await imprimirPelaPonte(VIA, PERFIL);

    // Nunca sai sem identificação: a rede de segurança por assinatura de
    // conteúdo assume quando quem chama não nomeia a ação.
    expect(corpoEnviado().id).toEqual(expect.any(String));
    expect(corpoEnviado().id.length).toBeGreaterThanOrEqual(8);
  });
});

describe("montarEnderecoPalm", () => {
  it("monta o link com IP, porta e token", () => {
    const link = montarEnderecoPalm({ enderecos: ["192.168.0.42"], porta: 8123, token: "abc123" });
    expect(link).toBe("http://192.168.0.42:8123/palm?t=abc123");
  });

  it("devolve null sem IP ou sem token", () => {
    expect(montarEnderecoPalm({ enderecos: [], token: "abc" })).toBeNull();
    expect(montarEnderecoPalm({ enderecos: ["192.168.0.2"] })).toBeNull();
    expect(montarEnderecoPalm(null)).toBeNull();
  });
});
