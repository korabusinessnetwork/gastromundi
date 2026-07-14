import { supabase } from "./supabase";

/**
 * NFC-e (modelo 65) — LEITURA e ESCRITA da configuração fiscal do tenant
 * (Leva 13), consumida pelo PainelFiscal. É o onboarding fiscal do
 * estabelecimento: CNPJ, IE, endereço, série, ambiente, CSC ID e os
 * endpoints públicos da SEFAZ.
 *
 * ┌─ FRONTEIRA DE SEGREDO (o ponto mais crítico desta camada) ────────┐
 * │ Só trafega dado NÃO-secreto. O certificado A1 (.pfx/senha) e o     │
 * │ VALOR do CSC vivem no Vault/Deno.env das Edge Functions e NÃO      │
 * │ existem nesta tabela nem passam por aqui. O `salvarConfigFiscal`   │
 * │ NUNCA espalha o objeto do front no upsert: copia só as colunas do  │
 * │ allow-list explícito abaixo — se algum segredo vier no objeto, ele │
 * │ é descartado antes de tocar o banco.                               │
 * └───────────────────────────────────────────────────────────────────┘
 *
 * Multi-tenant: a RLS (20260731) isola por tenant e o `tenant_id` tem
 * DEFAULT `tenant_atual_id()` (20260735) — o upsert NÃO passa tenant pelo
 * front; o banco resolve o tenant do chamador. Nunca lança: erro vira
 * `{ data: null, error }`.
 */

// Colunas NÃO-secretas editáveis pela tela (sem `select *`). São também as
// chaves do allow-list de escrita — `tenant_id`/`created_at`/`updated_at`
// e o contador `proximo_numero` (gerido pelo fluxo de emissão, 20260732)
// ficam de fora de propósito.
const COLUNAS =
  "cnpj, ie, im, razao_social, nome_fantasia, crt, " +
  "uf, codigo_municipio, municipio, logradouro, numero_end, complemento, bairro, cep, fone, " +
  "ambiente, serie, csc_id, ativo, " +
  "url_qrcode, url_autorizacao, url_recepcao_evento";

// Allow-list explícito de escrita: SÓ estas chaves chegam ao banco. Qualquer
// outra (inclusive tentativa de gravar certificado/CSC-valor/tenant_id) é
// simplesmente ignorada.
const CAMPOS_PERMITIDOS = [
  "cnpj", "ie", "im", "razao_social", "nome_fantasia", "crt",
  "uf", "codigo_municipio", "municipio", "logradouro", "numero_end",
  "complemento", "bairro", "cep", "fone",
  "ambiente", "serie", "csc_id", "ativo",
  "url_qrcode", "url_autorizacao", "url_recepcao_evento",
];

/**
 * Lê a configuração fiscal do estabelecimento atual. Pode não existir
 * ainda (tenant sem config) → `{ data: null }`, que a tela trata como
 * "primeiro cadastro". Nunca lança.
 *
 * @returns {Promise<{data: object|null, error: Error|null}>}
 */
export async function buscarConfigFiscal() {
  try {
    const { data, error } = await supabase
      .from("tenant_fiscal_config")
      .select(COLUNAS)
      .maybeSingle();
    if (error) return { data: null, error };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Cria ou atualiza a configuração fiscal do tenant atual (upsert). Copia
 * apenas as colunas do allow-list — nunca o objeto cru do front. O
 * `tenant_id` vem do DEFAULT `tenant_atual_id()` (não do front) e a RLS
 * garante que cada estabelecimento só grava a própria linha. Retorna a
 * linha salva. Nunca lança.
 *
 * @param {Record<string, unknown>} [campos]
 * @returns {Promise<{data: object|null, error: Error|null}>}
 */
export async function salvarConfigFiscal(campos = {}) {
  try {
    const entrada = campos || {};
    const payload = {};
    for (const chave of CAMPOS_PERMITIDOS) {
      if (entrada[chave] !== undefined) payload[chave] = entrada[chave];
    }
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("tenant_fiscal_config")
      .upsert(payload, { onConflict: "tenant_id" })
      .select(COLUNAS)
      .maybeSingle();
    if (error) return { data: null, error };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}
