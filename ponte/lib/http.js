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
 * O cabeçalho `Host` do pedido aponta mesmo para esta ponte?
 *
 * Por que isso importa: o gate das rotas de gestão olha só o IP de origem da
 * conexão (`ehEnderecoLocal`). Num ataque de DNS rebinding, um site aponta o
 * próprio domínio para 127.0.0.1 — a conexão chega de "localhost" e passa no
 * gate, mas o `Host` entrega o domínio do atacante. Nenhum cliente legítimo
 * alcança a ponte por outro nome que não localhost/127.0.0.1, então exigir
 * isso não custa nada e fecha o rebinding.
 *
 * Só vale para as rotas de gestão: o Palm chega pela LAN, com o IP da
 * máquina no `Host`, e já é separado pelo token.
 *
 * @param {string|undefined} host - req.headers.host, como veio
 * @param {number} porta - porta em que a ponte está ouvindo
 */
export function hostEhLocal(host, porta) {
  if (typeof host !== "string" || !host) return false;
  const limpo = host.trim().toLowerCase();
  const separador = limpo.lastIndexOf(":");
  // `[::1]:8123` — o ':' do IPv6 mora dentro dos colchetes, só conta o de fora.
  const temPorta = separador > limpo.lastIndexOf("]");
  const nome = temPorta ? limpo.slice(0, separador) : limpo;
  const portaDoHost = temPorta ? limpo.slice(separador + 1) : "";

  if (temPorta ? portaDoHost !== String(porta) : porta !== 80) return false;
  return nome === "localhost" || nome === "127.0.0.1" || nome === "[::1]";
}

/** Origem em forma comparável: minúscula, sem espaço, sem barra no fim. */
export function normalizarOrigem(origem) {
  if (typeof origem !== "string") return "";
  const limpa = origem.trim().toLowerCase().replace(/\/+$/, "");
  return limpa === "null" ? "" : limpa;
}

/**
 * A ponte deve atender esta origem?
 *
 * O modelo é fixação no vínculo: a ponte nasce sem dono e aceita qualquer
 * origem, mas o primeiro POST /vincular grava de qual endereço veio o app do
 * caixa. Dali em diante é só ele. Isso fecha o buraco de "qualquer site
 * aberto no navegador do caixa fala com a ponte" sem quebrar o white-label,
 * porque o endereço não é escolhido por nós — é aprendido de quem vinculou.
 *
 * Duas passagens livres valem para qualquer rota, e as duas são necessárias:
 * - Sem `Origin`: não é navegador falando de outro site (curl, o próprio
 *   painel num GET). Quem manda o pedido de fora do navegador já está dentro
 *   da máquina, e aí a origem não protege mais nada.
 * - Mesma origem do pedido: é o painel ou o Palm, servidos pela própria
 *   ponte. É também a porta de saída se o endereço fixado ficar errado — o
 *   painel continua alcançável para liberar de novo.
 *
 * A terceira, "nada fixado ainda", é a delicada: enquanto a ponte não tem
 * dono, ela precisa deixar o primeiro vínculo acontecer — mas valia para
 * TUDO. Numa instalação nova (ou logo depois de "liberar para outro
 * endereço") qualquer site aberto no navegador do caixa lia /info, que
 * entrega o token do estabelecimento, e ainda podia vincular a ponte a outro
 * dono, instalar ou parar o programa. Agora essa passagem só vale para as
 * rotas do primeiro vínculo — quem diz quais são é o servidor, por
 * `primeiroVinculo`.
 *
 * @param {{origem?: string, host?: string, fixada?: string, primeiroVinculo?: boolean}} req
 *   `primeiroVinculo`: esta rota é uma das que o primeiro vínculo precisa
 *   (descobrir a ponte e vincular). Só ela passa antes de haver dono.
 */
export function origemAceita({ origem, host, fixada, primeiroVinculo = false } = {}) {
  const daVez = normalizarOrigem(origem);
  if (!daVez) return true;

  const proprio = typeof host === "string" ? host.trim().toLowerCase() : "";
  if (proprio && (daVez === `http://${proprio}` || daVez === `https://${proprio}`)) return true;

  const dona = normalizarOrigem(fixada);
  if (!dona) return primeiroVinculo === true;
  return daVez === dona;
}

/**
 * Cabeçalhos CORS da ponte, decididos por origem.
 *
 * Era `Access-Control-Allow-Origin: *`, o que deixava qualquer site aberto no
 * navegador do caixa LER a resposta de /info — e /info entrega o token. Agora
 * o cabeçalho só sai (e só ecoando a origem de quem pediu) quando a origem
 * passa em `origemAceita`. Origem recusada não recebe `Allow-Origin` nenhum:
 * o navegador barra a leitura antes de o site ver um byte.
 *
 * `Vary: Origin` sempre, porque a resposta agora depende do pedido.
 *
 * @param {{origem?: string, host?: string, fixada?: string, primeiroVinculo?: boolean}} [req]
 */
export function cabecalhosCors({ origem, host, fixada, primeiroVinculo = false } = {}) {
  const base = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Ponte-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const daVez = normalizarOrigem(origem);
  if (!daVez || !origemAceita({ origem, host, fixada, primeiroVinculo })) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": daVez,
    "Access-Control-Allow-Private-Network": "true",
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
