/**
 * Edge Function: inutilizar-nfce  (NFC-e modelo 65 — Leva 11, NFeInutilizacao4)
 *
 * Inutiliza (queima na SEFAZ) uma FAIXA de numeração que pulou e nunca virou
 * nota — para justificar o buraco na sequência. NÃO é cancelamento (Leva 10):
 * cancelar age sobre nota AUTORIZADA; inutilizar age sobre NÚMEROS não emitidos.
 * É iniciado pelo GESTOR (não é fire-and-forget): ele manda a faixa + a
 * justificativa e AGUARDA o desfecho. Sucesso = cStat 102 → linha em
 * nfce_inutilizacoes com o procInutNFe.
 *
 * ┌─ PLUG A CHAVE ────────────────────────────────────────────────────┐
 * │ A assinatura (assinarInutDSig) e a transmissão (TLS mútuo) só       │
 * │ fecham com o A1 real. Sem o certificado, a função VALIDA tudo       │
 * │ (faixa/justificativa/config) e devolve "sem_chave" — NÃO finge      │
 * │ inutilizar. Deploy pós-chave:                                       │
 * │   supabase functions deploy inutilizar-nfce                         │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * SECRET BOUNDARY: A1 (.pfx) + senha só de Deno.env/Vault; nunca em tabela,
 * front, log ou retorno. Cliente Supabase user-scoped (RLS aplica o INSERT na
 * linha do tenant). Nunca loga/retorna segredo.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assinarInutDSig, transmitirInutSefazRS } from "../_shared/nfceTransmissao.ts";
import {
  montarXmlInutilizacao,
  decidirDesfechoInutilizacao,
} from "../../../src/lib/nfceInutilizacao.js";
import { codigoUf } from "../../../src/lib/nfce.js";

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

    // ── 2. Entrada: série + faixa + justificativa (+ ano opcional) ────
    const body = await req.json().catch(() => null);
    const serie = Number(body?.serie);
    const nNFIni = Number(body?.nNFIni);
    const nNFFin = Number(body?.nNFFin);
    const justificativa = String(body?.justificativa ?? "").trim();
    const ano = body?.ano != null && String(body.ano).trim() !== "" ? body.ano : undefined;

    if (!Number.isInteger(serie) || serie < 0 || serie > 999) {
      return json({ error: "Série inválida (0–999)." }, 400);
    }
    if (!Number.isInteger(nNFIni) || nNFIni < 1 || !Number.isInteger(nNFFin) || nNFFin < 1) {
      return json({ error: "Numeração inicial e final devem ser inteiros ≥ 1." }, 400);
    }
    if (nNFFin < nNFIni) {
      return json({ error: "A numeração final deve ser ≥ a inicial." }, 400);
    }
    if (justificativa.length < 15 || justificativa.length > 255) {
      return json({ error: "A justificativa deve ter entre 15 e 255 caracteres." }, 400);
    }

    // ── 3. Config fiscal do tenant (NÃO-secreta) ──────────────────────
    const { data: config, error: cfgError } = await supabase
      .from("tenant_fiscal_config")
      .select("tenant_id, ativo, cnpj, uf, ambiente, url_inutilizacao")
      .single();
    if (cfgError || !config) {
      return json({ error: "Estabelecimento sem configuração fiscal." }, 412);
    }

    // A inutilização usa o AMBIENTE ATUAL do tenant (não o de uma nota).
    const tpAmb = Number(config.ambiente) === 1 ? 1 : 2;
    // cUF deriva da UF da config — nunca hardcodar (multi-tenant, white-label).
    let cUF: string;
    try {
      cUF = codigoUf(config.uf as string);
    } catch {
      return json({ error: "UF do estabelecimento inválida na configuração fiscal." }, 412);
    }

    // ── 4. Segredos (só do Vault/env — nunca do app) ──────────────────
    const certBase64 = Deno.env.get("NFCE_CERT_A1_BASE64"); // ⟵ PLUG A CHAVE
    const certSenha = Deno.env.get("NFCE_CERT_A1_SENHA"); //   ⟵ PLUG A CHAVE
    if (!certBase64 || !certSenha) {
      // Sem certificado não há como assinar/transmitir. Validamos tudo acima
      // e avisamos — NÃO fingimos inutilizar.
      return json({
        status: "sem_chave",
        detalhe: "Faltam os segredos (certificado A1) para assinar e transmitir a inutilização. " +
          "Injete-os via secret e teste em homologação.",
      }, 200);
    }
    if (!config.url_inutilizacao) {
      return json({ error: "Endpoint de inutilização não configurado para o estabelecimento." }, 412);
    }

    // ── 5. Monta o XML (puro) → assina → transmite ────────────────────
    const { xml: xmlInut } = montarXmlInutilizacao({
      cnpj: config.cnpj as string,
      tpAmb,
      serie,
      nNFIni,
      nNFFin,
      ano,
      cUF,
      justificativa,
    });

    const { xmlAssinado } = await assinarInutDSig(xmlInut, { certBase64, certSenha });

    let retorno = null;
    let erroTransmissao: string | null = null;
    try {
      retorno = await transmitirInutSefazRS(xmlAssinado, {
        urlInutilizacao: config.url_inutilizacao as string,
        certBase64,
        certSenha,
      });
    } catch (e) {
      erroTransmissao = String((e as Error)?.message ?? e);
    }

    // ── 6. Desfecho (puro): inutilizada ou rejeitada ──────────────────
    const desfecho = decidirDesfechoInutilizacao({ retornoInterpretado: retorno, erroTransmissao });

    // AA (2 díg) do ano da faixa — usa o informado ou o ano corrente.
    const anoFaixa = Number(
      ano != null ? String(ano).replace(/\D/g, "").slice(-2) : String(new Date().getFullYear()).slice(-2),
    );

    const { error: insError } = await supabase
      .from("nfce_inutilizacoes")
      .insert({
        // tenant_id vem do DEFAULT tenant_atual_id() — não passa pelo front.
        serie,
        nnf_ini: nNFIni,
        nnf_fin: nNFFin,
        ano: anoFaixa,
        justificativa,
        tp_amb: tpAmb,
        status: desfecho.status,
        protocolo: desfecho.protocolo,
        c_stat: desfecho.cStat,
        x_motivo: desfecho.xMotivo,
        xml: desfecho.procInutNFe,
      });
    if (insError) {
      // Sem segredo — só a faixa (pública) e o texto do erro.
      console.error(
        `inutilizar-nfce: insert falhou (série ${serie} faixa ${nNFIni}-${nNFFin}): ${insError.message}`,
      );
      if (desfecho.homologada) {
        return json({
          error: "Inutilização homologada na SEFAZ, mas falhou ao gravar localmente.",
          detalhe: insError.message,
        }, 500);
      }
    }

    // Devolve só documento público (nunca segredo).
    return json({
      status: desfecho.status,
      cStat: desfecho.cStat,
      xMotivo: desfecho.xMotivo,
      detalhe: desfecho.motivo,
    }, 200);
  } catch (e) {
    // Nunca vaza segredo na mensagem de erro.
    return json({ error: "Falha ao inutilizar numeração.", detalhe: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
