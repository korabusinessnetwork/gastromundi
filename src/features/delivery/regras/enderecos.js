import { apenasDigitosCep, cepCompleto } from "./carrinho";

// Endereço por serviços gratuitos de terceiros (ViaCEP e OpenStreetMap), com prazo para responder.
// ── Terceiros (ViaCEP / Nominatim) — prazo para responder ──────────

/**
 * Prazo máximo para um serviço de terceiro responder. Nem o `fetch` nem o
 * navegador impõem um limite curto: um socket que abre e não responde fica
 * pendurado por minutos.
 *
 * Sem prazo, o Nominatim (grátis, limite de 1 req/s, sujeito a engasgar)
 * deixava o checkout MORTO no modo "por distância": a tela ficava em
 * "Calculando a taxa de entrega…" para sempre, o "Ir para o pagamento"
 * nunca liberava e o "Tentar de novo" nem aparecia — os dois dependem de a
 * busca ter TERMINADO. A única saída era recarregar a página no meio da
 * compra. O ViaCEP pendurado deixava o "Buscando endereço…" colado na tela
 * pelo resto da sessão.
 */
const PRAZO_TERCEIRO_MS = 8000;

/**
 * Busca JSON num terceiro com prazo. Estourado o prazo, o abort estoura no
 * `catch` de quem chamou e vira a mesma degradação graciosa de qualquer
 * falha de rede — nunca travar por terceiro é regra da spec.
 *
 * O prazo cobre a leitura do corpo também, não só os cabeçalhos: um corpo
 * que começa a chegar e para no meio pendura igual.
 *
 * AbortController em vez de AbortSignal.timeout: o Safari só ganhou o
 * timeout na 16, e a vitrine roda no celular do cliente (mesmo cuidado do
 * crypto.randomUUID em useCarrinho.js). Um `signal` de fora continua
 * valendo — quem cancela busca obsoleta (autocomplete) não perde nada.
 *
 * @returns {Promise<any|null>} JSON, ou null se a resposta não vier ok.
 */
async function jsonComPrazo(url, { signal, ...opcoes } = {}, ms = PRAZO_TERCEIRO_MS) {
  const controle = new AbortController();
  const alarme = setTimeout(() => controle.abort(), ms);
  const repassar = () => controle.abort();
  if (signal?.aborted) controle.abort();
  else signal?.addEventListener("abort", repassar);
  try {
    const resp = await fetch(url, { ...opcoes, signal: controle.signal });
    if (!resp.ok) return null;
    return await resp.json();
  } finally {
    clearTimeout(alarme);
    signal?.removeEventListener("abort", repassar);
  }
}

// ── ViaCEP (grátis, frontend) — degradação graciosa ────────────────

/**
 * Resolve endereço a partir do CEP via ViaCEP. Nunca lança: falha de rede
 * ou CEP inexistente vira { data: null } e a tela deixa o cliente digitar
 * o bairro/endereço à mão (exceção da spec: nunca travar por terceiro).
 * @param {string} cep
 * @returns {Promise<{data: {bairro: string, logradouro: string, cidade: string, uf: string}|null, error: object|null}>}
 */
export async function buscarEnderecoViaCep(cep) {
  const d = apenasDigitosCep(cep);
  if (d.length !== 8) return { data: null, error: null };
  try {
    const json = await jsonComPrazo(`https://viacep.com.br/ws/${d}/json/`);
    if (!json || json.erro) return { data: null, error: null };
    return {
      data: {
        bairro: json.bairro ?? "",
        logradouro: json.logradouro ?? "",
        cidade: json.localidade ?? "",
        uf: json.uf ?? "",
      },
      error: null,
    };
  } catch {
    return { data: null, error: null };
  }
}

// ── Nominatim / OpenStreetMap (grátis) — geocodificação p/ taxa por km ──

