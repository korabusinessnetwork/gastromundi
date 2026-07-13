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
import { montarItemFiscal } from "../../../src/lib/nfceItemFiscal.js";

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
          "serie, proximo_numero, csc_id, url_qrcode, url_autorizacao",
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

    // tpEmis parametrizável (Leva 4): 1 = emissão normal (online), 9 =
    // CONTINGÊNCIA offline (cupom sai na hora, transmite depois). Só 1 ou 9
    // são válidos — qualquer outro é erro de entrada (prevenção de erro).
    const tpEmis = Number(body.tpEmis ?? 1);
    if (tpEmis !== 1 && tpEmis !== 9) {
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
            montarEntradaXml({ config, venda: vendaFiscal, numero: config.proximo_numero ?? 1, codigoNumerico, tpAmb, tpEmis }),
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

    // ── 7. Monta o XML NÃO-ASSINADO (Leva 2 — puro, já testado) ───────
    const { xml, chave } = montarXmlNfce(
      montarEntradaXml({ config, venda: vendaFiscal, numero, codigoNumerico, tpAmb, tpEmis }),
    );

    // ── 8. Monta o QR Code (Leva 3 — puro). CSC (segredo) como parâmetro. ──
    // ⚠️ CONTINGÊNCIA (tpEmis=9): o QR offline tem forma diferente (insere
    //    dhEmi/vNF/vICMS/digVal antes do idCSC). O `digVal` vem do
    //    DigestValue da ASSINATURA (PLUG A CHAVE, passo 9) — por isso a
    //    forma de contingência do QR só fica completa junto com o
    //    certificado. montarQrCodeNfce cobre a forma ONLINE; a offline é o
    //    encaixe marcado para quando a chave chegar.
    const urlQr = await montarQrCodeNfce({
      chave,
      tpAmb,
      idCsc: cscId,
      csc: cscValor!, // segredo, injetado — nunca logar
      urlConsulta: config.url_qrcode,
    });

    // ── 9. ASSINA o XML (XML-DSig com o certificado A1) ───────────────
    // ⟵ PLUG A CHAVE AQUI — precisa do certificado para rodar de ponta a
    //    ponta. Assina o elemento <infNFe> (Id="NFe<chave>") e insere o
    //    QR Code em <infNFeSupl><qrCode>. Ver assinarXmlDSig() abaixo.
    //    (É deste passo que sai o DigestValue = digVal do QR de contingência.)
    const xmlAssinado = await assinarXmlDSig(xml, urlQr, config.url_qrcode, {
      certBase64: certBase64!,
      certSenha: certSenha!,
    });

    // ── 10. TRANSMITE à SEFAZ-RS e trata o retorno ────────────────────
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

/**
 * Monta o objeto de entrada de montarXmlNfce a partir da config do tenant
 * e da venda. Extraído para não duplicar entre o caminho "sem chave"
 * (prévia) e o de emissão real — a MESMA verdade fiscal nos dois. O tpEmis
 * (1 normal / 9 contingência) entra no `ide` e vai parar na chave de acesso.
 */
function montarEntradaXml(
  { config, venda, numero, codigoNumerico, tpAmb, tpEmis }: {
    config: Record<string, unknown>;
    venda: Record<string, unknown>;
    numero: number;
    codigoNumerico: string;
    tpAmb: number;
    tpEmis: number;
  },
) {
  return {
    ide: {
      serie: (config.serie as number) ?? 1,
      numero,
      dataEmissao: new Date(),
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
