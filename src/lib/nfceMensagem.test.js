import { describe, it, expect } from "vitest";
import { mensagemDesfechoNfce, limparDetalheTecnico } from "./nfceMensagem";

describe("limparDetalheTecnico", () => {
  it("remove o endereço do servidor do texto", () => {
    expect(limparDetalheTecnico("Failed to fetch (jgdvylwiuqgjtavffguc.supabase.co)"))
      .toBe("Failed to fetch");
    expect(limparDetalheTecnico("erro em https://algum.host/functions/v1/emitir-nfce"))
      .toBe("erro em");
  });

  it("preserva texto sem endereço", () => {
    expect(limparDetalheTecnico("Rejeicao: CPF do destinatario invalido"))
      .toBe("Rejeicao: CPF do destinatario invalido");
  });

  it("aceita entrada ausente", () => {
    expect(limparDetalheTecnico(null)).toBe("");
    expect(limparDetalheTecnico(undefined)).toBe("");
  });
});

describe("mensagemDesfechoNfce", () => {
  it("erro de rede com a nota na fila: promete o reenvio automático", () => {
    const m = mensagemDesfechoNfce({ status: "erro", detalhe: "Failed to fetch", naFila: true });
    expect(m.automatico).toBe(true);
    expect(m.texto).toMatch(/fila/i);
    expect(m.motivo).toBeNull();
  });

  it("nunca leva o detalhe técnico do erro para a tela", () => {
    const m = mensagemDesfechoNfce({
      status: "erro",
      detalhe: "Failed to fetch (jgdvylwiuqgjtavffguc.supabase.co)",
      naFila: false,
    });
    expect(JSON.stringify(m)).not.toMatch(/supabase|failed to fetch/i);
    expect(m.automatico).toBe(false);
  });

  it("rejeitada mostra o motivo da SEFAZ, sem endereço de servidor", () => {
    const m = mensagemDesfechoNfce({
      status: "rejeitada",
      detalhe: "Rejeicao: Duplicidade de NF-e (consulta em jgdvylwiuqgjtavffguc.supabase.co)",
    });
    expect(m.motivo).toMatch(/Duplicidade/);
    expect(m.motivo).not.toMatch(/supabase/);
    expect(m.automatico).toBe(false);
  });

  it("sem_chave orienta a concluir a configuração fiscal", () => {
    const m = mensagemDesfechoNfce({ status: "sem_chave" });
    expect(m.titulo).toMatch(/configurada/i);
    expect(m.motivo).toBeNull();
  });

  it("status desconhecido/ausente não trata a venda como falha", () => {
    for (const r of [null, undefined, {}, { status: "outro" }]) {
      const m = mensagemDesfechoNfce(r);
      expect(m.texto).toMatch(/venda está registrada/i);
      expect(m.automatico).toBe(false);
    }
  });

  it("toda mensagem afirma que a venda está registrada", () => {
    for (const status of ["erro", "rejeitada", "sem_chave"]) {
      expect(mensagemDesfechoNfce({ status }).texto).toMatch(/venda está registrada/i);
    }
  });
});
