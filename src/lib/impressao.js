import { supabase } from "./supabase";
import { nomeExibicaoTenant, logoUrlTenant } from "./tema";

/**
 * Impressão — F015 (docs/09_BACKLOG/features.md).
 *
 * Só o LAYOUT/template de impressão (comprovante, via de produção,
 * cupom/pré-nota) — a emissão fiscal de verdade (NF-e/NFC-e) é add-on
 * pago à parte (F019, decisão 019) e não entra aqui. `montarCupomPreNota`
 * já nasce com o formato que o F019 vai estender (`dadosFiscais: null`
 * é o ponto de extensão — o provedor fiscal real preenche esse campo
 * depois, sem mudar o resto do template).
 *
 * Identidade do estabelecimento vem sempre de `tenant.tema` (Fase 6,
 * ADR-007) — nunca hardcoded. `config_impressao` (tabela `config`,
 * mesmo padrão de `taxa_servico`/`meios_pagamento`) guarda só as
 * preferências de exibição (mostrar logo, endereço/CNPJ, rodapé),
 * não identidade — identidade e tema continuam em `tenants.tema`.
 */

// F020 — perfil de impressora: driver trocável (decisão 025) + papel
// físico (largura/margem/corte/fonte). `driver: "browser-raster"` é o
// default gratuito (window.print); `"escpos-qztray"` é substituível,
// nunca obrigatório (QZ Tray exige certificado pago pra imprimir sem
// aviso — Restrições de Custo). `fonteBase: null` = usa o tamanho
// default de cada template (comprovante 13px, via de produção 15px);
// só é sobrescrito se o estabelecimento pedir letra maior (impressora
// que "corta" texto pequeno).
export const PERFIL_IMPRESSORA_PADRAO = {
  larguraMm: 80,
  margemMm: 2,
  cortaPapel: true,
  fonteBase: null,
  driver: "browser-raster",
  impressoraQz: null,
};

export const CONFIG_IMPRESSAO_PADRAO = {
  mostrarLogo: true,
  mostrarEnderecoCnpj: false,
  endereco: "",
  cnpj: "",
  rodapePersonalizado: "Obrigado pela preferência!",
  perfilImpressora: PERFIL_IMPRESSORA_PADRAO,
};

/**
 * Busca as preferências de impressão do estabelecimento. Nunca lança:
 * falha retorna os defaults (nunca quebra a impressão por causa de
 * uma config ausente).
 *
 * @returns {Promise<{data: object, error: object|null}>}
 */
export async function buscarConfigImpressao() {
  try {
    const { data, error } = await supabase
      .from("config")
      .select("key, value")
      .eq("key", "config_impressao")
      .maybeSingle();
    if (error) return { data: CONFIG_IMPRESSAO_PADRAO, error };
    const valor = data?.value ?? {};
    return {
      data: {
        ...CONFIG_IMPRESSAO_PADRAO,
        ...valor,
        // Merge próprio pro perfil (aninhado) — senão salvar só 1 campo
        // do perfil apagaria os demais defaults (largura, driver etc.).
        perfilImpressora: { ...PERFIL_IMPRESSORA_PADRAO, ...(valor.perfilImpressora ?? {}) },
      },
      error: null,
    };
  } catch (err) {
    return { data: CONFIG_IMPRESSAO_PADRAO, error: { message: err?.message ?? "Falha ao buscar configuração de impressão." } };
  }
}

/**
 * Salva as preferências de impressão do estabelecimento.
 *
 * @param {object} config
 * @returns {Promise<{error: object|null}>}
 */
export async function salvarConfigImpressao(config) {
  try {
    const { error } = await supabase.from("config").upsert({ key: "config_impressao", value: config ?? {} });
    return { error };
  } catch (err) {
    return { error: { message: err?.message ?? "Falha ao salvar configuração de impressão." } };
  }
}

/**
 * Resolve a identidade do estabelecimento para um cabeçalho de
 * impressão — nome/logo sempre de `tenant.tema` (com fallback
 * "GastroMundi"); endereço/CNPJ só aparecem se a config do
 * estabelecimento pedir explicitamente. Função pura.
 *
 * @param {{tema?: object}|null|undefined} tenant
 * @param {object} [configImpressao]
 * @returns {{nome: string, logoUrl: string|null, endereco: string, cnpj: string, rodape: string}}
 */
