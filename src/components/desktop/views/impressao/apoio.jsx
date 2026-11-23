
// Resume o destino de impressão da Ponte em uma linha legível — mesmo
// formato { tipo, nome } | { tipo, host, porta } usado em PerfilImpressora.
export function resumoImpressora(impressora) {
  if (!impressora) return "";
  if (impressora.tipo === "rede") return `${impressora.host}:${impressora.porta} (impressora de rede)`;
  return impressora.nome ?? "";
}
