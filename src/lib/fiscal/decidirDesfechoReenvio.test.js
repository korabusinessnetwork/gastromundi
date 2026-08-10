import { describe, it, expect } from "vitest";
import { decidirDesfechoReenvio } from "./decidirDesfechoReenvio";

describe("decidirDesfechoReenvio — regra do reenvio da fila (Leva 9)", () => {
  it("autorizada (cStat 100): sai da fila, não incrementa tentativas, carrega nfeProc/protocolo/dhRecbto", () => {
    const r = decidirDesfechoReenvio({
      retornoInterpretado: {
        autorizada: true, cStat: "100", xMotivo: "Autorizado o uso da NF-e",
        protocolo: "135260000123456", nfeProc: "<nfeProc/>", dhRecbto: "2026-07-13T14:05:00-03:00",
      },
      tentativasAtuais: 2,
    });
    expect(r.status).toBe("autorizada");
    expect(r.tentativas).toBe(2); // sucesso não conta como falha
    expect(r.motivo).toBeNull();
    expect(r.protocolo).toBe("135260000123456");
    expect(r.nfeProc).toBe("<nfeProc/>");
    expect(r.dhRecbto).toBe("2026-07-13T14:05:00-03:00");
  });

  it("autorizada fora de prazo (cStat 150) também sai da fila", () => {
    const r = decidirDesfechoReenvio({ retornoInterpretado: { autorizada: true, cStat: "150" } });
    expect(r.status).toBe("autorizada");
  });

  it("rejeição definitiva (cStat 217): sai da fila e incrementa tentativas", () => {
    const r = decidirDesfechoReenvio({
      retornoInterpretado: { autorizada: false, cStat: "217", xMotivo: "NF-e não consta na base" },
      tentativasAtuais: 1,
    });
    expect(r.status).toBe("rejeitada");
    expect(r.tentativas).toBe(2);
    expect(r.cStat).toBe("217");
    expect(r.motivo).toContain("217");
  });

  it("serviço paralisado (cStat 108): mantém pendente e incrementa tentativas", () => {
    const r = decidirDesfechoReenvio({
      retornoInterpretado: { autorizada: false, cStat: "108", xMotivo: "Serviço paralisado momentaneamente" },
      tentativasAtuais: 0,
    });
    expect(r.status).toBe("pendente");
    expect(r.tentativas).toBe(1);
    expect(r.motivo).toContain("sefaz_indisponivel");
  });

  it("erro de transmissão (SEFAZ fora / TLS): mantém pendente, +1 tentativa, motivo sem vazar segredo", () => {
    const r = decidirDesfechoReenvio({ erroTransmissao: "connect ETIMEDOUT", tentativasAtuais: 3 });
    expect(r.status).toBe("pendente");
    expect(r.tentativas).toBe(4);
    expect(r.motivo).toContain("falha_transmissao");
    expect(r.autorizada).toBe(false);
  });

  it("erro de transmissão tem prioridade sobre um retorno interpretado presente", () => {
    const r = decidirDesfechoReenvio({
      erroTransmissao: "socket hang up",
      retornoInterpretado: { autorizada: true, cStat: "100" },
    });
    expect(r.status).toBe("pendente");
  });

  it("sem retorno e sem erro: defensivo, mantém pendente", () => {
    const r = decidirDesfechoReenvio({ tentativasAtuais: 0 });
    expect(r.status).toBe("pendente");
    expect(r.tentativas).toBe(1);
    expect(r.motivo).toBe("sem_retorno_interpretavel");
  });

  it("tentativasAtuais inválido é tratado como 0", () => {
    const r = decidirDesfechoReenvio({ erroTransmissao: "x", tentativasAtuais: undefined });
    expect(r.tentativas).toBe(1);
  });
});
