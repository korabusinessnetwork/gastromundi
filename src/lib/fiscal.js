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
      body: JSON.stringify({ tpEmis, venda: { itens, pagamentos, dest } }),
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
