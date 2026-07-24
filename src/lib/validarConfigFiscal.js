/**
 * Validação PURA da configuração fiscal do tenant (Leva 13) — sem I/O,
 * testável com fixtures. É a fonte de verdade da prevenção-de-erro do
 * PainelFiscal (Princípio nº1): cada mensagem é humana e pronta para
 * exibir sob o campo, e o botão Salvar fica desabilitado enquanto `ok`
 * for falso.
 *
 * FRONTEIRA DE SEGREDO: nunca valida nem menciona certificado A1 ou o
 * VALOR do CSC — esses vivem no Vault/Deno.env e não passam por esta tela.
 * O `csc_id` validado aqui é só o IDENTIFICADOR (idToken, até 6 dígitos),
 * que vai em claro no QR Code — não é segredo.
 */

import { validarCnpj } from "./documento";

// `validarCnpj` foi centralizado em ./documento (reúso entre o CPF/CNPJ do
// cadastro de clientes e esta validação fiscal). Reexportado aqui por
// compatibilidade com quem já importa de validarConfigFiscal.
export { validarCnpj };

const OBRIGATORIO = "Campo obrigatório.";

/**
 * Valida os campos da configuração fiscal. Retorna `{ ok, erros }` com
 * `erros` chaveado pelo NOME da coluna (mesma chave usada no estado do
 * formulário e no allow-list do repositório) para ligar mensagem ↔ campo.
 *
 * Regra de ativação (prevenção de erro): os endpoints da SEFAZ só são
 * OBRIGATÓRIOS quando `ativo` é verdadeiro — não dá para ligar a emissão
 * real sem as URLs. Enquanto em rascunho/homologação desligado, valida só
 * o FORMATO (https://…) se preenchidos.
 *
 * @param {Record<string, unknown>} [campos]
 * @returns {{ ok: boolean, erros: Record<string, string> }}
 */
export function validarConfigFiscal(campos = {}) {
  const c = campos || {};
  const erros = {};
  const texto = (v) => String(v ?? "").trim();

  // ── Identidade ───────────────────────────────────────────────────
  if (!texto(c.cnpj)) erros.cnpj = OBRIGATORIO;
  else if (!validarCnpj(c.cnpj)) erros.cnpj = "CNPJ inválido — confira os 14 dígitos.";

  const ie = texto(c.ie);
  if (!ie) erros.ie = OBRIGATORIO;
  else if (!/^isento$/i.test(ie) && !/^\d{2,14}$/.test(ie.replace(/\D/g, "")))
    erros.ie = "Informe a Inscrição Estadual (só números) ou ISENTO.";

  if (!texto(c.razao_social)) erros.razao_social = OBRIGATORIO;

  if (texto(c.crt) !== "" && ![1, 2, 3].includes(Number(c.crt)))
    erros.crt = "Selecione um regime tributário válido.";

  // ── Endereço ─────────────────────────────────────────────────────
  const uf = texto(c.uf);
  if (!uf) erros.uf = OBRIGATORIO;
  else if (!/^[A-Za-z]{2}$/.test(uf)) erros.uf = "Use a sigla de 2 letras (ex.: RS).";

  const cmun = texto(c.codigo_municipio).replace(/\D/g, "");
  if (!cmun) erros.codigo_municipio = OBRIGATORIO;
  else if (!/^\d{7}$/.test(cmun)) erros.codigo_municipio = "O código IBGE tem 7 dígitos.";

  if (!texto(c.municipio)) erros.municipio = OBRIGATORIO;
  if (!texto(c.logradouro)) erros.logradouro = OBRIGATORIO;
  if (!texto(c.numero_end)) erros.numero_end = OBRIGATORIO;
  if (!texto(c.bairro)) erros.bairro = OBRIGATORIO;

  const cep = texto(c.cep).replace(/\D/g, "");
  if (!cep) erros.cep = OBRIGATORIO;
  else if (!/^\d{8}$/.test(cep)) erros.cep = "O CEP tem 8 dígitos.";

  // ── Emissão ──────────────────────────────────────────────────────
  // A série tem CHECK `serie >= 1` no schema (20260731) — validamos 1–999
  // para casar com o banco (a spec citava 0–999; ver relatório).
  if (texto(c.serie) === "") erros.serie = OBRIGATORIO;
  else {
    const serie = Number(c.serie);
    if (!Number.isInteger(serie) || serie < 1 || serie > 999)
      erros.serie = "A série é um número inteiro de 1 a 999.";
  }

  if (Number(c.ambiente) !== 1 && Number(c.ambiente) !== 2)
    erros.ambiente = "Selecione Produção ou Homologação.";

  if (texto(c.csc_id) !== "" && !/^\d{1,6}$/.test(texto(c.csc_id)))
    erros.csc_id = "O ID do CSC tem até 6 dígitos.";

  // ── Endpoints da SEFAZ ───────────────────────────────────────────
  const ligada = c.ativo === true || c.ativo === "true";
  for (const campo of ["url_autorizacao", "url_qrcode", "url_recepcao_evento", "url_inutilizacao"]) {
    const v = texto(c[campo]);
    if (!v) {
      if (ligada) erros[campo] = "Necessário para ativar a emissão fiscal.";
    } else if (!/^https:\/\/[^\s]+$/i.test(v)) {
      erros[campo] = "A URL deve começar com https://";
    }
  }

  return { ok: Object.keys(erros).length === 0, erros };
}
