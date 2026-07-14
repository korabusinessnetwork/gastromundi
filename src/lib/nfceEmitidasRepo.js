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

// Colunas da LISTA do histórico (Leva 12). Sem `xml` (documento pesado) e sem
// `select *`: só o que a tela mostra por linha. `numero`/`serie` identificam a
// nota; `v_nf` é o valor total; `dh_emi` a data fiscal. `tp_emis`/`url_qrcode`
// são necessários para a reimpressão via `registroInicial` remontar o cupom
// COM o QR Code (obrigatório no DANFE) — mesmo conjunto de COLUNAS_REIMPRESSAO.
const COLUNAS_LISTA =
  "id, venda_id, chave, numero, serie, status, tp_amb, tp_emis, protocolo, v_nf, dh_emi, url_qrcode, created_at";

// Página padrão do histórico — pequena para caber no balcão sem rolar demais.
const TAMANHO_PAGINA_PADRAO = 20;

/**
 * Lista as NFC-e emitidas do estabelecimento para o histórico (Leva 12), com
 * filtros de status / busca por chave / intervalo de datas e paginação.
 *
 * A RLS (20260733) já isola por tenant — NÃO se filtra tenant aqui. Nunca
 * lança: erro vira `{ data: [], error }` para a UI mostrar "tentar de novo".
 *
 * Ordena e filtra por `created_at` (NOT NULL, sempre presente) — `dh_emi` pode
 * ser nulo em linhas de fila; a tela exibe `dh_emi ?? created_at`.
 *
 * @param {{
 *   status?: "todas"|"autorizada"|"pendente"|"rejeitada"|"cancelada",
 *   busca?: string,           // trecho da chave de acesso
 *   de?: string|null,         // ISO — início do intervalo (created_at >=)
 *   ate?: string|null,        // ISO — fim do intervalo (created_at <=)
 *   pagina?: number,          // 0-based
 *   tamanho?: number,
 * }} [filtros]
 * @returns {Promise<{data: object[], error: Error|null, temMais: boolean}>}
 */
export async function listarNfceEmitidas({
  status = "todas",
  busca = "",
  de = null,
  ate = null,
  pagina = 0,
  tamanho = TAMANHO_PAGINA_PADRAO,
} = {}) {
  try {
    let query = supabase.from("nfce_emitidas").select(COLUNAS_LISTA);

    // status "todas" = sem filtro (não aplica .eq).
    if (status && status !== "todas") query = query.eq("status", status);

    const termo = String(busca ?? "").trim();
    if (termo) query = query.ilike("chave", `%${termo}%`);

    if (de) query = query.gte("created_at", de);
    if (ate) query = query.lte("created_at", ate);

    const inicio = Math.max(0, pagina) * tamanho;
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(inicio, inicio + tamanho - 1);

    if (error) return { data: [], error, temMais: false };
    const linhas = data ?? [];
    // Veio a página cheia ⇒ provavelmente há mais.
    return { data: linhas, error: null, temMais: linhas.length === tamanho };
  } catch (err) {
    return { data: [], error: err, temMais: false };
  }
}

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
