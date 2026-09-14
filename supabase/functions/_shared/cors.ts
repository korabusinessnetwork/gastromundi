// ──────────────────────────────────────────────────────────────────
// CORS das Edge Functions — origem declarada, não curinga.
//
// As 9 functions respondiam `Access-Control-Allow-Origin: "*"`. Isso
// nunca foi CSRF: a autorização vai no cabeçalho `Authorization`, que o
// navegador NÃO manda sozinho para outra origem, e quem tem o token
// chama por curl, onde CORS não existe. O que o curinga custa é o
// raio de alcance de um token já vazado: com "*", qualquer página
// aberta no navegador do caixa podia usar o token roubado direto dali,
// com a resposta legível. Com a origem declarada, o navegador recusa a
// leitura e sobra só o caminho fora do navegador.
//
// Por que ler da configuração e não fixar no código: o produto é
// multi-estabelecimento com subdomínio por tenant (decisão 017), então
// a origem legítima varia por instalação. Fixar aqui seria marca de
// cliente hardcodada, exatamente o que o CLAUDE.md proíbe.
//
// FALLBACK DELIBERADO: sem a variável configurada, o comportamento é o
// de hoje ("*"). Falhar fechado aqui derrubaria emissão fiscal no
// primeiro deploy em que alguém esquecesse a variável, e trocar um
// risco baixo por parada de caixa é péssimo negócio. A configuração
// liga o aperto; a ausência dela não quebra nada.
// ──────────────────────────────────────────────────────────────────

/** Cabeçalhos que não dependem da origem da requisição. */
export const CABECALHOS_FIXOS: Record<string, string> = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  // Sem `Vary: Origin` um cache intermediário serviria a uma origem o
  // cabeçalho calculado para outra, que é o clássico jeito de anular
  // este controle sem ninguém perceber.
  Vary: "Origin",
};

/**
 * Lê a lista de origens da configuração. Formato: origens separadas por
 * vírgula, cada uma com esquema (`https://caixa.gastromundi.com.br`).
 * Um item pode começar com `*.` para valer em qualquer subdomínio
 * (`https://*.gastromundi.com.br`), que é o caso normal do produto
 * multi-estabelecimento.
 *
 * @returns a lista, ou `null` quando nada foi configurado (curinga).
 */
export function lerOrigensPermitidas(bruto?: string | null): string[] | null {
  if (typeof bruto !== "string") return null;
  const itens = bruto
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return itens.length > 0 ? itens : null;
}

/** A origem da requisição casa com algum item da lista? */
export function origemPermitida(origem: string | null | undefined, permitidas: string[] | null): boolean {
  if (!permitidas) return true; // nada configurado: curinga, ver cabeçalho
  if (typeof origem !== "string" || !origem) return false;
  const alvo = origem.trim().replace(/\/+$/, "").toLowerCase();
  return permitidas.some((item) => {
    const padrao = item.toLowerCase();
    const curinga = padrao.indexOf("://*.");
    if (curinga === -1) return padrao === alvo;
    // `https://*.dominio` vale para o apex e para qualquer subdomínio,
    // em um nível ou mais: o tenant pode viver em `loja.dominio` e o
    // Console em `console.dominio`.
    const esquema = padrao.slice(0, curinga + 3); // "https://"
    const dominio = padrao.slice(curinga + 5);    // "dominio"
    if (alvo === esquema + dominio) return true;
    return alvo.startsWith(esquema) && alvo.endsWith("." + dominio);
  });
}

/**
 * Monta os cabeçalhos de CORS da resposta.
 *
 * Origem recusada sai SEM `Access-Control-Allow-Origin`: é o navegador
 * que barra a leitura, e omitir o cabeçalho é a forma correta de negar
 * (devolver um valor errado seria pior, porque alguns caches o guardam).
 */
export function montarCorsHeaders(
  origem: string | null | undefined,
  permitidas: string[] | null,
): Record<string, string> {
  if (!permitidas) return { ...CABECALHOS_FIXOS, "Access-Control-Allow-Origin": "*" };
  if (!origemPermitida(origem, permitidas)) return { ...CABECALHOS_FIXOS };
  return { ...CABECALHOS_FIXOS, "Access-Control-Allow-Origin": String(origem).trim().replace(/\/+$/, "") };
}
