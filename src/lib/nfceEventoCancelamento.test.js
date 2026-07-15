import { describe, it, expect } from "vitest";
import {
  montarXmlEventoCancelamento,
  dentroDoPrazoCancelamento,
  decidirDesfechoCancelamento,
  LIMITE_CANCELAMENTO_MINUTOS_PADRAO,
} from "./nfceEventoCancelamento";

const CHAVE = "43260712345678000195650010000000011000000017";
const CNPJ = "12345678000195";
const PROTOCOLO = "143260000123456";
const JUST = "Cliente desistiu da compra e pediu o cancelamento.";

describe("nfceEventoCancelamento — montarXmlEventoCancelamento", () => {
  it("monta o <evento>/<infEvento Id=ID110111...> com todos os campos", () => {
    const { xml, id, chave } = montarXmlEventoCancelamento({
      chave: CHAVE, protocolo: PROTOCOLO, justificativa: JUST, cnpj: CNPJ, tpAmb: 2,
      dataEvento: new Date("2026-07-13T18:30:00Z"),
    });
    expect(id).toBe(`ID110111${CHAVE}01`); // nSeqEvento default 1, 2 dígitos
    expect(chave).toBe(CHAVE);
    expect(xml).toContain('<evento versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">');
    expect(xml).toContain(`<infEvento Id="ID110111${CHAVE}01">`);
    expect(xml).toContain("<cOrgao>43</cOrgao>"); // derivado da chave (RS), não hardcodado
    expect(xml).toContain("<tpAmb>2</tpAmb>");
    expect(xml).toContain(`<CNPJ>${CNPJ}</CNPJ>`);
    expect(xml).toContain(`<chNFe>${CHAVE}</chNFe>`);
    expect(xml).toContain("<tpEvento>110111</tpEvento>");
    expect(xml).toContain("<descEvento>Cancelamento</descEvento>");
    expect(xml).toContain(`<nProt>${PROTOCOLO}</nProt>`);
    expect(xml).toContain(`<xJust>${JUST}</xJust>`);
    // dhEvento no fuso de Brasília (-03:00), 15:30 local para 18:30Z.
    expect(xml).toContain("<dhEvento>2026-07-13T15:30:00-03:00</dhEvento>");
  });

  it("usa o nSeqEvento com 2 dígitos no Id", () => {
    const { id } = montarXmlEventoCancelamento({
      chave: CHAVE, protocolo: PROTOCOLO, justificativa: JUST, cnpj: CNPJ, tpAmb: 2, nSeqEvento: 3,
    });
    expect(id).toBe(`ID110111${CHAVE}03`);
  });

  it("valida chave (44 dígitos)", () => {
    expect(() => montarXmlEventoCancelamento({ chave: "123", protocolo: PROTOCOLO, justificativa: JUST, cnpj: CNPJ, tpAmb: 2 }))
      .toThrow(/44 dígitos/);
  });

  it("exige protocolo e justificativa entre 15 e 255 caracteres", () => {
    expect(() => montarXmlEventoCancelamento({ chave: CHAVE, protocolo: "", justificativa: JUST, cnpj: CNPJ, tpAmb: 2 }))
      .toThrow(/protocolo/);
    expect(() => montarXmlEventoCancelamento({ chave: CHAVE, protocolo: PROTOCOLO, justificativa: "curta", cnpj: CNPJ, tpAmb: 2 }))
      .toThrow(/15 e 255/);
    expect(() => montarXmlEventoCancelamento({ chave: CHAVE, protocolo: PROTOCOLO, justificativa: "x".repeat(256), cnpj: CNPJ, tpAmb: 2 }))
      .toThrow(/15 e 255/);
  });

  it("valida tpAmb e nSeqEvento", () => {
    expect(() => montarXmlEventoCancelamento({ chave: CHAVE, protocolo: PROTOCOLO, justificativa: JUST, cnpj: CNPJ, tpAmb: 3 }))
      .toThrow(/tpAmb/);
    expect(() => montarXmlEventoCancelamento({ chave: CHAVE, protocolo: PROTOCOLO, justificativa: JUST, cnpj: CNPJ, tpAmb: 2, nSeqEvento: 0 }))
      .toThrow(/nSeqEvento/);
  });

  it("escapa caracteres especiais na justificativa", () => {
    const { xml } = montarXmlEventoCancelamento({
      chave: CHAVE, protocolo: PROTOCOLO, cnpj: CNPJ, tpAmb: 2,
      justificativa: "Erro no item <A> & no valor total do pedido.",
    });
    expect(xml).toContain("&lt;A&gt; &amp; no valor");
  });
});

