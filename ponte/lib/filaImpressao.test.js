// Testes da fila de impressão da Ponte KORA.
//
// O que estes testes protegem: a comanda nunca se perde quando a impressora
// está desligada/ocupada (backoff + tentativas), e o arquivo da fila nunca
// cresce para sempre no PC do caixa.
import { describe, it, expect } from "vitest";
import {
  criarTrabalho,
  validarDestino,
  proximoTrabalho,
  marcarImprimindo,
  marcarConcluido,
  marcarFalha,
  destravarImprimindo,
  contarPendentes,
  podarFila,
  limparFinalizados,
  BACKOFF_MS,
  MAX_TENTATIVAS,
  MAX_TRABALHOS,
  MAX_LINHAS,
  MAX_COPIAS,
  RETENCAO_FINALIZADO_MS,
  PORTA_RAW_PADRAO,
} from "./filaImpressao.js";

const AGORA = "2026-07-26T12:00:00.000Z";
const AGORA_MS = Date.parse(AGORA);

const destinoWindows = { tipo: "windows", nome: "EPSON TM-T20" };
const corpo = (extra = {}) => ({ destino: destinoWindows, linhas: ["PEDIDO 12", "1x Açaí"], ...extra });
const novo = (extra = {}, opts = {}) => criarTrabalho(corpo(extra), { agora: AGORA, id: "t1", ...opts });

describe("validarDestino", () => {
  it("aceita impressora do Windows e limpa o nome", () => {
    const r = validarDestino({ tipo: "windows", nome: "  EPSON TM-T20  " });
    expect(r.ok).toBe(true);
    expect(r.destino).toEqual({ tipo: "windows", nome: "EPSON TM-T20" });
  });

  it("aceita impressora de rede e assume a porta 9100", () => {
    const r = validarDestino({ tipo: "rede", host: "192.168.0.50" });
    expect(r.ok).toBe(true);
    expect(r.destino).toEqual({ tipo: "rede", host: "192.168.0.50", porta: PORTA_RAW_PADRAO });
  });

  it("aceita porta explícita e recusa porta fora da faixa", () => {
    expect(validarDestino({ tipo: "rede", host: "10.0.0.9", porta: 9101 }).destino.porta).toBe(9101);
    expect(validarDestino({ tipo: "rede", host: "10.0.0.9", porta: 0 }).ok).toBe(false);
    expect(validarDestino({ tipo: "rede", host: "10.0.0.9", porta: 70000 }).ok).toBe(false);
    expect(validarDestino({ tipo: "rede", host: "10.0.0.9", porta: "abc" }).ok).toBe(false);
  });

  it("recusa destino ausente, vazio ou de tipo desconhecido", () => {
    expect(validarDestino(null).ok).toBe(false);
    expect(validarDestino([]).ok).toBe(false);
    expect(validarDestino({ tipo: "windows", nome: "   " }).ok).toBe(false);
    expect(validarDestino({ tipo: "rede", host: "" }).ok).toBe(false);
    const r = validarDestino({ tipo: "usb" });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/desconhecido/i);
  });

  it("tira caractere de controle do nome/host (nunca vai cru para o sistema)", () => {
    const r = validarDestino({ tipo: "windows", nome: "EPSON\r\nTM" });
    expect(r.destino.nome).toBe("EPSONTM");
  });
});

describe("criarTrabalho", () => {
  it("devolve o registro pronto para a fila", () => {
    const r = novo();
    expect(r.ok).toBe(true);
    expect(r.trabalho).toMatchObject({
      id: "t1",
      criadoEm: AGORA,
      destino: destinoWindows,
      cortaPapel: true,
      copias: 1,
      estado: "na_fila",
      tentativas: 0,
      proximaTentativaEm: AGORA,
      erro: null,
    });
    expect(r.trabalho.linhas).toEqual(["PEDIDO 12", "1x Açaí"]);
  });

  it("rejeita destino inválido antes de olhar o resto", () => {
    const r = criarTrabalho({ destino: { tipo: "fax" }, linhas: ["x"] }, { agora: AGORA });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/desconhecido/i);
  });

  it("exige linhas: array, não vazio, só texto, dentro do limite", () => {
    expect(criarTrabalho(corpo({ linhas: undefined }), {}).ok).toBe(false);
    expect(criarTrabalho(corpo({ linhas: "texto" }), {}).ok).toBe(false);
    expect(criarTrabalho(corpo({ linhas: [] }), {}).ok).toBe(false);
    expect(criarTrabalho(corpo({ linhas: ["ok", 42] }), {}).ok).toBe(false);
    const grande = criarTrabalho(corpo({ linhas: Array.from({ length: MAX_LINHAS + 1 }, () => "x") }), {});
    expect(grande.ok).toBe(false);
    expect(grande.erro).toContain(String(MAX_LINHAS));
  });

  it("valida cópias (1 a MAX_COPIAS, inteiro)", () => {
    expect(novo({ copias: 2 }).trabalho.copias).toBe(2);
    expect(criarTrabalho(corpo({ copias: 0 }), {}).ok).toBe(false);
    expect(criarTrabalho(corpo({ copias: MAX_COPIAS + 1 }), {}).ok).toBe(false);
    expect(criarTrabalho(corpo({ copias: 1.5 }), {}).ok).toBe(false);
    expect(criarTrabalho(corpo({ copias: null }), {}).trabalho.copias).toBe(1);
  });

  it("cortaPapel só é false quando pedido explicitamente", () => {
    expect(novo({ cortaPapel: false }).trabalho.cortaPapel).toBe(false);
    expect(novo({ cortaPapel: undefined }).trabalho.cortaPapel).toBe(true);
  });

  it("recusa corpo que não é objeto", () => {
    expect(criarTrabalho(null, {}).ok).toBe(false);
    expect(criarTrabalho([], {}).ok).toBe(false);
  });

  it("gera id quando o chamador não passa", () => {
    const r = criarTrabalho(corpo(), { agora: AGORA });
    expect(typeof r.trabalho.id).toBe("string");
    expect(r.trabalho.id.length).toBeGreaterThan(8);
  });
});

