
export const CATS_EXCLUIDAS = ["Produção", "Insumo"];

export const EMPTY_FISCAL = {
  ncm: "", cest: "", cfop: "",
  origem_mercadoria: "0",
  csosn: "", cst_icms: "",
  aliquota_icms: "", reducao_base_icms: "",
  cst_ipi: "", aliquota_ipi: "",
  cst_pis: "", aliquota_pis: "",
  cst_cofins: "", aliquota_cofins: "",
  aliquota_ibs: "", aliquota_cbs: "", aliquota_is: "",
  regime_tributario: "simples",
  observacao_fiscal: "",
};

export const ORIGENS = [
  { v: "0", l: "0, Nacional" },
  { v: "1", l: "1, Estrangeira (importação direta)" },
  { v: "2", l: "2, Estrangeira (mercado interno)" },
  { v: "3", l: "3, Nacional c/ + de 40% de conteúdo estrangeiro" },
  { v: "4", l: "4, Nacional produção básica" },
  { v: "5", l: "5, Nacional c/ até 40% de conteúdo estrangeiro" },
];

export const REGIMES = [
  { v: "simples",   l: "Simples Nacional" },
  { v: "presumido", l: "Lucro Presumido" },
  { v: "real",      l: "Lucro Real" },
];

export const CSOSN_OPTS = [
  { v: "101", l: "101, Tributada com permissão de crédito" },
  { v: "102", l: "102, Tributada sem permissão de crédito" },
  { v: "103", l: "103, Isenção para faixa de receita bruta" },
  { v: "300", l: "300, Imune" },
  { v: "400", l: "400, Não tributada" },
  { v: "500", l: "500, ICMS cobrado anteriormente por ST" },
  { v: "900", l: "900, Outros" },
];

export const CST_ICMS_OPTS = [
  { v: "00", l: "00, Tributada integralmente" },
  { v: "10", l: "10, Tributada e com cobrança por ST" },
  { v: "20", l: "20, Com redução de base de cálculo" },
  { v: "40", l: "40, Isenta" },
  { v: "41", l: "41, Não tributada" },
  { v: "50", l: "50, Suspensão" },
  { v: "60", l: "60, ICMS cobrado anteriormente por ST" },
  { v: "70", l: "70, Com red. de base de cálculo e cobrança por ST" },
  { v: "90", l: "90, Outros" },
];

export const CST_PIS_COFINS = [
  { v: "01", l: "01, Operação tributável (alíquota normal)" },
  { v: "02", l: "02, Operação tributável (alíquota diferenciada)" },
  { v: "04", l: "04, Operação tributável (alíquota zero)" },
  { v: "06", l: "06, Operação tributável (alíquota zero), setor" },
  { v: "07", l: "07, Operação isenta" },
  { v: "08", l: "08, Operação sem incidência" },
  { v: "09", l: "09, Operação com suspensão" },
  { v: "49", l: "49, Outras saídas" },
  { v: "99", l: "99, Outras operações" },
];

// ── helpers UI ───────────────────────────────────────────────────────

export const ABAS_MODAL = [
  { id: "identificacao", label: "Identificação" },
  { id: "icms",          label: "ICMS" },
  { id: "pis_cofins",    label: "PIS / COFINS / IPI" },
  { id: "reforma",       label: "Reforma 2026" },
];
