import { novoUid } from "@/lib/uidLista";

export const fmtDt  = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";

export const fmtR   = (v) => "R$ " + Number(v ?? 0).toFixed(2);

export const fmtCnpj = (v) => {
  if (!v) return "—";
  const s = String(v).replace(/\D/g, "");
  return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") || v;
};

// ── Stepper ───────────────────────────────────────────────────────

export const ITEM_MANUAL_VAZIO = { descricaoXml: "", quantidade: "", unidadeXml: "", precoUnitario: "" };

/** Linha nova do formulário manual, já com a identidade de renderização. */
export const novoItemManual = () => ({ ...ITEM_MANUAL_VAZIO, uid: novoUid() });
