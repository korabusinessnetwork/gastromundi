// Cliente da Ponte KORA (Leva 13) — fala com o servidor local que roda
// no PC do caixa (ponte/servidor.js) via http://localhost, a única origem
// http:// que um app HTTPS pode alcançar (exceção de conteúdo misto).
//
// Contrato no padrão do resto do app: sempre resolve { data, error } —
// nunca lança. Timeouts curtos: a ponte é local, ou responde em
// milissegundos ou não está rodando.

const PORTA_PADRAO = 8123;

export const PONTE_URL = `http://localhost:${PORTA_PADRAO}`;

const TIMEOUT_MS = 3000;

async function chamarPonte(caminho, { metodo = "GET", corpo } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(`${PONTE_URL}${caminho}`, {
      method: metodo,
      signal: controller.signal,
      ...(corpo !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }
        : {}),
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      return { data: null, error: new Error(dados?.erro || `ponte respondeu ${resposta.status}`) };
    }
    return { data: dados, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  } finally {
    clearTimeout(timer);
  }
}

/** A ponte está rodando neste PC? (GET /saude) */
export async function pingPonte() {
  const { data, error } = await chamarPonte("/saude");
  return { data: error ? null : data, error };
}

/** Info de gestão: token, endereços da rede, pendentes. (GET /info) */
export async function buscarInfoPonte() {
  return chamarPonte("/info");
}

/** Envia o catálogo/config para a ponte servir ao Palm. (POST /snapshot) */
export async function enviarSnapshotPonte(snapshot) {
  return chamarPonte("/snapshot", { metodo: "POST", corpo: snapshot });
}

/** Pedidos que o Palm mandou e o caixa ainda não gravou. (GET /pedidos) */
export async function buscarPedidosPonte() {
  return chamarPonte("/pedidos");
}

/** Avisa a ponte que os pedidos foram gravados/impressos. (POST /pedidos/confirmar) */
export async function confirmarPedidosPonte(ids) {
  return chamarPonte("/pedidos/confirmar", { metodo: "POST", corpo: { ids } });
}

/** Monta o link que o Palm abre (página servida pela própria ponte). */
export function montarEnderecoPalm(info) {
  const ip = info?.enderecos?.[0];
  if (!ip || !info?.token) return null;
  return `http://${ip}:${info.porta ?? PORTA_PADRAO}/palm?t=${info.token}`;
}
