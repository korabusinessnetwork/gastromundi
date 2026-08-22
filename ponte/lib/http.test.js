// Testes dos helpers de HTTP/rede da Ponte KORA (Leva 13).
import { describe, it, expect } from "vitest";
import {
  ehEnderecoLocal,
  hostEhLocal,
  normalizarOrigem,
  origemAceita,
  cabecalhosCors,
  tokenDaRequisicao,
  tokenValido,
  enderecosLan,
} from "./http.js";

describe("hostEhLocal", () => {
  it("aceita os nomes por onde o app do caixa e o painel realmente chegam", () => {
    expect(hostEhLocal("localhost:8123", 8123)).toBe(true);
    expect(hostEhLocal("127.0.0.1:8123", 8123)).toBe(true);
    expect(hostEhLocal("[::1]:8123", 8123)).toBe(true);
    expect(hostEhLocal("LOCALHOST:8123", 8123)).toBe(true);
    expect(hostEhLocal(" localhost:8123 ", 8123)).toBe(true);
  });

  it("recusa domínio de fora apontado para 127.0.0.1 (DNS rebinding)", () => {
    // O ataque: a conexão chega mesmo de loopback e passa em ehEnderecoLocal.
    // Quem denuncia é o Host, que carrega o domínio do atacante.
    expect(hostEhLocal("evil.com:8123", 8123)).toBe(false);
    expect(hostEhLocal("ponte.evil.com:8123", 8123)).toBe(false);
    expect(hostEhLocal("localhost.evil.com:8123", 8123)).toBe(false);
    expect(hostEhLocal("evil.com", 8123)).toBe(false);
  });

  it("recusa host apontando para outra porta e entradas inválidas", () => {
    expect(hostEhLocal("localhost:9999", 8123)).toBe(false);
    expect(hostEhLocal("localhost", 8123)).toBe(false);
    expect(hostEhLocal("", 8123)).toBe(false);
    expect(hostEhLocal(undefined, 8123)).toBe(false);
    expect(hostEhLocal(null, 8123)).toBe(false);
    expect(hostEhLocal(8123, 8123)).toBe(false);
  });

  it("aceita host sem porta quando a ponte ouve na 80", () => {
    expect(hostEhLocal("localhost", 80)).toBe(true);
    expect(hostEhLocal("localhost:80", 80)).toBe(true);
    expect(hostEhLocal("localhost:8123", 80)).toBe(false);
  });
});

describe("ehEnderecoLocal", () => {
  it("reconhece loopback IPv4, IPv6 e IPv4-mapeado", () => {
    expect(ehEnderecoLocal("127.0.0.1")).toBe(true);
    expect(ehEnderecoLocal("::1")).toBe(true);
    expect(ehEnderecoLocal("::ffff:127.0.0.1")).toBe(true);
    expect(ehEnderecoLocal("127.0.0.53")).toBe(true);
  });

  it("recusa endereços da rede local e entradas inválidas", () => {
    expect(ehEnderecoLocal("192.168.0.10")).toBe(false);
    expect(ehEnderecoLocal("10.0.0.5")).toBe(false);
    expect(ehEnderecoLocal("")).toBe(false);
    expect(ehEnderecoLocal(undefined)).toBe(false);
    expect(ehEnderecoLocal(null)).toBe(false);
  });
});

describe("normalizarOrigem", () => {
  it("deixa em forma comparável e trata os casos vazios", () => {
    expect(normalizarOrigem("HTTPS://App.Kora.com/")).toBe("https://app.kora.com");
    expect(normalizarOrigem("  https://app.kora.com  ")).toBe("https://app.kora.com");
    // Origem opaca (sandbox, redirecionamento) chega como a string "null".
    expect(normalizarOrigem("null")).toBe("");
    expect(normalizarOrigem("")).toBe("");
    expect(normalizarOrigem(undefined)).toBe("");
  });
});

describe("origemAceita", () => {
  const HOST = "localhost:8123";
  const DONA = "https://app.gastromundi.com";

  it("sem dono, endereço desconhecido entra pelo primeiro vínculo e por mais nada", () => {
    // Instalação nova (ou logo depois de "liberar para outro endereço"): o
    // vínculo tem que entrar, senão nenhuma ponte nova funciona. O resto,
    // não: era por aí que um site qualquer aberto no navegador do caixa lia
    // /info — que entrega o token do estabelecimento — e ainda parava ou
    // instalava a ponte, sem o dono ver nada.
    expect(origemAceita({ origem: DONA, host: HOST, primeiroVinculo: true })).toBe(true);
    expect(origemAceita({ origem: "https://qualquer.com", host: HOST, fixada: "", primeiroVinculo: true })).toBe(true);

    expect(origemAceita({ origem: DONA, host: HOST })).toBe(false);
    expect(origemAceita({ origem: "https://qualquer.com", host: HOST, fixada: "" })).toBe(false);
  });

  it("o passe do primeiro vínculo vale só enquanto não há dono", () => {
    // Depois de fixado, nem o /vincular aceita endereço estranho — senão
    // qualquer site tomaria a ponte de um estabelecimento já vinculado.
    expect(origemAceita({ origem: "https://site-do-atacante.com", host: HOST, fixada: DONA, primeiroVinculo: true })).toBe(false);
    expect(origemAceita({ origem: DONA, host: HOST, fixada: DONA, primeiroVinculo: true })).toBe(true);
  });

  it("depois de fixada, só atende a origem do estabelecimento", () => {
    expect(origemAceita({ origem: DONA, host: HOST, fixada: DONA })).toBe(true);
    expect(origemAceita({ origem: `${DONA}/`, host: HOST, fixada: DONA })).toBe(true);
    expect(origemAceita({ origem: "https://site-do-atacante.com", host: HOST, fixada: DONA })).toBe(false);
    // Sufixo parecido não vale: "app.gastromundi.com.evil.com" é outro domínio.
    expect(origemAceita({ origem: `${DONA}.evil.com`, host: HOST, fixada: DONA })).toBe(false);
  });

  it("pedido sem Origin passa (não é navegador falando de outro site)", () => {
    expect(origemAceita({ host: HOST, fixada: DONA })).toBe(true);
    expect(origemAceita({ origem: "", host: HOST, fixada: DONA })).toBe(true);
    // Vale também na ponte sem dono: é o curl, é o próprio painel num GET.
    expect(origemAceita({ host: HOST })).toBe(true);
  });

  it("mesma origem passa sempre — é o painel e é o Palm", () => {
    // Sem isso, fixar a origem trancaria o próprio painel pra fora e não
    // haveria como liberar outro endereço.
    expect(origemAceita({ origem: "http://localhost:8123", host: HOST, fixada: DONA })).toBe(true);
    expect(origemAceita({ origem: "http://192.168.0.42:8123", host: "192.168.0.42:8123", fixada: DONA })).toBe(true);
    // E antes de existir dono também: é assim que o painel abre numa
    // instalação nova, que é justo quando ele precisa ser visto.
    expect(origemAceita({ origem: "http://localhost:8123", host: HOST })).toBe(true);
  });
});

