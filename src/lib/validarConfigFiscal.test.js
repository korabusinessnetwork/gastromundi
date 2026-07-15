import { describe, it, expect } from "vitest";
import { validarCnpj, validarConfigFiscal } from "./validarConfigFiscal";

// Config mínima e VÁLIDA — cada teste parte daqui e estraga um campo.
const base = () => ({
  cnpj: "11222333000181",
  ie: "1234567",
  razao_social: "Zé Lanches LTDA",
  uf: "RS",
  codigo_municipio: "4314902",
  municipio: "Porto Alegre",
  logradouro: "Rua das Flores",
  numero_end: "100",
  bairro: "Centro",
  cep: "90000000",
  serie: 1,
  ambiente: 2,
  ativo: false,
});

describe("validarCnpj — dígitos verificadores (módulo 11)", () => {
  it("aceita um CNPJ válido, com e sem máscara", () => {
    expect(validarCnpj("11222333000181")).toBe(true);
    expect(validarCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("rejeita dígito verificador errado", () => {
    expect(validarCnpj("11222333000182")).toBe(false);
  });

  it("rejeita comprimento errado e vazio", () => {
    expect(validarCnpj("123")).toBe(false);
    expect(validarCnpj("")).toBe(false);
    expect(validarCnpj(null)).toBe(false);
  });

  it("rejeita todos os dígitos iguais (passaria no módulo 11, mas é inválido)", () => {
    expect(validarCnpj("00000000000000")).toBe(false);
    expect(validarCnpj("11111111111111")).toBe(false);
  });
});

describe("validarConfigFiscal — obrigatórios e formatos", () => {
  it("config completa e válida → ok, sem erros", () => {
    const { ok, erros } = validarConfigFiscal(base());
    expect(ok).toBe(true);
    expect(erros).toEqual({});
  });

  it("CNPJ ausente/ inválido acusa erro no campo", () => {
    expect(validarConfigFiscal(base()).ok).toBe(true);
    expect(validarConfigFiscal({ ...base(), cnpj: "" }).erros.cnpj).toBeTruthy();
    expect(validarConfigFiscal({ ...base(), cnpj: "11222333000182" }).erros.cnpj).toBeTruthy();
  });

  it("IE aceita ISENTO ou dígitos; rejeita lixo", () => {
    expect(validarConfigFiscal({ ...base(), ie: "ISENTO" }).ok).toBe(true);
    expect(validarConfigFiscal({ ...base(), ie: "isento" }).ok).toBe(true);
    expect(validarConfigFiscal({ ...base(), ie: "abc" }).erros.ie).toBeTruthy();
    expect(validarConfigFiscal({ ...base(), ie: "" }).erros.ie).toBeTruthy();
  });

  it("série fora de 1–999 (ou não-inteira) acusa erro", () => {
    expect(validarConfigFiscal({ ...base(), serie: 0 }).erros.serie).toBeTruthy();
    expect(validarConfigFiscal({ ...base(), serie: 1000 }).erros.serie).toBeTruthy();
    expect(validarConfigFiscal({ ...base(), serie: 1.5 }).erros.serie).toBeTruthy();
    expect(validarConfigFiscal({ ...base(), serie: "" }).erros.serie).toBeTruthy();
  });

  it("ambiente só aceita 1 (produção) ou 2 (homologação)", () => {
    expect(validarConfigFiscal({ ...base(), ambiente: 1 }).ok).toBe(true);
    expect(validarConfigFiscal({ ...base(), ambiente: 3 }).erros.ambiente).toBeTruthy();
  });

  it("UF, código IBGE e CEP validam formato", () => {
    expect(validarConfigFiscal({ ...base(), uf: "R" }).erros.uf).toBeTruthy();
    expect(validarConfigFiscal({ ...base(), codigo_municipio: "123" }).erros.codigo_municipio).toBeTruthy();
    expect(validarConfigFiscal({ ...base(), cep: "9000" }).erros.cep).toBeTruthy();
  });

  it("endpoints: formato https:// se preenchidos; obrigatórios só quando ativo", () => {
    // Desligado: URL vazia não é erro, mas URL malformada é.
    expect(validarConfigFiscal({ ...base(), ativo: false }).ok).toBe(true);
    expect(validarConfigFiscal({ ...base(), url_autorizacao: "http://x" }).erros.url_autorizacao).toBeTruthy();

    // Ligado sem endpoints → erro em todos (não dá pra emitir sem eles).
    const ligadoSemUrls = validarConfigFiscal({ ...base(), ativo: true });
    expect(ligadoSemUrls.erros.url_autorizacao).toBeTruthy();
    expect(ligadoSemUrls.erros.url_qrcode).toBeTruthy();
    expect(ligadoSemUrls.erros.url_recepcao_evento).toBeTruthy();
    expect(ligadoSemUrls.erros.url_inutilizacao).toBeTruthy();

    // Ligado com endpoints https válidos → ok.
    const ligadoOk = validarConfigFiscal({
      ...base(), ativo: true,
      url_autorizacao: "https://nfce.sefazrs.rs.gov.br/ws/NFeAutorizacao/NFeAutorizacao4.asmx",
      url_qrcode: "https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx",
      url_recepcao_evento: "https://nfce.sefazrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
      url_inutilizacao: "https://nfce.sefazrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx",
    });
    expect(ligadoOk.ok).toBe(true);
  });

  it("csc_id opcional: aceita até 6 dígitos, rejeita não-numérico/longo", () => {
    expect(validarConfigFiscal({ ...base(), csc_id: "" }).ok).toBe(true);
    expect(validarConfigFiscal({ ...base(), csc_id: "000001" }).ok).toBe(true);
    expect(validarConfigFiscal({ ...base(), csc_id: "1234567" }).erros.csc_id).toBeTruthy();
    expect(validarConfigFiscal({ ...base(), csc_id: "abc" }).erros.csc_id).toBeTruthy();
  });
});
