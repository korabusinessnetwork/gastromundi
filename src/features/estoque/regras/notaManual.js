import { novoUid } from "@/lib/uidLista";

// Linha do lançamento manual de nota fiscal. O estado do formulário mora no gancho
// da feature, então a forma da linha mora aqui, e não no apoio da tela.

export const ITEM_MANUAL_VAZIO = { descricaoXml: "", quantidade: "", unidadeXml: "", precoUnitario: "" };

/** Linha nova do formulário manual, já com a identidade de renderização. */
export const novoItemManual = () => ({ ...ITEM_MANUAL_VAZIO, uid: novoUid() });
