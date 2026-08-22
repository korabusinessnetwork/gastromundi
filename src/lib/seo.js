import { ehApexInstitucional } from "./apex";

/**
 * SEO que precisa saber EM QUAL HOST está — o que não cabe no index.html.
 *
 * A plataforma inteira é um deploy só: o mesmo index.html responde por
 * kora.codes (vitrine) e por casacoffee.kora.codes (login do
 * estabelecimento). Isso torna impossível deixar estático duas coisas:
 *
 *   - o canônico. `<link rel="canonical" href="https://kora.codes/">`
 *     fixo declararia todo subdomínio de estabelecimento uma cópia do
 *     apex — o buscador tiraria os dois do índice ou escolheria errado;
 *   - o "não indexe". A porta de entrada de um cliente não é página de
 *     buscador, mas o caminho dela ("/") é o MESMO da vitrine, então o
 *     robots.txt (que é por caminho) não consegue separar.
 *
 * Como o que muda é o host, e não a rota, isto roda uma vez no
 * carregamento (src/main.jsx): dentro do apex só existem "/", "/demo" e
 * "/privacidade", e a navegação entre elas é link normal, com recarga de
 * página.
 * Navegação interna que caia numa rota inexistente é tratada pela
 * própria tela de 404, que reaplica o "não indexe" enquanto está aberta.
 *
 * Funções puras onde dá (`canonicalDaRota`), efeito no DOM só nas duas
 * que precisam — o teste confere as duas coisas.
 */

const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN || "").toLowerCase();

/** Rotas do apex que podem aparecer em buscador. O resto é operação. */
export const CAMINHOS_PUBLICOS = ["/", "/demo", "/privacidade"];

/**
 * Caminho comparável: minúsculo e sem barra no fim ("/demo/" e "/Demo"
 * são a mesma página para o React Router, então também precisam ser a
 * mesma para o buscador — senão viram conteúdo duplicado).
 */
export function normalizarCaminho(pathname) {
  const bruto = String(pathname ?? "/").toLowerCase().trim();
  if (!bruto.startsWith("/")) return "/";
  const semBarraFinal = bruto.replace(/\/+$/, "");
  return semBarraFinal || "/";
}

/**
 * Endereço oficial da rota, ou `null` quando ela não deve ter um.
 *
 * O domínio vem de `VITE_ROOT_DOMAIN` (o mesmo que decide o apex): sem
 * ele configurado — dev, preview, IP — não existe endereço oficial para
 * anunciar, e a tag simplesmente não é escrita. Sempre no domínio nu,
 * que é o que junta www e não-www numa página só.
 */
export function canonicalDaRota(pathname, rootDomain = ROOT_DOMAIN) {
  const dominio = String(rootDomain ?? "").toLowerCase().trim();
  if (!dominio) return null;
  const caminho = normalizarCaminho(pathname);
  if (!CAMINHOS_PUBLICOS.includes(caminho)) return null;
  return `https://${dominio}${caminho === "/" ? "/" : caminho}`;
}

function cabecalho() {
  return typeof document === "undefined" ? null : document.head;
}

/** Escreve (ou apaga, com `null`) o `<link rel="canonical">`. */
export function definirCanonical(url) {
  const head = cabecalho();
  if (!head) return;

  const existente = head.querySelector('link[rel="canonical"]');
  if (!url) {
    if (existente) existente.remove();
    return;
  }

  const tag = existente ?? document.createElement("link");
  tag.setAttribute("rel", "canonical");
  tag.setAttribute("href", url);
  if (!existente) head.appendChild(tag);
}

/**
 * Liga/desliga o "não indexe esta página".
 *
 * `follow` junto de propósito: a página não entra no índice, mas os
 * links dela continuam valendo — é o que se usa em tela de login e de
 * erro, para não cortar o caminho de volta à vitrine.
 */
export function definirNoindex(ativo) {
  const head = cabecalho();
  if (!head) return;

  const existente = head.querySelector('meta[name="robots"]');
  if (!ativo) {
    if (existente) existente.remove();
    return;
  }

  const tag = existente ?? document.createElement("meta");
  tag.setAttribute("name", "robots");
  tag.setAttribute("content", "noindex, follow");
  if (!existente) head.appendChild(tag);
}

/**
 * Decide e aplica as duas tags para o host/rota atuais. Devolve o que
 * decidiu (`{ canonical, noindex }`) para o teste — e para quem chamar
 * saber sem ler o DOM.
 */
export function aplicarSeoDaRota({ hostname, pathname, rootDomain = ROOT_DOMAIN } = {}) {
  const local = typeof window !== "undefined" ? window.location : null;
  const caminho = normalizarCaminho(pathname ?? local?.pathname ?? "/");

  const noApex = ehApexInstitucional(hostname ?? local?.hostname, rootDomain);
  const publico = noApex && CAMINHOS_PUBLICOS.includes(caminho);

  const canonical = publico ? canonicalDaRota(caminho, rootDomain) : null;

  definirCanonical(canonical);
  definirNoindex(!publico);

  return { canonical, noindex: !publico };
}
