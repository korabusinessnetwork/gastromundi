import { supabase } from "./supabase";

/**
 * NFC-e (modelo 65) — leitura das notas emitidas (Leva 9). Acesso de LEITURA
 * a public.nfce_emitidas para a reimpressão do cupom. A RLS (migration
 * 20260733) já isola por tenant — aqui só se lê a linha da venda do próprio
 * estabelecimento. NUNCA `select *` numa tabela fiscal: só as colunas que a
 * reimpressão precisa (chave, protocolo, urlQrCode, tp_amb, tp_emis, dh_emi).
 *
 * FRONTEIRA DE SEGREDO: a tabela guarda só documento público; nada de
 * certificado/CSC entra ou sai. O `xml` (nfeProc) não é lido aqui — a DANFE
 * é remontada dos campos + itens/pagamentos da venda (ver nfceReimpressao).
 */

// Colunas necessárias para reabrir o cupom (nfce_emitidas_venda_idx cobre a
// busca por tenant+venda). Sem xml — a reimpressão remonta a DANFE.
const COLUNAS_REIMPRESSAO =
  "id, venda_id, chave, protocolo, status, tp_amb, tp_emis, dh_emi, url_qrcode, created_at";

/**
 * Busca a NFC-e mais recente ligada a uma venda do PDV. Usada para habilitar
 * (ou não) a reimpressão e mostrar o estado humano da nota.
 *
 * @param {string} vendaId  uuid da venda
 * @returns {Promise<{data: object|null, error: Error|null}>}
 */
export async function buscarNfcePorVenda(vendaId) {
  if (!vendaId) return { data: null, error: null };
  try {
    const { data, error } = await supabase
      .from("nfce_emitidas")
      .select(COLUNAS_REIMPRESSAO)
      .eq("venda_id", vendaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { data: null, error };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}