describe("proximoTrabalho", () => {
  const naFila = (extra) => ({ id: "a", estado: "na_fila", proximaTentativaEm: AGORA, ...extra });

  it("devolve o primeiro na_fila cuja espera já passou", () => {
    const fila = [
      naFila({ id: "espera", proximaTentativaEm: new Date(AGORA_MS + 5000).toISOString() }),
      naFila({ id: "pronto" }),
    ];
    expect(proximoTrabalho(fila, AGORA).id).toBe("pronto");
  });

  it("ignora quem já está imprimindo, concluído ou falhado", () => {
    const fila = [
      naFila({ id: "x", estado: "imprimindo" }),
      naFila({ id: "y", estado: "concluido" }),
      naFila({ id: "z", estado: "falhou" }),
    ];
    expect(proximoTrabalho(fila, AGORA)).toBe(null);
  });

  it("devolve null com fila vazia ou inválida", () => {
    expect(proximoTrabalho([], AGORA)).toBe(null);
    expect(proximoTrabalho(null, AGORA)).toBe(null);
  });
});

describe("marcarImprimindo / marcarConcluido", () => {
  it("avança o estado sem mutar a fila original", () => {
    const fila = [novo().trabalho];
    const emUso = marcarImprimindo(fila, "t1", AGORA);
    expect(emUso[0].estado).toBe("imprimindo");
    expect(emUso[0].iniciadoEm).toBe(AGORA);
    expect(fila[0].estado).toBe("na_fila");

    const pronto = marcarConcluido(emUso, "t1", AGORA);
    expect(pronto[0].estado).toBe("concluido");
    expect(pronto[0].concluidoEm).toBe(AGORA);
    expect(pronto[0].erro).toBe(null);
  });

  it("ignora id desconhecido", () => {
    const fila = [novo().trabalho];
    expect(marcarConcluido(fila, "outro", AGORA)[0].estado).toBe("na_fila");
  });
});

describe("marcarFalha — backoff crescente e limite de tentativas", () => {
  it("aplica 5s, 15s e depois 60s entre as tentativas", () => {
    let fila = [novo().trabalho];

    fila = marcarFalha(fila, "t1", "impressora sem papel", AGORA);
    expect(fila[0].estado).toBe("na_fila");
    expect(fila[0].tentativas).toBe(1);
    expect(fila[0].erro).toBe("impressora sem papel");
    expect(Date.parse(fila[0].proximaTentativaEm) - AGORA_MS).toBe(BACKOFF_MS[0]);

    fila = marcarFalha(fila, "t1", "sem papel", AGORA);
    expect(fila[0].tentativas).toBe(2);
    expect(Date.parse(fila[0].proximaTentativaEm) - AGORA_MS).toBe(BACKOFF_MS[1]);

    fila = marcarFalha(fila, "t1", "sem papel", AGORA);
    expect(fila[0].tentativas).toBe(3);
    expect(Date.parse(fila[0].proximaTentativaEm) - AGORA_MS).toBe(BACKOFF_MS[2]);

    fila = marcarFalha(fila, "t1", "sem papel", AGORA);
    expect(fila[0].tentativas).toBe(4);
    expect(fila[0].estado).toBe("na_fila");
    expect(Date.parse(fila[0].proximaTentativaEm) - AGORA_MS).toBe(BACKOFF_MS[2]);
  });

  it(`vira "falhou" na tentativa ${MAX_TENTATIVAS} e para de tentar`, () => {
    let fila = [novo().trabalho];
    for (let i = 0; i < MAX_TENTATIVAS; i += 1) fila = marcarFalha(fila, "t1", "offline", AGORA);
    expect(fila[0].tentativas).toBe(MAX_TENTATIVAS);
    expect(fila[0].estado).toBe("falhou");
    expect(fila[0].erro).toBe("offline");
    expect(proximoTrabalho(fila, new Date(AGORA_MS + 3600_000).toISOString())).toBe(null);
  });

  it("aceita Error e corta mensagem gigante", () => {
    const fila = marcarFalha([novo().trabalho], "t1", new Error("cabo solto"), AGORA);
    expect(fila[0].erro).toBe("cabo solto");
    const longa = marcarFalha([novo().trabalho], "t1", "x".repeat(500), AGORA);
    expect(longa[0].erro).toHaveLength(300);
  });
});