describe("nfceEventoCancelamento — dentroDoPrazoCancelamento", () => {
  const dhEmi = "2026-07-13T12:00:00Z";

  it("dentro do prazo padrão", () => {
    expect(dentroDoPrazoCancelamento({ dhEmi, agora: "2026-07-13T12:10:00Z" })).toBe(true);
  });

  it("fora do prazo (passou do limite)", () => {
    const agora = new Date("2026-07-13T12:00:00Z").getTime() + (LIMITE_CANCELAMENTO_MINUTOS_PADRAO + 5) * 60000;
    expect(dentroDoPrazoCancelamento({ dhEmi, agora: new Date(agora) })).toBe(false);
  });

  it("respeita um limiteMinutos customizado", () => {
    expect(dentroDoPrazoCancelamento({ dhEmi, agora: "2026-07-13T12:03:00Z", limiteMinutos: 2 })).toBe(false);
    expect(dentroDoPrazoCancelamento({ dhEmi, agora: "2026-07-13T12:03:00Z", limiteMinutos: 5 })).toBe(true);
  });

  it("data inválida devolve false (nunca deixa cancelar às cegas)", () => {
    expect(dentroDoPrazoCancelamento({ dhEmi: "xxx", agora: new Date() })).toBe(false);
  });
});

describe("nfceEventoCancelamento — decidirDesfechoCancelamento", () => {
  it("cStat 135 → cancelada, carrega protocolo e procEventoNFe", () => {
    const d = decidirDesfechoCancelamento({
      retornoInterpretado: {
        registrado: true, cStat: "135", xMotivo: "Evento registrado e vinculado a NF-e",
        protocoloEvento: "143260000999999", procEventoNFe: "<procEventoNFe>…</procEventoNFe>",
      },
    });
    expect(d.status).toBe("cancelada");
    expect(d.cancelada).toBe(true);
    expect(d.protocoloEvento).toBe("143260000999999");
    expect(d.procEventoNFe).toContain("procEventoNFe");
    expect(d.motivo).toBeNull();
  });

  it("cStat 155 (registrado fora de prazo) também cancela", () => {
    const d = decidirDesfechoCancelamento({ retornoInterpretado: { cStat: "155", xMotivo: "fora de prazo" } });
    expect(d.status).toBe("cancelada");
    expect(d.cancelada).toBe(true);
  });

  it("rejeição do evento (ex.: 573 duplicidade) → não cancela, guarda motivo", () => {
    const d = decidirDesfechoCancelamento({
      retornoInterpretado: { cStat: "573", xMotivo: "Duplicidade de evento" },
    });
    expect(d.status).toBe("autorizada");
    expect(d.cancelada).toBe(false);
    expect(d.cStat).toBe("573");
    expect(d.motivo).toContain("rejeicao_evento: 573");
  });

  it("erro de transmissão → não cancela, motivo sem vazar segredo", () => {
    const d = decidirDesfechoCancelamento({ erroTransmissao: "TLS handshake falhou" });
    expect(d.status).toBe("autorizada");
    expect(d.cancelada).toBe(false);
    expect(d.motivo).toContain("falha_transmissao");
    expect(d.procEventoNFe).toBeNull();
  });

  it("sem retorno e sem erro → defensivo, não cancela", () => {
    const d = decidirDesfechoCancelamento({});
    expect(d.cancelada).toBe(false);
    expect(d.motivo).toBe("sem_retorno_interpretavel");
  });
});
