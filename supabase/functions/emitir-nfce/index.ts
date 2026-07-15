/**
 * Edge Function: emitir-nfce  (NFC-e modelo 65 — Leva 3, ARCABOUÇO)
 *
 * Integração DIRETA com a SEFAZ (caminho gratuito, sem provedor pago —
 * Restrições de Custo). Esta função é o SERVIDOR do fluxo fiscal: recebe
 * uma venda, monta o XML (Leva 2), ASSINA (XML-DSig), monta o QR Code
 * (Leva 3, hash CSC), TRANSMITE à SEFAZ-RS e trata o retorno.
 *
 * ┌─ ESTADO: "PRONTO PRA POR A CHAVE" ────────────────────────────────┐
 * │ O pipeline inteiro está montado e as partes PURAS (chave, XML, QR) │
 * │ já têm testes. Faltam SÓ os dois passos que dependem do CERTIFICADO│
 * │ e da SEFAZ, marcados abaixo com `// ⟵ PLUG A CHAVE AQUI`:          │
 * │   1. assinarXmlDSig()   — assina com o certificado A1 (segredo)    │
 * │   2. transmitirSefazRS()— envia o SOAP e lê a autorização         │
 * │ Quando o dono tiver o certificado A1 + o CSC, injeta-se via secret │
 * │ e testa-se em HOMOLOGAÇÃO (tpAmb=2). Nada além disso muda.         │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * SECRET BOUNDARY (nunca ao front, nunca em tabela lida pelo app):
 *   - CERTIFICADO A1 (.pfx base64) + senha  → Deno.env / Supabase Vault
 *   - CSC (valor) + idCSC                    → Deno.env / Supabase Vault
 *   A tabela tenant_fiscal_config guarda só o NÃO-secreto (CNPJ, IE, CRT,
 *   série, ambiente, URLs). O segredo vive fora dela. O front chama esta
 *   função com o JWT do caixa; a função resolve o tenant e lê os segredos
 *   DAQUELE tenant do cofre — o app nunca toca no certificado nem no CSC.
 *
 * Multi-tenant (decisão 002/028): tudo que varia por estabelecimento vem
 * de tenant_fiscal_config + dos secrets do tenant. Um cliente do Simples
 * e um do Regime Normal usam esta MESMA função — o CRT decide o grupo de
 * ICMS lá no montador do XML (Leva 2).
 *
 * Deploy (quando a chave chegar):
 *   supabase functions deploy emitir-nfce --no-verify-jwt
 *   supabase secrets set NFCE_CERT_A1_BASE64=... NFCE_CERT_A1_SENHA=... \
 *                        NFCE_CSC_VALOR=... NFCE_CSC_ID=...
 *   (segredos por-tenant: ver "Resolução de segredos" abaixo)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Núcleo PURO e testado, reaproveitado do front (mesma verdade fiscal):
import { montarXmlNfce } from "../../../src/lib/nfceXml.js";
import { montarQrCodeNfce, montarQrCodeNfceContingencia } from "../../../src/lib/nfceQrCode.js";
import { montarItemFiscal } from "../../../src/lib/nfceItemFiscal.js";
import { digestInfNfe } from "../../../src/lib/nfceAssinatura.js";
import { montarRegistroNfceEmitida } from "../../../src/lib/nfceRegistro.js";
import { montarNotaPendenteTransmissao } from "../../../src/lib/nfceContingencia.js";
import {
  decidirTpEmisInicial,
  deveEntrarContingencia,
  deveSairContingencia,
  decidirDesfechoEmissao,
} from "../../../src/lib/nfceContingenciaDecisao.js";
// Transmissão à SEFAZ (assina + TLS mútuo com o A1) — compartilhada com o
// worker de reenvio (reenviar-nfce). As ÚNICAS funções que tocam no segredo.
import { assinarXmlDSig, transmitirSefazRS } from "../_shared/nfceTransmissao.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Autentica o chamador (caixa/operador) e resolve o tenant ───
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Sessão inválida." }, 401);

    // ── 2. Carrega a config fiscal do tenant (NÃO-secreta) ────────────
    // RLS de tenant_fiscal_config garante que só vem a linha do tenant do
    // chamador (tenant_atual_id()). Sem select * (dados fiscais sensíveis).
    const { data: config, error: cfgError } = await supabase
      .from("tenant_fiscal_config")
      .select(
        "tenant_id, ativo, ambiente, cnpj, ie, crt, uf, codigo_municipio, municipio, " +
          "logradouro, numero_end, bairro, cep, fone, razao_social, nome_fantasia, " +
          "serie, proximo_numero, csc_id, url_qrcode, url_autorizacao, contingencia_ativa",
      )
      .single();
    if (cfgError || !config) {
      return json({ error: "Estabelecimento sem configuração fiscal." }, 412);
    }
    if (!config.ativo) {
      return json({ error: "Emissão fiscal não está ativa para este estabelecimento." }, 412);
    }

    // ── 3. Lê a venda e o tipo de emissão do corpo da requisição ──────
    const body = await req.json().catch(() => null);
    if (!body?.venda) return json({ error: "Venda ausente no corpo." }, 400);
    const { venda } = body;
    // vendaId (uuid da venda do PDV) — dado NÃO-sensível, liga a nota emitida
    // à venda para reimpressão (Leva 8). Ausente em reenvios avulsos.
    const vendaId = typeof body.vendaId === "string" ? body.vendaId : null;

    // tpEmis INICIAL (Leva 4/14): 1 = emissão normal (online), 9 =
    // CONTINGÊNCIA offline (cupom sai na hora, transmite depois). A DECISÃO
    // mora no servidor (núcleo puro): se o tenant já está em contingência (a
    // SEFAZ caiu antes), sai direto em 9 — pula a tentativa online lenta a
    // cada venda; senão normaliza o solicitado. Valor inválido → 400
    // (prevenção de erro). `tpEmis` é `let` porque o auto-fallback (passo 10c)
    // pode trocá-lo para 9 numa mesma emissão.
    let tpEmis: 1 | 9;
    try {
      tpEmis = decidirTpEmisInicial({
        contingenciaAtiva: Boolean(config.contingencia_ativa),
        tpEmisSolicitado: body.tpEmis,
      });
    } catch {
      return json({ error: "tpEmis inválido (só 1 = normal ou 9 = contingência)." }, 400);
    }

    // ── 4. Resolve os SEGREDOS do tenant (certificado A1 + CSC) ───────
    // "Pronto pra por a chave": hoje lê do env global; quando houver mais
    // de um tenant emitindo, troca-se por lookup por tenant no Vault
    // (ex.: NFCE_CERT_A1_BASE64__<tenantId>). O app JAMAIS recebe isto.
    const certBase64 = Deno.env.get("NFCE_CERT_A1_BASE64"); // ⟵ PLUG A CHAVE
    const certSenha = Deno.env.get("NFCE_CERT_A1_SENHA"); //   ⟵ PLUG A CHAVE
    const cscValor = Deno.env.get("NFCE_CSC_VALOR"); //        ⟵ PLUG A CHAVE (só o VALOR é segredo)
    const cscId = config.csc_id; // idCSC NÃO é segredo — vem da config do tenant.
    const segredosProntos = Boolean(certBase64 && certSenha && cscValor && cscId);

    const tpAmb = Number(config.ambiente) === 1 ? 1 : 2; // 2 = homologação (seguro)
    const codigoNumerico = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    // Data de emissão ÚNICA para toda a requisição — o mesmo dhEmi vai no XML
    // e volta no JSON, para o cupom (DANFE) bater com a nota. (Leva 7)
    const dataEmissao = new Date();

    // Identidade NÃO-secreta do emitente para o cupom (Leva 7). Só campos já
    // selecionados de tenant_fiscal_config — nada de certificado/CSC aqui.
    const emitCupom = montarEmitCupom(config);

    // ── 4b. Enriquece os itens com o CADASTRO FISCAL do produto (Leva 5) ──
    // Carrega itens_fiscal (uma linha por produto) e liga NCM/CFOP/ICMS a
    // cada item da venda. O client está escopado ao tenant (Authorization do
    // caixa) — a RLS de itens_fiscal cuida do isolamento; ainda assim, nunca
    // select * numa tabela fiscal: só as colunas que o montador precisa.
    // Se algum produto não tiver cadastro fiscal completo, NÃO seguimos —
    // devolvemos QUAIS produtos precisam de cadastro (prevenção de erro).
    const { itens: itensEnriquecidos, faltando } = await enriquecerItensFiscais(
      supabase,
      Number(config.crt),
      venda,
    );
    const vendaFiscal = { ...venda, itens: itensEnriquecidos };

    // ── 5. "Sem chave": material para conferência, SEM consumir número ──
    // Sem certificado/CSC não há emissão real — então NÃO gastamos um nNF
    // (o incremento atômico do passo 6 só roda quando a nota vai de fato à
    // SEFAZ). Usamos o proximo_numero atual só para montar um XML de
    // inspeção. Item sem dados fiscais (NCM/CFOP do produto) não derruba
    // este estado: devolvemos sem_chave com o detalhe do que falta. É o
    // "material pronto" antes de por a chave — a Leva 4 roda inteira aqui.
    if (!segredosProntos) {
      let chave: string | null = null;
      let xml: string | null = null;
      let detalheItens: string | null = null;
      // Só monta a prévia quando o cadastro fiscal está completo; caso
      // contrário o detalhe abaixo já diz quais produtos faltam cadastrar.
      if (faltando.length === 0) {
        try {
          const previa = montarXmlNfce(
            montarEntradaXml({ config, venda: vendaFiscal, numero: config.proximo_numero ?? 1, codigoNumerico, tpAmb, tpEmis, dataEmissao }),
          );
          chave = previa.chave;
          xml = previa.xml;
        } catch (e) {
          detalheItens = String((e as Error)?.message ?? e);
        }
      }
      return json(
        {
          status: "sem_chave",
          detalhe:
            "Faltam os segredos (certificado A1 + CSC) para assinar, gerar o QR e " +
            "transmitir. Injete-os via secret e teste em homologação." +
            (faltando.length ? ` Cadastro fiscal pendente: ${descreverFaltando(faltando)}.` : "") +
            (detalheItens ? ` (dados fiscais do item pendentes: ${detalheItens})` : ""),
          tpEmis,
          contingencia: tpEmis === 9,
          cadastroFiscalPendente: faltando,
          chave,
          xml, // não-assinado; para conferência em homologação
          // Bloco NÃO-secreto do cupom: permite a PRÉVIA do layout (tarja
          // "SEM VALOR FISCAL") antes do certificado chegar. Sem QR (sem CSC).
          emit: emitCupom,
          tpAmb,
          dhEmi: dataEmissao.toISOString(),
        },
        200,
      );
    }

    // ── 5b. Completude fiscal é PRÉ-REQUISITO da emissão real ─────────
    // Prevenção de erro > erro: se algum produto não tem cadastro fiscal
    // completo, não numeramos (não chamamos a RPC) nem vamos à SEFAZ —
    // devolvemos exatamente quais produtos o operador precisa cadastrar.
    if (faltando.length > 0) {
      return json(
        {
          status: "erro",
          detalhe: `Cadastro fiscal pendente: ${descreverFaltando(faltando)}.`,
          cadastroFiscalPendente: faltando,
        },
        422,
      );
    }

    // ── 6. Emissão real: reserva o número de forma ATÔMICA (Leva 4) ───
    // RPC proximo_numero_nfce faz UPDATE ... RETURNING (20260732): dois
    // caixas concorrentes nunca pegam o mesmo nNF (evita rejeição por
    // duplicidade). Só aqui, no caminho de emissão de verdade, o contador
    // avança — o passo 5 (sem chave) nunca consome número.
    const { data: numero, error: numError } = await supabase.rpc("proximo_numero_nfce", {
      p_tenant_id: config.tenant_id,
    });
    if (numError || numero == null) {
      return json({ error: "Falha ao numerar a NFC-e.", detalhe: numError?.message }, 500);
    }

    // ── 7–9. Monta (mesmo numero/dataEmissao/codigoNumerico) → digest → QR
    // → assina. Extraído numa closure para ser REUSADO no auto-fallback
    // (Leva 14): trocar tpEmis reconstrói XML/chave (o dígito tpEmis está na
    // posição 35 da chave), mas o NÚMERO é reservado UMA vez (passo 6) e
    // reaproveitado — nunca queima nNF nem cria nota duplicada.
    const prepararDocumento = async (tpEmisAtual: 1 | 9) => {
      const { xml, chave } = montarXmlNfce(
        montarEntradaXml({ config, venda: vendaFiscal, numero, codigoNumerico, tpAmb, tpEmis: tpEmisAtual, dataEmissao }),
      );
      // DigestValue do infNFe (puro). Em contingência é o `digVal` do QR
      // offline; por isso vem ANTES do QR (a assinatura cobre só o infNFe).
      const { digestValue } = await digestInfNfe(xml);

      let urlQr: string;
      if (tpEmisAtual === 9) {
        const { dhEmi, vNF, vICMS } = extrairCamposContingencia(xml);
        urlQr = await montarQrCodeNfceContingencia({
          chave, tpAmb, idCsc: cscId, csc: cscValor!, urlConsulta: config.url_qrcode,
          dhEmi, vNF, vICMS, digVal: digestValue,
        });
      } else {
        urlQr = await montarQrCodeNfce({
          chave, tpAmb, idCsc: cscId, csc: cscValor!, urlConsulta: config.url_qrcode,
        });
      }

      const infNFeSupl =
        `<infNFeSupl><qrCode>${escaparXmlTexto(urlQr)}</qrCode>` +
        `<urlChave>${escaparXmlTexto(config.url_qrcode)}</urlChave></infNFeSupl>`;

      // ASSINA (XML-DSig, RSA-SHA1 com o A1). O RSA-sign com a chave privada
      // acontece SÓ aqui dentro (secret boundary).
      const { xmlAssinado } = await assinarXmlDSig(xml, { certBase64: certBase64!, certSenha: certSenha!, infNFeSupl });
      const { vNF } = extrairCamposContingencia(xml);
      return { xml, chave, urlQr, xmlAssinado, vNF };
    };

    // ── 10. TRANSMITE à SEFAZ-RS (SOAP + TLS mútuo, agora com timeout). ───
    // Falha (SEFAZ fora/TLS/timeout) NÃO é erro fatal: a nota vai para a fila
    // de contingência (pendente) e o cupom já saiu — capturamos a exceção
    // aqui em vez de deixá-la cair no catch geral (500).
    const transmitir = async (xmlAssinado: string) => {
      try {
        const retorno = await transmitirSefazRS(xmlAssinado, {
          urlAutorizacao: config.url_autorizacao as string,
          certBase64: certBase64!,
          certSenha: certSenha!,
        });
        return { retorno, erroTransmissao: null as string | null };
      } catch (e) {
        return { retorno: null as Awaited<ReturnType<typeof transmitirSefazRS>> | null, erroTransmissao: String((e as Error)?.message ?? e) };
      }
    };

    let doc = await prepararDocumento(tpEmis);
    let { retorno, erroTransmissao } = await transmitir(doc.xmlAssinado);

    // ── 10b. Desfecho (núcleo puro): autorizada · rejeitada · pendente. ──
    let d = decidirDesfechoEmissao({
      tpEmis, erroTransmissao,
      autorizada: retorno?.autorizada ?? false,
      cStat: retorno?.cStat ?? null,
    });

    // ── 10c. Auto-fallback (Leva 14): se estávamos ONLINE e a SEFAZ está
    // indisponível (erro de transmissão ou cStat 108/109), reconstrói o MESMO
    // número como contingência (tpEmis=9), assina o QR offline e tenta
    // transmitir de novo (provável nova falha → pendente). Reusa o número —
    // não chama a RPC de numeração outra vez. ──
    let ligouContingencia = false;
    if (tpEmis === 1 && deveEntrarContingencia({ erroTransmissao, cStat: retorno?.cStat ?? null })) {
      tpEmis = 9;
      doc = await prepararDocumento(tpEmis);
      ({ retorno, erroTransmissao } = await transmitir(doc.xmlAssinado));
      d = decidirDesfechoEmissao({
        tpEmis, erroTransmissao,
        autorizada: retorno?.autorizada ?? false,
        cStat: retorno?.cStat ?? null,
      });
      ligouContingencia = true;
    }

    // ── 10d. Liga/desliga o ESTADO de contingência do tenant (fire-and-forget,
    // via RPC restrita — nunca derruba a emissão; o cupom já saiu). ──
    if (ligouContingencia && !config.contingencia_ativa) {
      await alternarContingencia(supabase, true);
    } else if (config.contingencia_ativa && deveSairContingencia({ autorizada: d.status === "autorizada" })) {
      // Auto-recovery: uma emissão online autorizada prova que a SEFAZ voltou.
      await alternarContingencia(supabase, false);
    }

    // ── 11. Persiste o desfecho em nfce_emitidas (Leva 8) — DURÁVEL, por
    // tenant, para reimpressão (nfeProc) e reenvio (fila). Nunca bloqueia. ──
    await persistirDesfecho(supabase, {
      desfecho: d.status,
      tenantId: config.tenant_id as string,
      vendaId,
      chave: doc.chave,
      numero,
      serie: (config.serie as number) ?? null,
      tpAmb,
      tpEmis,
      dhEmi: dataEmissao,
      urlQrCode: doc.urlQr,
      vNF: doc.vNF,
      xmlAssinado: doc.xmlAssinado,
      retorno,
      erroTransmissao,
    });

    return json(
      {
        status: d.status,
        contingencia: d.contingencia,
        chave: doc.chave,
        protocolo: retorno?.protocolo ?? null,
        cStat: retorno?.cStat ?? null,
        xMotivo: retorno?.xMotivo ?? (d.status === "pendente"
          ? "Emitida em contingência; será transmitida quando a SEFAZ voltar." : null),
        // Bloco NÃO-secreto do cupom (Leva 7). O urlQr já vem hasheado do
        // servidor — expõe a URL de consulta, nunca o CSC.
        emit: emitCupom,
        tpAmb,
        tpEmis,
        dhEmi: dataEmissao.toISOString(),
        urlQrCode: doc.urlQr,
      },
      200,
    );
  } catch (e) {
    // Nunca vaza segredo na mensagem de erro.
    return json({ error: "Falha ao emitir NFC-e.", detalhe: String((e as Error)?.message ?? e) }, 500);
  }
});

/**
 * Liga/desliga o ESTADO de contingência do tenant (Leva 14) via a RPC restrita
 * set_contingencia_fiscal (20260737). FIRE-AND-FORGET: nunca lança nem bloqueia
 * — a venda já aconteceu e o cupom já saiu; se o toggle falhar, a próxima
 * emissão reavalia o estado de qualquer forma. A RPC é SECURITY DEFINER e só
 * mexe em contingencia_ativa/desde da linha do tenant do chamador (o caixa
 * pode não ser admin) — a fronteira de segredo permanece intacta.
 */
