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
import { montarQrCodeNfce } from "../../../src/lib/nfceQrCode.js";

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
        "ativo, ambiente, cnpj, ie, crt, uf, codigo_municipio, municipio, " +
          "logradouro, numero_end, bairro, cep, fone, razao_social, nome_fantasia, " +
          "serie, proximo_numero, csc_id, url_qrcode, url_autorizacao",
      )
      .single();
    if (cfgError || !config) {
      return json({ error: "Estabelecimento sem configuração fiscal." }, 412);
    }
    if (!config.ativo) {
      return json({ error: "Emissão fiscal não está ativa para este estabelecimento." }, 412);
    }

    // ── 3. Lê os dados da venda do corpo da requisição ────────────────
    const body = await req.json().catch(() => null);
    if (!body?.venda) return json({ error: "Venda ausente no corpo." }, 400);
    const { venda } = body;

    // nNF vem da config (proximo_numero); cNF é aleatório de 8 dígitos.
    // NOTA (Leva 4): o incremento de proximo_numero precisa ser ATÔMICO —
    // uma RPC (SECURITY DEFINER) que faz UPDATE ... RETURNING para não
    // repetir número em emissões concorrentes. Aqui ainda é leitura simples.
    const numero = config.proximo_numero ?? 1;
    const codigoNumerico = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");

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

    // ── 5. Monta o XML NÃO-ASSINADO (Leva 2 — puro, já testado) ───────
    const { xml, chave } = montarXmlNfce({
      ide: {
        serie: config.serie ?? 1,
        numero,
        dataEmissao: new Date(),
        codigoNumerico,
        tpAmb,
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
      dest: venda.dest, // opcional (CPF na nota) — NFC-e anônima se ausente
      itens: venda.itens,
      pagamentos: venda.pagamentos,
    });

    // ── 6. Monta o QR Code (Leva 3 — puro, já testado) ────────────────
    // O CSC (segredo) entra como PARÂMETRO; o builder nunca o guarda.
    // Sem o segredo ainda, devolvemos o XML montado para inspeção — é o
    // "material pronto" antes de por a chave.
    if (!segredosProntos) {
      return json(
        {
          status: "sem_chave",
          detalhe:
            "XML montado com sucesso. Faltam os segredos (certificado A1 + CSC) " +
            "para assinar, gerar o QR e transmitir. Injete-os via secret e teste " +
            "em homologação.",
          chave,
          xml, // não-assinado; para conferência em homologação
        },
        200,
      );
    }

    const urlQr = await montarQrCodeNfce({
      chave,
      tpAmb,
      idCsc: cscId,
      csc: cscValor!, // segredo, injetado — nunca logar
      urlConsulta: config.url_qrcode,
    });

    // ── 7. ASSINA o XML (XML-DSig com o certificado A1) ───────────────
    // ⟵ PLUG A CHAVE AQUI — precisa do certificado para rodar de ponta a
    //    ponta. Assina o elemento <infNFe> (Id="NFe<chave>") e insere o
    //    QR Code em <infNFeSupl><qrCode>. Ver assinarXmlDSig() abaixo.
    const xmlAssinado = await assinarXmlDSig(xml, urlQr, config.url_qrcode, {
      certBase64: certBase64!,
      certSenha: certSenha!,
    });

    // ── 8. TRANSMITE à SEFAZ-RS e trata o retorno ─────────────────────
    // ⟵ PLUG A CHAVE AQUI — SOAP autenticado por TLS mútuo com o mesmo
    //    certificado A1. Ver transmitirSefazRS() abaixo.
    const retorno = await transmitirSefazRS(xmlAssinado, {
      urlAutorizacao: config.url_autorizacao,
      tpAmb,
      certBase64: certBase64!,
      certSenha: certSenha!,
    });

    return json({ status: retorno.autorizada ? "autorizada" : "rejeitada", chave, ...retorno }, 200);
  } catch (e) {
    // Nunca vaza segredo na mensagem de erro.
    return json({ error: "Falha ao emitir NFC-e.", detalhe: String((e as Error)?.message ?? e) }, 500);
  }
});

/**
 * PLACEHOLDER — assinatura XML-DSig do <infNFe> com o certificado A1.
 *
 * ⟵ PLUG A CHAVE: implementar quando o certificado chegar. Passos:
 *   1. Decodificar o .pfx (base64) e abrir com a senha (ex.: node-forge
 *      via esm.sh, ou a Web Crypto quando suportar PKCS#12).
 *   2. Calcular o DigestValue (SHA-1) do <infNFe> canonicalizado (C14N).
 *   3. Montar <SignedInfo>, assinar (RSA-SHA1) → <SignatureValue>.
 *   4. Anexar <Signature> após </infNFe> e o <infNFeSupl><qrCode> + <urlChave>.
 *   5. Envelopar em <NFe>…</NFe> (e depois em <enviNFe> no passo 8).
 * Até lá, lança de forma explícita — o passo 6 já barra a execução sem
 * segredo, então isto só roda quando a chave existir.
 */
async function assinarXmlDSig(
  _xml: string,
  _urlQr: string,
  _urlChave: string,
  _cert: { certBase64: string; certSenha: string },
): Promise<string> {
  throw new Error(
    "assinarXmlDSig: pendente do certificado A1 (Leva 3, por a chave). " +
      "Pipeline pronto; falta só a assinatura real.",
  );
}

/**
 * PLACEHOLDER — transmissão SOAP à SEFAZ-RS (NFeAutorizacao4) + consulta.
 *
 * ⟵ PLUG A CHAVE: SEFAZ-RS usa TLS mútuo com o certificado A1. Passos:
 *   1. Envelopar <enviNFe versao="4.00"><idLote>…<indSinc>1</…><NFe…/>.
 *   2. POST SOAP no url_autorizacao com o certificado no handshake TLS.
 *   3. Ler o retorno (cStat 100 = autorizado; 110/301/302 etc.), extrair
 *      o protocolo (nProt) e anexar ao XML → nfeProc (guardar).
 * Em homologação (tpAmb=2) a nota não tem valor fiscal — é o ambiente de
 * teste correto para "por a chave e testar".
 */
async function transmitirSefazRS(
  _xmlAssinado: string,
  _opts: { urlAutorizacao: string; tpAmb: number; certBase64: string; certSenha: string },
): Promise<{ autorizada: boolean; cStat?: string; xMotivo?: string; protocolo?: string }> {
  throw new Error(
    "transmitirSefazRS: pendente do certificado A1 (Leva 3, por a chave). " +
      "Envelope e fluxo prontos; falta só o handshake TLS com o certificado.",
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