describe("destravarImprimindo", () => {
  it("devolve à fila o trabalho preso em imprimindo (queda de luz)", () => {
    const preso = { ...novo().trabalho, estado: "imprimindo" };
    const fila = destravarImprimindo([preso], AGORA);
    expect(fila[0].estado).toBe("na_fila");
    expect(fila[0].tentativas).toBe(0); // não houve resposta da impressora
    expect(fila[0].proximaTentativaEm).toBe(AGORA);
  });
});

describe("contarPendentes", () => {
  it("conta na_fila e imprimindo, ignora finalizados", () => {
    const fila = [
      { id: "a", estado: "na_fila" },
      { id: "b", estado: "imprimindo" },
      { id: "c", estado: "concluido" },
      { id: "d", estado: "falhou" },
    ];
    expect(contarPendentes(fila)).toBe(2);
    expect(contarPendentes(null)).toBe(0);
  });
});

describe("podarFila", () => {
  const finalizado = (id, idadeMs, estado = "concluido") => ({
    id,
    estado,
    criadoEm: new Date(AGORA_MS - idadeMs).toISOString(),
    concluidoEm: new Date(AGORA_MS - idadeMs).toISOString(),
  });

  it("descarta concluídos com mais de 24h e mantém os recentes", () => {
    const fila = [finalizado("velho", RETENCAO_FINALIZADO_MS + 1000), finalizado("novo", 1000)];
    expect(podarFila(fila, AGORA).map((t) => t.id)).toEqual(["novo"]);
  });

  it("descarta também falhados antigos", () => {
    const fila = [finalizado("f", RETENCAO_FINALIZADO_MS + 1000, "falhou")];
    expect(podarFila(fila, AGORA)).toHaveLength(0);
  });

  it("nunca poda quem ainda vai imprimir, por mais antigo que seja", () => {
    const antigo = { id: "p", estado: "na_fila", criadoEm: "2020-01-01T00:00:00.000Z", proximaTentativaEm: AGORA };
    expect(podarFila([antigo], AGORA)).toHaveLength(1);
  });

  it("segura a fila em no máximo MAX_TRABALHOS registros", () => {
    const fila = Array.from({ length: MAX_TRABALHOS + 30 }, (_, i) => finalizado(`c${i}`, 1000));
    const podada = podarFila(fila, AGORA);
    expect(podada).toHaveLength(MAX_TRABALHOS);
    // Sacrifica os mais antigos (o começo da lista), preserva os últimos.
    expect(podada[podada.length - 1].id).toBe(`c${MAX_TRABALHOS + 29}`);
  });

  it("no estouro, descarta finalizados antes de pendentes", () => {
    const pendentes = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, estado: "na_fila", criadoEm: AGORA, proximaTentativaEm: AGORA }));
    const concluidos = Array.from({ length: MAX_TRABALHOS }, (_, i) => finalizado(`c${i}`, 1000));
    const podada = podarFila([...concluidos, ...pendentes], AGORA);
    expect(podada).toHaveLength(MAX_TRABALHOS);
    expect(podada.filter((t) => t.estado === "na_fila")).toHaveLength(10);
  });

  it("descarta registro com data ilegível e tolera lixo na lista", () => {
    const fila = [{ id: "x", estado: "concluido", concluidoEm: "quebrada", criadoEm: null }, null, "oi"];
    expect(podarFila(fila, AGORA)).toHaveLength(0);
    expect(podarFila(null, AGORA)).toEqual([]);
  });
});

describe("limparFinalizados", () => {
  it("remove concluídos e falhados, preserva quem ainda vai imprimir", () => {
    const fila = [
      { id: "a", estado: "na_fila" },
      { id: "b", estado: "imprimindo" },
      { id: "c", estado: "concluido" },
      { id: "d", estado: "falhou" },
    ];
    const r = limparFinalizados(fila);
    expect(r.removidos).toBe(2);
    expect(r.fila.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("tolera fila vazia/inválida", () => {
    expect(limparFinalizados(null)).toEqual({ fila: [], removidos: 0 });
  });
});