async function alternarContingencia(
  supabase: ReturnType<typeof createClient>,
  ativa: boolean,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("set_contingencia_fiscal", { p_ativa: ativa });
    if (error) console.error(`set_contingencia_fiscal(${ativa}) falhou: ${error.message}`);
  } catch (e) {
    console.error(`set_contingencia_fiscal(${ativa}) exceção: ${String((e as Error)?.message ?? e)}`);
  }
}

/** Escapa texto para dentro de uma tag XML (& < > " '). */
function escaparXmlTexto(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Extrai dhEmi/vNF/vICMS do XML gerado — insumos do QR de contingência. */
function extrairCamposContingencia(xml: string): { dhEmi: string; vNF: string; vICMS: string } {
  const dhEmi = xml.match(/<dhEmi>([^<]+)<\/dhEmi>/)?.[1] ?? "";
  const totais = xml.match(/<ICMSTot>[\s\S]*?<\/ICMSTot>/)?.[0] ?? "";
  const vNF = totais.match(/<vNF>([^<]+)<\/vNF>/)?.[1] ?? "";
  const vICMS = totais.match(/<vICMS>([^<]+)<\/vICMS>/)?.[1] ?? "";
  return { dhEmi, vNF, vICMS };
}

/**
 * Persiste o desfecho da emissão em public.nfce_emitidas (Leva 8). NUNCA
 * bloqueia nem lança: toda a gravação vai em try/catch; se falhar, loga no
 * servidor (SEM segredo) e retorna — o cupom já foi ao PDV, a durabilidade é
 * secundária à venda. Usa upsert ON CONFLICT (tenant_id, chave) para não
 * duplicar num reenvio (idempotência).
 *
 * Núcleos PUROS reusados: montarRegistroNfceEmitida (autorizada/rejeitada) e
 * montarNotaPendenteTransmissao (fila pendente). A tabela guarda só documento
 * PÚBLICO (nfeProc/xmlAssinado, chave, protocolo, urlQrCode) — nunca segredo.
 */
async function persistirDesfecho(
  supabase: ReturnType<typeof createClient>,
  p: {
    desfecho: "autorizada" | "rejeitada" | "pendente";
    tenantId: string;
    vendaId: string | null;
    chave: string;
    numero: number;
    serie: number | null;
    tpAmb: number;
    tpEmis: number;
    dhEmi: Date;
    urlQrCode: string;
    vNF: string;
    xmlAssinado: string;
    retorno: { cStat: string | null; xMotivo: string | null; protocolo: string | null; nfeProc: string | null } | null;
    erroTransmissao: string | null;
  },
): Promise<void> {
  try {
    let row: Record<string, unknown>;

    if (p.desfecho === "pendente") {
      // Fila de contingência/reenvio (Leva 9): guarda o XML ASSINADO para
      // retransmitir. Núcleo puro valida chave/tpEmis/tpAmb/vNF.
      const motivo = p.erroTransmissao
        ? `falha_transmissao: ${p.erroTransmissao}`
        : (p.tpEmis === 9 ? "contingencia_offline" : "aguardando_retransmissao");
      const pend = montarNotaPendenteTransmissao({
        chave: p.chave, tpEmis: p.tpEmis, tpAmb: p.tpAmb, vNF: Number(p.vNF) || 0,
        xml: p.xmlAssinado, dataEmissao: p.dhEmi, motivo,
      });
      row = {
        tenant_id: p.tenantId,
        venda_id: p.vendaId,
        chave: pend.chave,
        numero: p.numero,
        serie: p.serie,
        status: pend.status, // "pendente"
        tp_amb: pend.tpAmb,
        tp_emis: pend.tpEmis,
        protocolo: null,
        c_stat: p.retorno?.cStat ?? null,
        x_motivo: p.retorno?.xMotivo ?? null,
        v_nf: pend.vNF,
        dh_emi: pend.criadoEm,
        url_qrcode: p.urlQrCode,
        xml: pend.xml,
        xml_tipo: "assinado",
        tentativas: pend.tentativas,
        motivo: pend.motivo,
        transmitida_em: null,
      };
    } else {
      // Desfecho terminal: autorizada (guarda o nfeProc) ou rejeitada
      // (trilha de auditoria, sem reenvio). Núcleo puro normaliza/valida.
      row = montarRegistroNfceEmitida({
        tenantId: p.tenantId,
        vendaId: p.vendaId,
        chave: p.chave,
        numero: p.numero,
        serie: p.serie,
        status: p.desfecho,
        tpAmb: p.tpAmb,
        tpEmis: p.tpEmis,
        protocolo: p.retorno?.protocolo ?? null,
        cStat: p.retorno?.cStat ?? null,
        xMotivo: p.retorno?.xMotivo ?? null,
        vNF: p.vNF,
        dhEmi: p.dhEmi,
        urlQrCode: p.urlQrCode,
        xmlProc: p.desfecho === "autorizada" ? (p.retorno?.nfeProc ?? null) : null,
      }) as unknown as Record<string, unknown>;
    }

    const { error } = await supabase
      .from("nfce_emitidas")
      .upsert(row, { onConflict: "tenant_id,chave" });
    if (error) {
      // Sem segredo na mensagem — só a chave (pública) e o texto do erro.
      console.error(`nfce_emitidas upsert falhou (chave ${p.chave}): ${error.message}`);
    }
  } catch (e) {
    console.error(`nfce_emitidas: falha ao persistir desfecho (chave ${p.chave}): ${String((e as Error)?.message ?? e)}`);
  }
}

/**
 * Monta o objeto de entrada de montarXmlNfce a partir da config do tenant
 * e da venda. Extraído para não duplicar entre o caminho "sem chave"
 * (prévia) e o de emissão real — a MESMA verdade fiscal nos dois. O tpEmis
 * (1 normal / 9 contingência) entra no `ide` e vai parar na chave de acesso.
 */
function montarEntradaXml(
  { config, venda, numero, codigoNumerico, tpAmb, tpEmis, dataEmissao }: {
    config: Record<string, unknown>;
    venda: Record<string, unknown>;
    numero: number;
    codigoNumerico: string;
    tpAmb: number;
    tpEmis: number;
    dataEmissao?: Date;
  },
) {
  return {
    ide: {
      serie: (config.serie as number) ?? 1,
      numero,
      dataEmissao: dataEmissao ?? new Date(),
      codigoNumerico,
      tpAmb,
      tpEmis,
    },
    emit: {
      cnpj: config.cnpj,
      xNome: config.razao_social,
      xFant: config.nome_fantasia,
      ie: config.ie,
      crt: config.crt,
      uf: config.uf,
      cMun: config.codigo_municipio,
      xMun: config.municipio,
      xLgr: config.logradouro,
      nro: config.numero_end,
      xBairro: config.bairro,
      cep: config.cep,
      fone: config.fone,
    },
    dest: (venda as { dest?: unknown }).dest, // opcional (CPF na nota) — anônima se ausente
    itens: (venda as { itens?: unknown }).itens,
    pagamentos: (venda as { pagamentos?: unknown }).pagamentos,
  };
}

/**
 * Enriquece cada item da venda com o cadastro fiscal do produto (itens_fiscal)
 * e o transforma nos campos que montarXmlNfce espera (NCM/CFOP/icms/pis/cofins).
 *
 * Carrega numa só consulta (item_id IN cProds) — nunca select *; só as
 * colunas fiscais necessárias. Item sem cadastro completo NÃO derruba a
 * função: vira uma entrada em `faltando` para quem chama tratar. Devolve
 * `itens` já mesclados (dados da venda + fiscais) e `faltando` = produtos a
 * cadastrar. Se `faltando` estiver vazio, `itens` está pronto pro XML.
 */
async function enriquecerItensFiscais(
  supabase: ReturnType<typeof createClient>,
  crt: number,
  venda: { itens?: Array<Record<string, unknown>> },
): Promise<{ itens: Array<Record<string, unknown>>; faltando: Array<{ cProd: string; xProd: string; motivo: string }> }> {
  const itensVenda = Array.isArray(venda?.itens) ? venda.itens : [];
  const ids = [...new Set(
    itensVenda.map((it) => Number(it.cProd)).filter((n) => Number.isFinite(n)),
  )];

  const fiscalPorId = new Map<number, Record<string, unknown>>();
  if (ids.length > 0) {
    const { data, error } = await supabase
      .from("itens_fiscal")
      .select(
        "item_id, ncm, cest, cfop, origem_mercadoria, csosn, cst_icms, " +
          "aliquota_icms, reducao_base_icms, cst_pis, aliquota_pis, cst_cofins, aliquota_cofins",
      )
      .in("item_id", ids);
    if (error) throw new Error(`Falha ao ler o cadastro fiscal dos produtos: ${error.message}`);
    for (const linha of data ?? []) fiscalPorId.set(Number(linha.item_id), linha);
  }

  const itens: Array<Record<string, unknown>> = [];
  const faltando: Array<{ cProd: string; xProd: string; motivo: string }> = [];
  for (const it of itensVenda) {
    const cProd = String(it.cProd ?? "");
    const xProd = String(it.xProd ?? cProd);
    const fiscal = fiscalPorId.get(Number(it.cProd));
    if (!fiscal) {
      faltando.push({ cProd, xProd, motivo: "sem cadastro fiscal" });
      continue;
    }
    try {
      const campos = montarItemFiscal(fiscal, {
        crt,
        qCom: Number(it.qCom),
        vUnCom: Number(it.vUnCom),
        vProd: it.vProd != null ? Number(it.vProd) : undefined,
      });
      itens.push({ ...it, ...campos });
    } catch (e) {
      faltando.push({ cProd, xProd, motivo: String((e as Error)?.message ?? e) });
    }
  }
  return { itens, faltando };
}

/**
 * Bloco NÃO-secreto do emitente para montar a DANFE (cupom) no front (Leva 7).
 * Só a identidade pública do estabelecimento (razão/fantasia, CNPJ, IE,
 * endereço) — nada de certificado nem CSC. Mapeia as colunas de
 * tenant_fiscal_config para os campos que montarDanfeNfce espera.
 */
function montarEmitCupom(config: Record<string, unknown>) {
  return {
    xNome: config.razao_social,
    xFant: config.nome_fantasia,
    cnpj: config.cnpj,
    ie: config.ie,
    xLgr: config.logradouro,
    nro: config.numero_end,
    xBairro: config.bairro,
    xMun: config.municipio,
    uf: config.uf,
  };
}

/** Texto curto e humano listando os produtos com cadastro fiscal pendente. */
function descreverFaltando(faltando: Array<{ xProd: string; motivo: string }>): string {
  return faltando.map((f) => `${f.xProd} (${f.motivo})`).join("; ");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
