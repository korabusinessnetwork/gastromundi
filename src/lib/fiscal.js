import { supabase } from "./supabase";
import { emitirEvento } from "./jarvas";
import { montarVendaFiscal } from "./nfceVenda";

/**
 * Fiscal (NFC-e modelo 65) — add-on pago transversal (decisão 019, F019).
 *
 * Leva 4: o fluxo agora está FECHADO — `emitirDocumentoFiscal` chama a Edge
 * Function `emitir-nfce` (integração DIRETA com a SEFAZ, caminho gratuito,
 * sem provedor pago — Restrições de Custo). A função de borda é o servidor
 * do fluxo fiscal: monta o XML (Leva 2), assina, gera o QR (Leva 3) e
 * transmite. Enquanto o certificado A1 + CSC não estiverem injetados, ela
 * responde `status: "sem_chave"` — e este módulo mapeia isso para um
 * resultado, não uma exceção.
 *
 * INVARIANTE (não muda desde o stub): nunca lança. Falha de emissão é um
 * RESULTADO (`status: "erro"|"sem_chave"|"rejeitada"`), nunca uma exceção —
 * a venda já foi concluída e não pode ser desfeita por causa da nota. Quem
 * chama (useFinalizarPagamento, fire-and-forget) já conta com isso.
 *
 * Só é chamado quando `addonHabilitado('nfe')` é verdadeiro — sem o add-on,
 * o fluxo de pagamento nem invoca este módulo.
 *
 * FRONTEIRA DE SEGREDO intacta: o front só manda a venda e o token do
 * caixa. O certificado e o CSC vivem no servidor (Edge Function/Vault); o
 * app nunca os toca.
 */

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emitir-nfce`;
const EDGE_URL_CANCELAR = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancelar-nfce`;

/**
 * Emite o documento fiscal (NFC-e) de uma venda via Edge Function.
 *
 * @param {{id?: string, total?: number, comanda?: string, items?: Array, pagamentos?: Array, dest?: object}} venda
 * @param {{usuario?: string, tpEmis?: 1|9}} [opts] tpEmis 9 = contingência offline
 * @returns {Promise<{status: "autorizada"|"rejeitada"|"sem_chave"|"erro",
 *   vendaId: string|null, chave?: string|null, protocolo?: string|null, detalhe?: string,
 *   emit?: object|null, tpAmb?: number|null, tpEmis?: number|null,
 *   dhEmi?: string|null, urlQrCode?: string|null}>}
 */
export async function emitirDocumentoFiscal(venda, { usuario, tpEmis = 1 } = {}) {
  const vendaId = venda?.id ?? null;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return finalizar({ status: "erro", vendaId, detalhe: "Sessão expirada." }, venda, usuario);
    }

    // Mapeia a venda do PDV para o contrato de emissão (itens/pagamentos/dest).
    const { itens, pagamentos, dest } = montarVendaFiscal(venda);

    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      // vendaId (uuid não-sensível): liga a nota emitida à venda do PDV para
      // reimpressão (Leva 8). A Edge grava em nfce_emitidas.venda_id.
      body: JSON.stringify({ tpEmis, vendaId, venda: { itens, pagamentos, dest } }),
    });

    const json = await res.json().catch(() => ({}));

    // A Edge Function devolve status "sem_chave" | "autorizada" | "rejeitada".
    // Erros HTTP (config ausente, sessão inválida) viram status "erro" — nunca
    // exceção. O status desconhecido também cai em "erro" (fail-safe).
    const status = res.ok && json?.status ? json.status : "erro";
    const resultado = {
      status: ["autorizada", "rejeitada", "sem_chave"].includes(status) ? status : "erro",
      vendaId,
      chave: json?.chave ?? null,
      protocolo: json?.protocolo ?? null,
      detalhe: json?.detalhe ?? json?.error ?? null,
      // Bloco NÃO-secreto do cupom (Leva 7) — a modal do PDV monta a DANFE
      // com isto. `emit`/`tpAmb`/`tpEmis`/`dhEmi` vêm em todos os status menos
      // "erro"; `urlQrCode` só quando há chave/QR (ausente em sem_chave).
      emit: json?.emit ?? null,
      tpAmb: json?.tpAmb ?? null,
      tpEmis: json?.tpEmis ?? tpEmis ?? null,
      dhEmi: json?.dhEmi ?? null,
      urlQrCode: json?.urlQrCode ?? null,
    };
    return finalizar(resultado, venda, usuario);
  } catch (err) {
    // Falha de rede/inesperada: resultado "erro", nunca lança.
    return finalizar(
      { status: "erro", vendaId, detalhe: err?.message ?? "Falha ao emitir NFC-e." },
      venda,
      usuario,
    );
  }
}

