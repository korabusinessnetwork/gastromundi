// Ponte KORA — helpers puros de HTTP/rede (Leva 13).
//
// Por que cada peça existe:
// - O app do caixa roda em HTTPS (Vercel) e só pode falar com a ponte
//   porque `http://localhost` é exceção de conteúdo misto nos navegadores.
//   Esses pedidos cross-origin precisam de CORS liberado e do cabeçalho
//   `Access-Control-Allow-Private-Network` (Chrome, Private Network Access).
// - Endpoints de gestão (/info, /snapshot, /pedidos...) são só-localhost:
//   apenas o app rodando NO PC do caixa pode usá-los.
// - O Palm chega pela rede local com um token na URL — qualquer aparelho
//   no Wi-Fi alcança a porta, o token é o que separa "equipe" de "visita".

/**
 * A conexão veio da própria máquina? (IPv4, IPv6 e IPv4-mapeado)
 */
export function ehEnderecoLocal(remoteAddress) {
  if (typeof remoteAddress !== "string" || !remoteAddress) return false;
  const addr = remoteAddress.trim().toLowerCase();
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1" || addr.startsWith("127.");
}

/**
 * Cabeçalhos CORS da ponte. Origem liberada ("*") de propósito:
 * autorização vem do token e do gate de localhost, não da origem —
 * e o app do caixa pode estar em qualquer domínio (white-label).
 */
export function cabecalhosCors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Ponte-Token",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Extrai o token da requisição — cabeçalho X-Ponte-Token ou query ?t=.
 * (O Palm usa a query porque o token viaja dentro do link do QR.)
 *
 * @param {{headers?: object, url?: URL}} req - headers em minúsculas (Node) + URL parseada
 */
export function tokenDaRequisicao({ headers, url } = {}) {
  const doHeader = headers?.["x-ponte-token"];
  if (typeof doHeader === "string" && doHeader) return doHeader;
  const daQuery = url?.searchParams?.get?.("t");
  return typeof daQuery === "string" && daQuery ? daQuery : "";
}

/**
 * Comparação de token sem atalho por tamanho (evita vazar por timing).
 * Pura — recebe os dois lados e devolve boolean.
 */
export function tokenValido(recebido, esperado) {
  if (typeof recebido !== "string" || typeof esperado !== "string") return false;
  if (recebido.length === 0 || esperado.length === 0) return false;
  if (recebido.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i += 1) {
    diff |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Endereços IPv4 da rede local a partir de os.networkInterfaces() —
 * é o que vira o link/QR do Palm (http://IP:porta/palm?t=token).
 * Pura: recebe o objeto de interfaces, devolve string[] de IPs.
 */
export function enderecosLan(interfaces) {
  const ips = [];
  for (const lista of Object.values(interfaces ?? {})) {
    for (const iface of Array.isArray(lista) ? lista : []) {
      const familiaV4 = iface?.family === "IPv4" || iface?.family === 4;
      if (familiaV4 && !iface.internal && typeof iface.address === "string") {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}
