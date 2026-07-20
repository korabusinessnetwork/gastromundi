// ──────────────────────────────────────────────────────────────────
// 🥚 Easter egg — assinatura do criador.
//
// Escondida à vista de todos: só aparece pra quem abre o console do
// navegador (DevTools). Não muda nada da tela, não loga dado nenhum do
// negócio — é só um "oi" pra quem for curioso o suficiente pra espiar
// por baixo do capô. Feito com carinho.
//
// Para achar de novo: abra o DevTools (F12) na home do app.
// ──────────────────────────────────────────────────────────────────

/**
 * Imprime a assinatura estilizada no console. Fire-and-forget: qualquer
 * erro (console indisponível, ambiente sem DevTools) é engolido — um
 * easter egg jamais pode atrapalhar a operação.
 */
export function assinaturaEscondida() {
  try {
    if (typeof console === "undefined" || !console.log) return;

    const titulo = [
      "%c  ✦  feito à mão por Matheus Bonato  ✦  ",
      "color:#fff;background:linear-gradient(90deg,#e11d48,#7c3aed);" +
        "font-size:14px;font-weight:700;padding:8px 14px;border-radius:8px;",
    ];

    const recado = [
      "%cSe você chegou até aqui, é porque tem curiosidade — e curiosidade constrói coisa boa. 🤝",
      "color:#94a3b8;font-style:italic;font-size:12px;",
    ];

    // eslint-disable-next-line no-console
    console.log(...titulo);
    // eslint-disable-next-line no-console
    console.log(...recado);
  } catch {
    // easter egg nunca quebra o app — silêncio proposital.
  }
}