/**
 * A escada de consultas para achar o endereço no mapa, da mais precisa
 * para a mais tolerante. Pura — quem vai à rede é `localizarEndereco`.
 *
 * POR QUE UMA ESCADA. No modo "taxa por distância" o pedido só sai se a
 * coordenada for encontrada. Antes se mandava UMA consulta, montada como
 * "rua, bairro" — sem a cidade. Duas consequências, as duas ruins:
 *
 *  · sem cidade, o Nominatim procura a rua no Brasil inteiro. "Rua das
 *    Flores, 100, Centro" existe em centenas de cidades: ou não acha, ou
 *    acha a errada e a taxa sai de uma distância que não é a real;
 *  · qualquer tropeço na digitação da rua — uma letra trocada, "av." em
 *    vez de "avenida", o número da casa que o Nominatim não reconhece —
 *    derrubava a única tentativa, e o cliente ficava com o botão morto
 *    sem saber o que corrigir.
 *
 * Cada degrau abre mão de um detalhe e mantém o resto. A última é o
 * bairro com a cidade: aproxima pelo centro do bairro, o que ainda dá uma
 * taxa honesta. NÃO existe degrau de "só a cidade" — o centro da cidade
 * pode estar a quilômetros do cliente, e aí a taxa mentiria feio.
 *
 * @param {{endereco?:string, bairro?:string, cidade?:string, cep?:string}} partes
 * @returns {Array<{q:string, precisao:'exata'|'aproximada'}>} sem repetição, em ordem
 */