/**
 * Cancela uma NFC-e autorizada (evento 110111) via Edge Function `cancelar-nfce`.
 *
 * Diferente da emissão (fire-and-forget), o cancelamento é INICIADO pelo
 * operador e ele AGUARDA o desfecho (a UI mostra spinner + resultado). Trata
 * erro sem vazar nada. Não lança: falha vira um RESULTADO.
 *
 * @param {{ chave: string, justificativa: string, nSeqEvento?: number }} p
 * @returns {Promise<{status: "cancelada"|"autorizada"|"sem_chave"|"erro",
 *   cStat?: string|null, xMotivo?: string|null, detalhe?: string|null}>}
 */
export async function cancelarDocumentoFiscal({ chave, justificativa, nSeqEvento } = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { status: "erro", detalhe: "Sessão expirada." };
    }

    const res = await fetch(EDGE_URL_CANCELAR, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ chave, justificativa, nSeqEvento }),
    });

    const json = await res.json().catch(() => ({}));
    // "cancelada" = sucesso; "autorizada" = evento rejeitado (nota segue
    // valendo); "sem_chave" = falta certificado; senão "erro".
    const status = json?.status;
    const conhecido = ["cancelada", "autorizada", "sem_chave"].includes(status);
    return {
      status: res.ok && conhecido ? status : "erro",
      cStat: json?.cStat ?? null,
      xMotivo: json?.xMotivo ?? null,
      detalhe: json?.detalhe ?? json?.error ?? null,
    };
  } catch (err) {
    return { status: "erro", detalhe: err?.message ?? "Falha ao cancelar NFC-e." };
  }
}

/**
 * Lê a identidade do EMITENTE (config fiscal do tenant) para o cabeçalho do
 * cupom na reimpressão do histórico (Leva 12). A RLS (20260731) isola o tenant.
 *
 * FRONTEIRA DE SEGREDO: seleciona SÓ colunas públicas (razão social, CNPJ,
 * endereço). Nunca lê certificado nem CSC — o valor do CSC nem existe nesta
 * tabela (vive no Vault/Deno.env). Nunca lança: falha vira `null`.
 *
 * @returns {Promise<object|null>} emit no shape que <ModalCupomNfce> consome
 */
export async function buscarEmitenteFiscal() {
  try {
    const { data, error } = await supabase
      .from("tenant_fiscal_config")
      .select("cnpj, ie, razao_social, nome_fantasia, logradouro, numero_end, bairro, municipio, uf")
      .maybeSingle();
    if (error || !data) return null;
    return {
      xNome: data.razao_social ?? "",
      xFant: data.nome_fantasia ?? "",
      cnpj: data.cnpj ?? "",
      ie: data.ie ?? "",
      xLgr: data.logradouro ?? "",
      nro: data.numero_end ?? "",
      xBairro: data.bairro ?? "",
      xMun: data.municipio ?? "",
      uf: data.uf ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Registra o desfecho como evento (Jarvas/Event Bus) — fire-and-forget,
 * observabilidade sem bloquear — e devolve o resultado inalterado.
 */
function finalizar(resultado, venda, usuario) {
  emitirEvento(
    "fiscal.nfce_emissao",
    "fiscal",
    {
      venda_id: resultado.vendaId,
      status: resultado.status,
      total: venda?.total ?? null,
      comanda: venda?.comanda ?? null,
      chave: resultado.chave ?? null,
    },
    usuario,
  );
  return resultado;
}