export function resolverIdentidadeTenant(tenant, configImpressao) {
  const cfg = { ...CONFIG_IMPRESSAO_PADRAO, ...(configImpressao ?? {}) };
  return {
    nome: nomeExibicaoTenant(tenant?.tema),
    logoUrl: cfg.mostrarLogo ? logoUrlTenant(tenant?.tema) : null,
    endereco: cfg.mostrarEnderecoCnpj ? (cfg.endereco || "") : "",
    cnpj: cfg.mostrarEnderecoCnpj ? (cfg.cnpj || "") : "",
    rodape: cfg.rodapePersonalizado || "",
  };
}

// Normaliza os itens de uma venda para o formato de impressão —
// exclui cancelados (nunca aparecem em comprovante/cupom).
function normalizarItensVenda(itens) {
  return (Array.isArray(itens) ? itens : [])
    .filter((i) => !i?.cancelado)
    .map((i) => ({
      nome: i.name ?? "",
      qty: Number(i.qty) || 1,
      preco: Number(i.price) || 0,
      emoji: i.emoji ?? "",
      obs: Array.isArray(i.obs) ? i.obs : (i.obs ? [i.obs] : []),
    }));
}

/**
 * Monta os dados do comprovante de pagamento (itens, totais,
 * pagamentos/troco, identidade do tenant) — pura, pronta para
 * renderizar. Chamada depois da venda finalizada.
 *
 * @param {{venda: object, tenant?: object, configImpressao?: object}} params
 * @returns {object}
 */
export function montarComprovantePagamento({ venda, tenant, configImpressao } = {}) {
  const itens = normalizarItensVenda(venda?.items);
  const subtotal = itens.reduce((s, i) => s + i.preco * i.qty, 0);
  const pagamentos = Array.isArray(venda?.pagamentos) ? venda.pagamentos : [];
  const trocoTotal = pagamentos.reduce((s, p) => s + (Number(p?.troco) || 0), 0);

  return {
    tipo: "comprovante",
    identidade: resolverIdentidadeTenant(tenant, configImpressao),
    comanda: venda?.comanda ?? null,
    itens,
    subtotal,
    valorTaxa: Number(venda?.valorTaxa) || 0,
    ajuste: venda?.ajuste ?? null,
    valorAjuste: Number(venda?.valorAjuste) || 0,
    total: Number(venda?.total) || subtotal,
    pagamentos,
    trocoTotal,
  };
}

/**
 * Monta o cupom/pré-nota (não fiscal) — mesma base do comprovante,
 * mais o aviso de "sem valor fiscal" e o ponto de extensão para
 * quando o add-on fiscal (F019) entrar: `dadosFiscais` fica pronto
 * para receber número/QR/autorização sem mudar o resto do template.
 *
 * @param {{venda: object, tenant?: object, configImpressao?: object}} params
 * @returns {object}
 */
export function montarCupomPreNota({ venda, tenant, configImpressao } = {}) {
  const base = montarComprovantePagamento({ venda, tenant, configImpressao });
  return {
    ...base,
    tipo: "cupom_pre_nota",
    naoFiscal: true,
    avisoNaoFiscal: "Documento sem valor fiscal — não substitui a nota fiscal.",
    dadosFiscais: null,
  };
}

/**
 * Monta a via de produção (ticket de cozinha) — só itens produzíveis
 * (exclui cancelados e os marcados `produzivel: false`), sem preço,
 * sem forma de pagamento: só o que a cozinha precisa saber.
 *
 * @param {{pedido: object}} params
 * @returns {object}
 */
export function montarViaProducao({ pedido } = {}) {
  const itens = (Array.isArray(pedido?.items) ? pedido.items : [])
    .filter((i) => !i?.cancelado && i?.produzivel !== false)
    .map((i) => ({
      nome: i.name ?? "",
      qty: Number(i.qty) || 1,
      emoji: i.emoji ?? "",
      obs: Array.isArray(i.obs) ? i.obs : (i.obs ? [i.obs] : []),
    }));

  return {
    tipo: "via_producao",
    comanda: pedido?.comanda ?? null,
    mesa: pedido?.mesa ?? null,
    garcom: pedido?.garcom ?? null,
    horario: pedido?.created_at ?? new Date().toISOString(),
    itens,
  };
}
