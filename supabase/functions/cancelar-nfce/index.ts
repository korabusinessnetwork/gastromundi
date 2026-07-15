/**
 * Edge Function: cancelar-nfce  (NFC-e modelo 65 — Leva 10, EVENTO 110111)
 *
 * Cancela uma NFC-e AUTORIZADA por um evento assinado (RecepcaoEvento4). É
 * iniciado pelo OPERADOR (não é fire-and-forget): ele manda a chave + a
 * justificativa e AGUARDA o desfecho. Sucesso = cStat 135/155 → a nota vira
 * 'cancelada' (mesma linha, UNIQUE tenant_id,chave — nunca duplica).
 *
 * ┌─ PLUG A CHAVE ────────────────────────────────────────────────────┐
 * │ A assinatura do evento (assinarEventoDSig) e a transmissão (TLS    │
 * │ mútuo) só fecham com o A1 real. Sem o certificado, a função VALIDA │
 * │ tudo (status/justificativa/prazo) e devolve "falta certificado" —  │
 * │ NÃO finge cancelar. Deploy pós-chave:                              │
 * │   supabase functions deploy cancelar-nfce                          │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * SECRET BOUNDARY: A1 (.pfx) + senha só de Deno.env/Vault; nunca em tabela,
 * front, log ou retorno. Cliente Supabase user-scoped (RLS aplica o UPDATE
 * na linha do tenant). Nunca loga/retorna segredo.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assinarEventoDSig, transmitirEventoSefazRS } from "../_shared/nfceTransmissao.ts";
import {
  montarXmlEventoCancelamento,
  dentroDoPrazoCancelamento,
  decidirDesfechoCancelamento,
} from "../../../src/lib/nfceEventoCancelamento.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Autentica o chamador e resolve o tenant (RLS) ──────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Sessão inválida." }, 401);

    // ── 2. Entrada: chave + justificativa (+ nSeqEvento opcional) ─────
    const body = await req.json().catch(() => null);
    const chave = String(body?.chave ?? "").replace(/\D/g, "");
    const justificativa = String(body?.justificativa ?? "").trim();
    const nSeqEvento = Number(body?.nSeqEvento ?? 1);
    if (chave.length !== 44) return json({ error: "Chave de acesso inválida." }, 400);
    if (justificativa.length < 15 || justificativa.length > 255) {
      return json({ error: "A justificativa deve ter entre 15 e 255 caracteres." }, 400);
    }

    // ── 3. Config fiscal do tenant (NÃO-secreta) ──────────────────────
    const { data: config, error: cfgError } = await supabase
      .from("tenant_fiscal_config")
      .select("tenant_id, ativo, cnpj, url_recepcao_evento")
      .single();
    if (cfgError || !config) {
      return json({ error: "Estabelecimento sem configuração fiscal." }, 412);
    }

    // ── 4. Lê a nota pela chave (sem select * — só o necessário) ──────
    // RLS isola o tenant. Prevenção de erro: só cancela nota AUTORIZADA.
    const { data: nota, error: notaError } = await supabase
      .from("nfce_emitidas")
      .select("id, status, protocolo, chave, dh_emi, tp_amb")
      .eq("chave", chave)
      .maybeSingle();
    if (notaError) return json({ error: "Falha ao ler a nota.", detalhe: notaError.message }, 500);
    if (!nota) return json({ error: "NFC-e não encontrada para este estabelecimento." }, 404);

    if (nota.status === "cancelada") {
      return json({ status: "cancelada", detalhe: "Esta NFC-e já está cancelada." }, 409);
    }
    if (nota.status !== "autorizada") {
      return json({ error: `Só é possível cancelar uma NFC-e autorizada (status atual: ${nota.status}).` }, 409);
    }
    if (!nota.protocolo) {
      return json({ error: "NFC-e sem protocolo de autorização — não é possível cancelar." }, 409);
    }

    // ── 5. Prazo de cancelamento (constante marcada ⟵ CONFIRMAR) ──────
    if (!dentroDoPrazoCancelamento({ dhEmi: nota.dh_emi })) {
      return json({ error: "Fora do prazo de cancelamento da NFC-e." }, 409);
    }

    const tpAmb = Number(nota.tp_amb) === 1 ? 1 : 2;

    // ── 6. Segredos (só do Vault/env — nunca do app) ──────────────────
    const certBase64 = Deno.env.get("NFCE_CERT_A1_BASE64"); // ⟵ PLUG A CHAVE
    const certSenha = Deno.env.get("NFCE_CERT_A1_SENHA"); //   ⟵ PLUG A CHAVE
    if (!certBase64 || !certSenha) {
      // Sem certificado não há como assinar/transmitir o evento. Validamos
      // tudo acima e avisamos — NÃO fingimos cancelar.
      return json({
        status: "sem_chave",
        detalhe: "Faltam os segredos (certificado A1) para assinar e transmitir o cancelamento. " +
          "Injete-os via secret e teste em homologação.",
      }, 200);
    }
    if (!config.url_recepcao_evento) {
      return json({ error: "Endpoint de recepção de evento não configurado para o estabelecimento." }, 412);
    }

    // ── 7. Monta o XML do evento (puro) → assina → transmite ──────────
    const { xml: xmlEvento } = montarXmlEventoCancelamento({
      chave,
      protocolo: nota.protocolo as string,
      justificativa,
      nSeqEvento,
      cnpj: config.cnpj as string,
      tpAmb,
      // cOrgao deriva da chave (cUF) dentro do montador — multi-tenant.
    });

    const { xmlAssinado } = await assinarEventoDSig(xmlEvento, {
      certBase64,
      certSenha,
    });

    let retorno = null;
    let erroTransmissao: string | null = null;
    try {
      retorno = await transmitirEventoSefazRS(xmlAssinado, {
        urlRecepcaoEvento: config.url_recepcao_evento as string,
        certBase64,
        certSenha,
      });
    } catch (e) {
      erroTransmissao = String((e as Error)?.message ?? e);
    }

    // ── 8. Desfecho (puro): cancelada ou permanece autorizada ─────────
    const desfecho = decidirDesfechoCancelamento({ retornoInterpretado: retorno, erroTransmissao });

    if (desfecho.cancelada) {
      const { error: upError } = await supabase
        .from("nfce_emitidas")
        .update({
          status: "cancelada",
          c_stat: desfecho.cStat,
          x_motivo: desfecho.xMotivo,
          cancelada_em: new Date().toISOString(),
          justificativa_cancelamento: justificativa,
          protocolo_cancelamento: desfecho.protocoloEvento,
          xml_evento: desfecho.procEventoNFe,
          updated_at: new Date().toISOString(),
        })
        .eq("id", nota.id);
      if (upError) {
        // Sem segredo — só a chave (pública) e o texto do erro.
        console.error(`cancelar-nfce: update falhou (chave ${chave}): ${upError.message}`);
        return json({ error: "Cancelamento registrado na SEFAZ, mas falhou ao gravar localmente.", detalhe: upError.message }, 500);
      }
      return json({ status: "cancelada", cStat: desfecho.cStat, xMotivo: desfecho.xMotivo }, 200);
    }

    // Não cancelou: rejeição do evento ou falha de transmissão. A nota
    // permanece autorizada; devolvemos o motivo humano (sem segredo).
    return json({
      status: "autorizada",
      cStat: desfecho.cStat,
      xMotivo: desfecho.xMotivo,
      detalhe: desfecho.motivo,
    }, 200);
  } catch (e) {
    // Nunca vaza segredo na mensagem de erro.
    return json({ error: "Falha ao cancelar NFC-e.", detalhe: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
