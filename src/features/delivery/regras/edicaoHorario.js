import { FAIXA_PADRAO, normalizarHorario } from "@/lib/deliveryHorario";
import { novoUid, comUid } from "@/lib/uidLista";

// Edição do horário do delivery na tela, usada pelas Configurações do computador
// e do celular (refatoração 4.10; antes eram gêmeos, um em cada tela).
//
// TD015: as faixas são adicionadas e removidas do meio da lista, então cada uma
// precisa de identidade própria para renderizar. O `uid` vive só no state da
// tela: `normalizarHorario` reconstrói cada faixa como `{ abre, fecha }` e ele
// morre na fronteira do save. O módulo de horário se declara puro e não gera
// identificador, por isso o carimbo mora aqui e não lá.

/** Faixa nova de funcionamento, no horário padrão. */
export const faixaNova = () => ({ ...FAIXA_PADRAO, uid: novoUid() });

/** Horário vindo do banco, pronto para editar: normalizado e com identidade por faixa. */
export const horarioParaEdicao = (bruto) => {
  const h = normalizarHorario(bruto);
  return { ...h, faixas: comUid(h.faixas) };
};