describe("cabecalhosCors", () => {
  const DONA = "https://app.gastromundi.com";

  it("ecoa a origem aceita e libera rede privada", () => {
    const h = cabecalhosCors({ origem: DONA, host: "localhost:8123", fixada: DONA });
    expect(h["Access-Control-Allow-Origin"]).toBe(DONA);
    expect(h["Access-Control-Allow-Methods"]).toContain("POST");
    expect(h["Access-Control-Allow-Headers"]).toContain("X-Ponte-Token");
    expect(h["Access-Control-Allow-Private-Network"]).toBe("true");
    expect(h.Vary).toBe("Origin");
  });

  it("origem recusada não recebe Allow-Origin nenhum", () => {
    // É o cerne da correção: sem esse cabeçalho o navegador barra a LEITURA
    // da resposta, e /info deixa de entregar o token pra qualquer site aberto.
    const h = cabecalhosCors({ origem: "https://site-do-atacante.com", host: "localhost:8123", fixada: DONA });
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(h["Access-Control-Allow-Private-Network"]).toBeUndefined();
    expect(h.Vary).toBe("Origin");
  });

  it("sem Origin não manda Allow-Origin (não há nada a liberar)", () => {
    const h = cabecalhosCors({ host: "localhost:8123", fixada: DONA });
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(h["Access-Control-Allow-Methods"]).toContain("POST");
  });

  it("sem argumento nenhum não devolve o curinga que existia antes", () => {
    expect(cabecalhosCors()["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("ponte sem dono só ecoa a origem na rota do primeiro vínculo", () => {
    const invasor = "https://site-do-atacante.com";
    expect(cabecalhosCors({ origem: invasor, host: "localhost:8123" })["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(
      cabecalhosCors({ origem: invasor, host: "localhost:8123", primeiroVinculo: true })["Access-Control-Allow-Origin"],
    ).toBe(invasor);
  });
});

describe("tokenDaRequisicao", () => {
  it("lê do cabeçalho X-Ponte-Token", () => {
    const t = tokenDaRequisicao({ headers: { "x-ponte-token": "abc" } });
    expect(t).toBe("abc");
  });

  it("lê da query ?t= quando não há cabeçalho (link do QR)", () => {
    const url = new URL("http://192.168.0.2:8123/catalogo?t=xyz");
    expect(tokenDaRequisicao({ headers: {}, url })).toBe("xyz");
  });

  it("cabeçalho vence a query; sem nada devolve string vazia", () => {
    const url = new URL("http://x/y?t=daquery");
    expect(tokenDaRequisicao({ headers: { "x-ponte-token": "doheader" }, url })).toBe("doheader");
    expect(tokenDaRequisicao({})).toBe("");
    expect(tokenDaRequisicao()).toBe("");
  });
});

describe("tokenValido", () => {
  it("aceita tokens iguais e recusa diferentes", () => {
    expect(tokenValido("abc123", "abc123")).toBe(true);
    expect(tokenValido("abc124", "abc123")).toBe(false);
    expect(tokenValido("abc", "abc123")).toBe(false);
  });

  it("recusa vazio, undefined e tipos errados — nunca valida sem token", () => {
    expect(tokenValido("", "")).toBe(false);
    expect(tokenValido("", "abc")).toBe(false);
    expect(tokenValido(undefined, "abc")).toBe(false);
    expect(tokenValido("abc", undefined)).toBe(false);
    expect(tokenValido(123, 123)).toBe(false);
  });
});

describe("enderecosLan", () => {
  it("devolve só IPv4 não-interno (é o que vira o link do Palm)", () => {
    const interfaces = {
      lo: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
      wifi: [
        { family: "IPv4", address: "192.168.0.42", internal: false },
        { family: "IPv6", address: "fe80::1", internal: false },
      ],
      eth: [{ family: 4, address: "10.0.0.7", internal: false }],
    };
    expect(enderecosLan(interfaces)).toEqual(["192.168.0.42", "10.0.0.7"]);
  });

  it("tolera entrada vazia ou malformada", () => {
    expect(enderecosLan(undefined)).toEqual([]);
    expect(enderecosLan({})).toEqual([]);
    expect(enderecosLan({ x: "não é lista" })).toEqual([]);
  });
});