export function consultasDeGeocodificacao(partes) {
  const limpo = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
  const endereco = limpo(partes?.endereco);
  const bairro = limpo(partes?.bairro);
  const cidade = limpo(partes?.cidade);
  const cep = apenasDigitosCep(partes?.cep);

  // "Rua das Flores, 100" → "Rua das Flores". O número da casa é a parte
  // que o Nominatim mais erra, e tirá-lo costuma resolver sozinho.
  const semNumero = endereco.replace(/,?\s*\d+\s*$/, "").trim();

  const juntar = (...ps) => ps.filter(Boolean).join(", ");
  // Cada degrau só existe se a peça que o define existir. Sem esta guarda,
  // um formulário só com a cidade fazia o primeiro degrau virar "Porto
  // Alegre" — o degrau proibido, entrando pela porta dos fundos.
  const candidatos = [
    { q: endereco ? juntar(endereco, bairro, cidade) : "", precisao: "exata" },
    { q: endereco ? juntar(endereco, cidade) : "", precisao: "exata" },
    { q: endereco && semNumero && semNumero !== endereco ? juntar(semNumero, bairro, cidade) : "", precisao: "exata" },
    { q: cepCompleto(cep) ? cep : "", precisao: "aproximada" },
    // Os DOIS, sempre. Só o bairro cai no mesmo problema da rua sem cidade
    // (procura no Brasil inteiro), e só a cidade seria o degrau proibido:
    // o centro da cidade pode estar a quilômetros do cliente.
    { q: bairro && cidade ? juntar(bairro, cidade) : "", precisao: "aproximada" },
  ];

  const vistos = new Set();
  return candidatos.filter((c) => {
    // Consulta curta demais o Nominatim recusa.
    if (!c.q || c.q.length < 4) return false;
    const chave = c.q.toLowerCase();
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

/**
 * Percorre a escada acima e devolve a PRIMEIRA coordenada encontrada,
 * dizendo se ela é do endereço exato ou uma aproximação pelo bairro/CEP —
 * a tela usa isso para avisar que a taxa é estimada.
 *
 * PRAZO DA ESCADA INTEIRA, e não de cada degrau. Cada chamada ao Nominatim
 * já tem 8s (PRAZO_TERCEIRO_MS); cinco degraus em fila seriam até 40s com a
 * tela presa em "Calculando…" — trocar um endereço que não é achado por uma
 * espera de quarenta segundos não melhora nada.
 *
 * O orçamento é UM tempo limite (PRAZO_TERCEIRO_MS). A regra por trás:
 * se uma única tentativa consumiu o prazo inteiro, o serviço está fora do
 * ar e as outras quatro vão consumir o mesmo à toa. Quando ele responde
 * rápido — que é o caso normal — os cinco degraus cabem em menos de um
 * segundo e o orçamento nunca é alcançado.
 *
 * Mesma degradação graciosa do resto: nunca lança; nada encontrado vira
 * { data: null }.
 *
 * @param {{endereco?:string, bairro?:string, cidade?:string, cep?:string}} partes
 * @param {{orcamentoMs?:number, agora?:() => number}} [opts] - `agora` injetável para teste
 * @returns {Promise<{data: {lat:number, lng:number, precisao:string}|null, error: null}>}
 */
export async function localizarEndereco(partes, { orcamentoMs = PRAZO_TERCEIRO_MS, agora = Date.now } = {}) {
  const inicio = agora();
  for (const { q, precisao } of consultasDeGeocodificacao(partes)) {
    const { data } = await geocodificarEndereco(q);
    if (data) return { data: { ...data, precisao }, error: null };
    if (agora() - inicio >= orcamentoMs) break;
  }
  return { data: null, error: null };
}

/**
 * Resolve latitude/longitude a partir de um endereço em texto, usando o
 * Nominatim (OpenStreetMap) — grátis, sem chave. Usado só no modo "por
 * distância": o navegador do cliente geocodifica o endereço digitado e
 * manda a coordenada pro servidor, que calcula a distância e a taxa.
 *
 * Degradação graciosa (mesma regra do ViaCEP): nunca lança. Falha de rede
 * ou endereço não encontrado vira { data: null } — a tela deixa o cliente
 * seguir/tentar de novo, nunca trava por causa de terceiro.
 *
 * @param {string} endereco - endereço livre (rua, número, bairro, cidade…)
 * @returns {Promise<{data: {lat:number, lng:number}|null, error: object|null}>}
 */
export async function geocodificarEndereco(endereco) {
  const q = String(endereco ?? "").trim();
  if (q.length < 4) return { data: null, error: null };
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=" +
      encodeURIComponent(q);
    const json = await jsonComPrazo(url, { headers: { Accept: "application/json" } });
    const primeiro = Array.isArray(json) ? json[0] : null;
    if (!primeiro) return { data: null, error: null };
    const lat = Number(primeiro.lat);
    const lng = Number(primeiro.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { data: null, error: null };
    }
    return { data: { lat, lng }, error: null };
  } catch {
    return { data: null, error: null };
  }
}

/**
 * Autocomplete de endereço: a partir de um texto parcial, sugere até 5
 * opções (rótulo legível + coordenada) via Nominatim (OpenStreetMap) —
 * grátis, sem chave. O dono escolhe a origem do delivery sem precisar
 * digitar o endereço exato.
 *
 * Mesma degradação graciosa do geocodificarEndereco: nunca lança; rede,
 * abort ou vazio → { data: [] }. Aceita um AbortSignal para cancelar buscas
 * obsoletas enquanto o usuário continua digitando (debounce no chamador —
 * respeita o limite de 1 req/s do Nominatim).
 *
 * @param {string} texto - endereço parcial digitado
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<{data: Array<{nome:string, lat:number, lng:number}>, error: object|null}>}
 */
export async function sugerirEnderecos(texto, { signal } = {}) {
  const q = String(texto ?? "").trim();
  if (q.length < 4) return { data: [], error: null };
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=br&q=" +
      encodeURIComponent(q);
    const json = await jsonComPrazo(url, { headers: { Accept: "application/json" }, signal });
    const lista = Array.isArray(json) ? json : [];
    const data = lista
      .map((it) => ({
        nome: String(it?.display_name ?? "").trim(),
        lat: Number(it?.lat),
        lng: Number(it?.lon),
      }))
      .filter((it) => it.nome && Number.isFinite(it.lat) && Number.isFinite(it.lng));
    return { data, error: null };
  } catch {
    return { data: [], error: null };
  }
}
