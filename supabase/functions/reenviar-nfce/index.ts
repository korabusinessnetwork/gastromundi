/**
 * Edge Function: reenviar-nfce  (NFC-e modelo 65 — Leva 9, WORKER de fila)
 *
 * Fecha o ciclo da CONTINGÊNCIA: varre as notas `status='pendente'` de
 * public.nfce_emitidas (nfce_emitidas_pendentes_idx) do tenant do chamador e
 * RETRANSMITE o XML já assinado que ficou guardado (xml_tipo='assinado').
 * NÃO reassina nem remonta o XML — o assinado da contingência já É o
 * documento; reassinar mudaria a chave. Cada linha é atualizada no lugar
 * (UNIQUE tenant_id,chave), nunca duplicada.
 *
 * ┌─ AGENDAMENTO (LIGAR DEPOIS DA CHAVE) ─────────────────────────────┐
 * │ O disparo periódico (Supabase pg_cron / scheduled functions) é     │
 * │ GRATUITO, mas é passo de painel e só vale com o A1 + TLS mútuo     │
 * │ funcionando. NÃO configurar agora — deixar documentado. Enquanto   │
 * │ isso, o worker também aceita POST manual (o dia do teste em        │
 * │ homologação): chama-se a função e ela devolve o resumo da fila.    │
 * │   supabase functions deploy reenviar-nfce                          │
 * │   (cron: select cron.schedule('reenvio-nfce','*/5 * * * *', $$     │
 * │     select net.http_post('.../functions/v1/reenviar-nfce', ...) $$)│
 * └────────────────────────────────────────────────────────────────────┘
 *
 * PLUG A CHAVE: o A1 e o VALOR do CSC vêm SÓ de Deno.env (Vault), igual à
 * emitir-nfce. Sem a chave, o worker roda, varre a fila e devolve o resumo,
 * mas NENHUMA transmissão fecha (TLS mútuo exige o A1) — comportamento
 * esperado. Cliente Supabase user-scoped (RLS aplica o UPDATE na linha do
 * tenant). Nunca lança para o cliente; nunca loga/retorna segredo.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { transmitirSefazRS } from "../_shared/nfceTransmissao.ts";
import { decidirDesfechoReenvio } from "../../../src/lib/decidirDesfechoReenvio.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Teto de itens por rodada — usa o índice parcial de pendentes; o resto fica
// para a próxima chamada/agendamento (backoff é do schedule, não daqui).
const LIMITE_LOTE = 20;

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

    // ── 2. Config fiscal do tenant (NÃO-secreta) — precisa da URL SEFAZ ──
    const { data: config, error: cfgError } = await supabase
      .from("tenant_fiscal_config")
      .select("tenant_id, ativo, url_autorizacao")
      .single();
    if (cfgError || !config) {
      return json({ error: "Estabelecimento sem configuração fiscal." }, 412);
    }

    // ── 3. Segredos do tenant (só do Vault/env — nunca do app) ────────
    const certBase64 = Deno.env.get("NFCE_CERT_A1_BASE64"); // ⟵ PLUG A CHAVE
    const certSenha = Deno.env.get("NFCE_CERT_A1_SENHA"); //   ⟵ PLUG A CHAVE
    const segredosProntos = Boolean(certBase64 && certSenha);

    // ── 4. Lê a FILA de pendentes do tenant (sem select *) ────────────
    // Ordena por created_at (mais antigas primeiro) e limita o lote.
    const { data: pendentes, error: filaError } = await supabase
      .from("nfce_emitidas")
      .select("id, chave, xml, xml_tipo, tentativas")
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(LIMITE_LOTE);
    if (filaError) {
      return json({ error: "Falha ao ler a fila de contingência.", detalhe: filaError.message }, 500);
    }

    const resumo = {
      processadas: 0, autorizadas: 0, rejeitadas: 0, aindaPendentes: 0, falhas: 0,
      total: pendentes?.length ?? 0,
      // Sem a chave, o worker varre mas não transmite — sinaliza o motivo.
      segredosProntos,
    };

    // ── 5. Reenvia cada linha, isolando falhas (nunca derruba o lote) ──
    for (const linha of pendentes ?? []) {
      resumo.processadas += 1;
      try {
        // Sem o XML assinado guardado não há o que retransmitir: registra o
        // motivo, incrementa a tentativa e SEGUE (não some com a nota).
        if (linha.xml_tipo !== "assinado" || !linha.xml) {
          resumo.falhas += 1;
          await atualizarLinha(supabase, linha.id, {
            tentativas: (Number(linha.tentativas) || 0) + 1,
            motivo: "sem_xml_assinado_para_reenvio",
            updated_at: agora(),
          });
          continue;
        }

        // Sem certificado: não dá para transmitir. Conta como ainda-pendente
        // (sem incrementar tentativa — não houve envio real) e segue.
        if (!segredosProntos) {
          resumo.aindaPendentes += 1;
          continue;
        }

        let retorno = null;
        let erroTransmissao: string | null = null;
        try {
          retorno = await transmitirSefazRS(linha.xml as string, {
            urlAutorizacao: config.url_autorizacao as string,
            certBase64: certBase64!,
            certSenha: certSenha!,
          });
        } catch (e) {
          erroTransmissao = String((e as Error)?.message ?? e);
        }

        const desfecho = decidirDesfechoReenvio({
          retornoInterpretado: retorno,
          erroTransmissao,
          tentativasAtuais: Number(linha.tentativas) || 0,
        });

        const patch: Record<string, unknown> = {
          status: desfecho.status,
          tentativas: desfecho.tentativas,
          motivo: desfecho.motivo,
          c_stat: desfecho.cStat,
          x_motivo: desfecho.xMotivo,
          updated_at: agora(),
        };
        if (desfecho.status === "autorizada") {
          resumo.autorizadas += 1;
          patch.protocolo = desfecho.protocolo;
          // Guarda o nfeProc autorizado para REIMPRESSÃO (xml_tipo='proc').
          if (desfecho.nfeProc) {
            patch.xml = desfecho.nfeProc;
            patch.xml_tipo = "proc";
          }
          // Carimbo REAL do recebimento pela SEFAZ (corrige a imprecisão da
          // Leva 8, que usava o dhEmi). Fallback: agora.
          patch.transmitida_em = desfecho.dhRecbto ?? agora();
        } else if (desfecho.status === "rejeitada") {
          resumo.rejeitadas += 1;
          patch.protocolo = desfecho.protocolo;
        } else {
          resumo.aindaPendentes += 1;
        }

        await atualizarLinha(supabase, linha.id, patch);
      } catch (e) {
        // Qualquer imprevisto numa linha não derruba o lote. Log sem segredo.
        resumo.falhas += 1;
        console.error(`reenviar-nfce: falha na linha (chave ${linha.chave}): ${String((e as Error)?.message ?? e)}`);
      }
    }

    return json(resumo, 200);
  } catch (e) {
    return json({ error: "Falha ao reenviar a fila de NFC-e.", detalhe: String((e as Error)?.message ?? e) }, 500);
  }
});

/** Atualiza a linha da fila. RLS garante que só a linha do tenant muda. */
async function atualizarLinha(
  supabase: ReturnType<typeof createClient>,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("nfce_emitidas").update(patch).eq("id", id);
  if (error) {
    // Sem segredo — só o id (não é sensível) e o texto do erro.
    console.error(`reenviar-nfce: update falhou (id ${id}): ${error.message}`);
  }
}

function agora(): string {
  return new Date().toISOString();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
