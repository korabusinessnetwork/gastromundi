// @vitest-environment jsdom
//
// A chave "Pedidos sem Internet" liga a Ponte KORA por estabelecimento
// (decisão 017): o dono clica em Configurações e o PC do caixa passa a
// receber os pedidos do celular do garçom. Toda essa ligação — bootstrap,
// gravação e snapshot — nunca teve teste de verdade: os testes da bridge
// dublam o contexto inteiro, então bastava um erro de digitação no nome da
// chave ("ponte_ativa", "ponteLocalAtiva") para tudo passar verde e a Ponte
// nascer desligada em produção outra vez. Aqui o AppContext é o de verdade;
// só o Supabase é dublê.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";

const { mockSupabase, mockBootstrapTenant } = vi.hoisted(() => ({
  mockBootstrapTenant: vi.fn(),
  mockSupabase: {
    from: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    channel: vi.fn(() => {
      const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
      return ch;
    }),
    removeChannel: vi.fn(),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      signInWithPassword: vi.fn(() => Promise.resolve({ data: null, error: { message: "nao deveria ser chamado" } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock("@/lib/supabase", () => ({ supabase: mockSupabase }));

// Folhas com efeito colateral, sem relação com a chave da Ponte.
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));
vi.mock("@/lib/jarvasEngine", () => ({ executarAnaliseJarvas: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/observabilidade", () => ({
  reportarFalha: vi.fn(),
  reportarInconsistencia: vi.fn(),
  setTenantObservabilidade: vi.fn(),
}));
vi.mock("@/components/shared/IndicadorRede", () => ({ default: () => null }));
// A bridge real bateria em localhost:8123 no meio do teste; quem está sob
// medida aqui é o valor que o contexto entrega a ela, não ela.
vi.mock("@/components/shared/PonteLocalBridge", () => ({ default: () => null }));
vi.mock("@/components/shared/ImpressaoLancamentosBridge", () => ({ default: () => null }));

vi.mock("@/lib/tenant", async () => {
  const real = await vi.importActual("@/lib/tenant");
  return { ...real, buscarBootstrapTenant: mockBootstrapTenant };
});

// A aba "Pedidos sem Internet" é montada aqui dentro do contexto DE VERDADE
// para provar o recado ponta a ponta. O único dublê é o programa da Ponte, que
// mora em localhost:8123 e não tem nada a ver com falta de internet no
// provedor — sem ele o teste bateria numa porta que ninguém atende.
vi.mock("@/lib/ponte", () => ({
  pingPonte: vi.fn(() => Promise.resolve({ data: null, error: new Error("ponte fora do ar") })),
  buscarInfoPonte: vi.fn(() => Promise.resolve({ data: null, error: null })),
  montarEnderecoPalm: vi.fn(() => null),
}));

import { AppProvider, useApp } from "./AppContext";
import PonteLocalConfig from "@/components/desktop/views/impressao/PonteLocalConfig";
import { saveSession } from "@/utils/session";
import { salvarSnapshot, lerSnapshot } from "@/lib/offline/snapshot";

const SESSAO_AUTH = { data: { session: { user: { id: "AUTH1", app_metadata: { tenant_id: "t1" } } } } };

const LINHA_USUARIO = {
  id: 7, name: "Gerente Teste", username: "gerente1",
  role: "gerente", auth_id: "AUTH1", permissions: null,
};

const TENANT_COMPLETO = {
  id: "t1", nome: "Casa Teste", tema: {}, planoCodigo: "avancado",
  modulosDisponiveis: ["pdv", "cozinha", "estoque"],
  addonsAtivos: [],
  assinatura: null,
};

const ERRO_REDE = { message: "TypeError: Failed to fetch" };

const PRODUTO = { id: 1, name: "Pastel", price: 10, active: true, category: "Salgados" };

/** Tudo que passou por `.upsert()`, com a tabela junto. */
let upserts = [];
/** Tudo que passou por `.in(coluna, valores)`, com a tabela junto. */
let filtrosIn = [];

/**
 * Dublê de tabela do Supabase (mesmo formato dos outros testes do contexto).
 * `resultados` responde às leituras em lista; `singles` a quem termina em
 * `.single()`/`.maybeSingle()`. Aqui ele também ANOTA os upserts e os filtros
 * `.in()` — é assim que se confere que a chave é exatamente
 * `ponte_local_ativa` dos dois lados: na gravação e no pedido ao banco.
 */
function comTabelas({ resultados = {}, singles = {}, padrao = { data: [], error: null } } = {}) {
  mockSupabase.from.mockImplementation((tabela) => {
    let ehSingle = false;
    const builder = {};
    for (const m of ["select", "eq", "neq", "order", "limit", "gte", "lte", "not", "or"]) {
      builder[m] = vi.fn(() => builder);
    }
    // `in` NÃO é passthrough puro como os outros: é nele que viaja a lista de
    // chaves de config que o bootstrap pede. Enquanto ele ignorava os
    // argumentos, trocar "ponte_local_ativa" por um typo no AppContext deixava
    // todo este arquivo verde — o dublê devolvia a config inteira do mesmo
    // jeito — e em produção a linha nunca vinha do banco.
    builder.in = vi.fn((coluna, valores) => {
      filtrosIn.push({ tabela, coluna, valores });
      return builder;
    });
    builder.single = vi.fn(() => { ehSingle = true; return builder; });
    builder.maybeSingle = builder.single;
    builder.then = (ok, falha) => Promise.resolve(
      ehSingle
        ? (singles[tabela] ?? { data: null, error: null })
        : (resultados[tabela] ?? padrao)
    ).then(ok, falha);
    const api = {};
    for (const m of ["select", "insert", "update", "delete"]) api[m] = vi.fn(() => builder);
    api.upsert = vi.fn((payload, opcoes) => {
      upserts.push({ tabela, payload, opcoes });
      return builder;
    });
    return api;
  });
}

/** jsdom nasce online; o `afterEach` desfaz apagando a propriedade própria. */
function porOffline() {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
}

/**
 * PC do caixa reabrindo com o banco fora de alcance, com a sessão local ainda
 * válida: TODA leitura volta com erro de rede — inclusive a do perfil de quem
 * está logado, que sai pelo mesmo caminho das outras e não tem por que se
 * salvar — e o app opera do snapshot.
 *
 * `navegadorOffline` é a única diferença entre os dois cenários, e é só o que
 * o NAVEGADOR sabe:
 *  - `true`  → este computador perdeu a rede e sabe disso
 *              (`navigator.onLine` false).
 *  - `false` → Wi-Fi de pé e link do provedor caído: o navegador continua se
 *              dizendo online e não acusa nada. Quem denuncia a queda são as
 *              leituras, que não chegam ao banco.
 */
function abrindoSemInternet({ navegadorOffline = true } = {}) {
  if (navegadorOffline) porOffline();
  saveSession(LINHA_USUARIO);
  comTabelas({
    padrao: { data: null, error: ERRO_REDE },
    singles: { users: { data: null, error: ERRO_REDE } },
  });
  mockBootstrapTenant.mockResolvedValue({ data: null, error: ERRO_REDE });
}

/** A rede deste computador volta e o navegador avisa, como faz de verdade. */
async function aRedeVoltou() {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => true });
  await act(async () => { window.dispatchEvent(new Event("online")); });
}

const recadoDaTela = () => screen.getByRole("status").textContent;
const botaoRecarregar = () => screen.queryByRole("button", { name: "Recarregar a tela" });
const botaoBuscar = () => screen.queryByRole("button", { name: /Buscar o ajuste agora/i });

/** O link do provedor volta: as leituras alcançam o banco outra vez. */
function oLinkVoltou() {
  comTabelas({
    singles: { users: { data: LINHA_USUARIO, error: null } },
    resultados: {
      products: { data: [PRODUTO], error: null },
      config: { data: [{ key: "ponte_local_ativa", value: true }], error: null },
    },
  });
  mockBootstrapTenant.mockResolvedValue({ data: TENANT_COMPLETO, error: null });
}

async function montar(tela = null) {
  const app = { current: null };
  const Sonda = () => {
    app.current = useApp();
    return null;
  };
  await act(async () => {
    render(
      <AppProvider>
        <Sonda />
        {tela}
      </AppProvider>,
    );
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  upserts = [];
  filtrosIn = [];
  window.localStorage.clear();
  window.sessionStorage.clear();
  comTabelas({ singles: { users: { data: LINHA_USUARIO, error: null } } });
  mockSupabase.auth.getSession.mockResolvedValue(SESSAO_AUTH);
  mockBootstrapTenant.mockResolvedValue({ data: TENANT_COMPLETO, error: null });
});

afterEach(() => {
  delete window.navigator.onLine;
});

describe("AppContext — a chave da Ponte do estabelecimento", () => {
  it("estabelecimento com a chave ligada abre com a Ponte ligada", async () => {
    comTabelas({
      singles: { users: { data: LINHA_USUARIO, error: null } },
      resultados: {
        products: { data: [PRODUTO], error: null },
        config: { data: [{ key: "ponte_local_ativa", value: true }], error: null },
      },
    });

    const app = await montar();

    expect(app.current.ponteLocalAtiva).toBe(true);
  });

  it("o bootstrap pede `ponte_local_ativa` ao banco na lista de configs", async () => {
    // Guarda do teste acima. Ler a chave certa do resultado não adianta se ela
    // não foi PEDIDA: o bootstrap busca as configs com `.in("key", [...])`, e
    // um erro de digitação nessa lista não quebra teste nenhum sozinho — o
    // dublê entrega a config do mesmo jeito e o estado sai certo. No banco de
    // verdade a linha nunca vem, e a Ponte nasce desligada no estabelecimento
    // que a ligou. Por isso a conferência é no pedido, não só na resposta.
    comTabelas({
      singles: { users: { data: LINHA_USUARIO, error: null } },
      resultados: {
        products: { data: [PRODUTO], error: null },
        config: { data: [{ key: "ponte_local_ativa", value: true }], error: null },
      },
    });

    await montar();

    const filtro = filtrosIn.find((f) => f.tabela === "config" && f.coluna === "key");
    expect(filtro, "o bootstrap não pediu chave nenhuma da tabela config").toBeDefined();
    expect(filtro.valores).toContain("ponte_local_ativa");
  });

  it("estabelecimento que nunca ligou fica desligado — e não em 'ainda não sei' para sempre", async () => {
    // A ausência da chave É resposta quando o banco respondeu. Se ficasse
    // `null`, a bridge nunca ligaria nem desligaria: ficaria eternamente
    // esperando uma config que não vem.
    comTabelas({
      singles: { users: { data: LINHA_USUARIO, error: null } },
      resultados: {
        products: { data: [PRODUTO], error: null },
        config: { data: [{ key: "fundo_atual", value: 200 }], error: null },
      },
    });

    const app = await montar();

    expect(app.current.ponteLocalAtiva).toBe(false);
  });

  it("ligar a chave grava em `config` exatamente a chave `ponte_local_ativa`", async () => {
    // O nome da chave é contrato com o banco e com o snapshot. Um erro de
    // digitação aqui não quebra nada visível: só faz a Ponte nunca ligar.
    comTabelas({
      singles: { users: { data: LINHA_USUARIO, error: null } },
      resultados: {
        products: { data: [PRODUTO], error: null },
        config: { data: [], error: null },
      },
    });
    const app = await montar();
    expect(app.current.ponteLocalAtiva).toBe(false);

    await act(async () => { await app.current.setPonteLocalAtiva(true); });

    const gravacao = upserts.find((u) => u.tabela === "config");
    expect(gravacao).toBeDefined();
    expect(gravacao.payload).toEqual({ key: "ponte_local_ativa", value: true });
    expect(gravacao.opcoes).toEqual({ onConflict: "tenant_id,key" });
    expect(app.current.ponteLocalAtiva).toBe(true);
  });

  it("ligar a chave hoje mantém a Ponte ligada na queda de internet de amanhã", async () => {
    // O defeito: o snapshot desta abertura já tinha sido gravado com a chave
    // ANTIGA (desligada), e é ele que manda quando o PC abre sem internet —
    // justamente o dia em que a Ponte deveria trabalhar. Ligar a chave agora
    // tem de corrigir o snapshot também, sem levar junto o resto dele.
    comTabelas({
      singles: { users: { data: LINHA_USUARIO, error: null } },
      resultados: {
        products: { data: [PRODUTO], error: null },
        config: { data: [{ key: "fundo_atual", value: 200 }], error: null },
      },
    });
    const app = await montar();
    expect(lerSnapshot(window.localStorage, "t1").config.ponteLocalAtiva).toBe(false);

    await act(async () => { await app.current.setPonteLocalAtiva(true); });

    const snapshot = lerSnapshot(window.localStorage, "t1");
    expect(snapshot.config.ponteLocalAtiva).toBe(true);
    expect(snapshot.config.fundoAtual).toBe(200); // o resto do snapshot fica de pé
    expect(snapshot.products).toHaveLength(1);
  });

  it("abertura sem internet respeita a chave que o estabelecimento deixou ligada", async () => {
    salvarSnapshot(
      window.localStorage,
      { products: [PRODUTO], pending: [], config: { ponteLocalAtiva: true } },
      "t1",
    );
    abrindoSemInternet();

    const app = await montar();

    expect(app.current.products).toHaveLength(1); // hidratou mesmo do snapshot
    expect(app.current.ponteLocalAtiva).toBe(true);
  });

  it("snapshot antigo, sem a chave, não desliga a Ponte por conta própria", async () => {
    // Snapshot gravado antes de o dono ligar a chave não sabe nada sobre ela.
    // Tratar esse silêncio como "desligado" derrubava a Ponte na primeira
    // abertura sem internet — e sem internet não dá nem para religar, porque
    // gravar config precisa de banco.
    salvarSnapshot(
      window.localStorage,
      { products: [PRODUTO], pending: [], config: { fundoAtual: 200 } },
      "t1",
    );
    abrindoSemInternet();

    const app = await montar();

    expect(app.current.ponteLocalAtiva).toBeNull();
    expect(app.current.fundoAtual).toBe(200); // o resto do snapshot hidratou normal
    // E o contexto CONTA que operou do snapshot: é esse aviso que a aba
    // "Pedidos sem Internet" usa para não oferecer um botão de recarregar que
    // só refaria o mesmo caminho.
    expect(app.current.abriuSemInternet).toBe(true);
  });

  it("link do provedor caído com o navegador se dizendo online: a tela diz que está sem internet e não oferece recarregar", async () => {
    // O caso comum do restaurante: o roteador está de pé, então
    // `navigator.onLine` continua `true` e não acusa nada — e NENHUMA leitura
    // chega ao banco, nem a do perfil de quem está logado. Se o app parasse na
    // leitura do perfil, ninguém carimbava "abriu sem internet": a tela lia só
    // o navegador, concluía "o banco recusou a leitura" e mostrava um botão
    // "Recarregar a tela" que, sem internet, devolve exatamente o mesmo estado.
    //
    // Aqui a tela é a de verdade, montada dentro do contexto de verdade: o que
    // se confere é o que o dono lê.
    salvarSnapshot(
      window.localStorage,
      { products: [PRODUTO], pending: [], config: { fundoAtual: 200 } },
      "t1",
    );
    abrindoSemInternet({ navegadorOffline: false });

    const app = await montar(<PonteLocalConfig />);

    expect(window.navigator.onLine).toBe(true); // o sinal do navegador não acusa nada
    expect(app.current.products).toHaveLength(1); // mas hidratou do snapshot
    expect(app.current.ponteLocalAtiva).toBeNull(); // snapshot antigo não conhece a chave
    expect(app.current.abriuSemInternet).toBe(true);
    expect(app.current.currentUser).toMatchObject({ id: 7 }); // e ninguém foi deslogado
    expect(recadoDaTela()).toContain("Sem internet agora");
    expect(botaoRecarregar()).toBeNull();
  });

  it("abertura com o banco respondendo não carimba 'abriu sem internet'", async () => {
    // O carimbo é exceção, não o normal: só o caminho offline o liga.
    comTabelas({
      singles: { users: { data: LINHA_USUARIO, error: null } },
      resultados: {
        products: { data: [PRODUTO], error: null },
        config: { data: [{ key: "ponte_local_ativa", value: true }], error: null },
      },
    });

    const app = await montar();

    expect(app.current.abriuSemInternet).toBe(false);
  });

  it("com a conexão de volta, uma carga que alcançou o banco apaga o carimbo", async () => {
    // Carimbo que nunca se apaga é tão ruim quanto carimbo que nunca aparece:
    // a tela anunciaria falta de internet num estabelecimento que já está
    // online. Aqui a segunda carga (o login, depois que a conexão voltou)
    // alcança o banco, e só a leitura das configs é recusada — não é erro de
    // rede, então a chave da Ponte segue sem resposta e o recado da tela volta
    // a depender do carimbo.
    salvarSnapshot(
      window.localStorage,
      { products: [PRODUTO], pending: [], config: { fundoAtual: 200 } },
      "t1",
    );
    abrindoSemInternet({ navegadorOffline: false });
    const app = await montar();
    expect(app.current.abriuSemInternet).toBe(true);

    comTabelas({
      singles: { users: { data: LINHA_USUARIO, error: null } },
      resultados: {
        products: { data: [PRODUTO], error: null },
        config: { data: null, error: { message: "permission denied for table config" } },
      },
    });
    mockBootstrapTenant.mockResolvedValue({ data: TENANT_COMPLETO, error: null });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "AUTH1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    await act(async () => { await app.current.login("gerente1", "SenhaCerta#123"); });

    expect(app.current.ponteLocalAtiva).toBeNull(); // o ajuste continua sem resposta
    expect(app.current.abriuSemInternet).toBe(false); // mas a causa não é falta de internet
  });

  it("com a internet de volta, a tela para de dizer 'sem internet' e devolve o botão de recarregar", async () => {
    // Carimbo que não se apaga vira mentira: o estabelecimento já reconectou e
    // a tela continua afirmando no presente que está sem internet — e pior,
    // continua escondendo o botão "Recarregar a tela", que agora é exatamente
    // o que traz o ajuste. Ninguém relê a config sozinho, então o caminho de
    // saída tem que voltar a aparecer.
    salvarSnapshot(
      window.localStorage,
      { products: [PRODUTO], pending: [], config: { fundoAtual: 200 } },
      "t1",
    );
    abrindoSemInternet(); // este computador ficou sem rede

    const app = await montar(<PonteLocalConfig />);
    expect(app.current.abriuSemInternet).toBe(true);
    expect(recadoDaTela()).toContain("Sem internet agora");
    expect(botaoRecarregar()).toBeNull();

    await aRedeVoltou();

    expect(app.current.abriuSemInternet).toBe(false);
    expect(app.current.ponteLocalAtiva).toBeNull(); // o ajuste continua sem resposta
    expect(recadoDaTela()).toContain("Não deu para carregar o ajuste");
    expect(botaoRecarregar()).not.toBeNull();
  });

  it("link do provedor de volta sem aviso nenhum do navegador: o dono clica no botão e a tela se recupera", async () => {
    // O cenário que ninguém resolvia. O roteador nunca caiu, então a placa de
    // rede deste computador não perdeu nada e o navegador NÃO emite `online`
    // quando o link do provedor volta — o carimbo ficava ligado para sempre e
    // a tela repetia "Sem internet agora" com o estabelecimento já online.
    // Repare que nenhum evento é disparado aqui: quem avisa que a conexão
    // voltou é o dono, no clique, e a carga que roda é a mesma da abertura do
    // sistema.
    salvarSnapshot(
      window.localStorage,
      { products: [PRODUTO], pending: [], config: { fundoAtual: 200 } },
      "t1",
    );
    abrindoSemInternet({ navegadorOffline: false });

    const app = await montar(<PonteLocalConfig />);
    expect(app.current.abriuSemInternet).toBe(true);
    expect(recadoDaTela()).toContain("Sem internet agora");
    expect(botaoBuscar()).not.toBeNull();

    oLinkVoltou();
    // Segura a carga no meio para olhar o botão trabalhando. Enquanto ela
    // roda o contexto liga o `loading`, e é aí que o botão sumiria da tela
    // debaixo do dedo de quem acabou de clicar.
    let liberarCarga;
    mockBootstrapTenant.mockReturnValue(new Promise((r) => { liberarCarga = r; }));

    await act(async () => { fireEvent.click(botaoBuscar()); });
    const trabalhando = screen.getByRole("button", { name: /Buscando o ajuste/i });
    expect(trabalhando.disabled).toBe(true);

    await act(async () => { liberarCarga({ data: TENANT_COMPLETO, error: null }); });

    // Nenhum evento `online` é disparado neste teste: a recuperação vem só do clique.
    expect(window.navigator.onLine).toBe(true); // o sinal do navegador nunca acusou queda
    expect(app.current.abriuSemInternet).toBe(false); // o carimbo caiu
    expect(app.current.ponteLocalAtiva).toBe(true);   // o ajuste chegou
    expect(recadoDaTela()).toBe("Ligado");
    expect(botaoBuscar()).toBeNull(); // não sobrou saída de emergência na tela
  });

  it("clicou e a internet ainda não voltou: a tela segue honesta e o botão volta a aceitar clique", async () => {
    // Botão que promete e não entrega vira desconfiança. Se a conexão ainda
    // está fora, o bootstrap religa o carimbo, o recado conta que a tentativa
    // de agora não deu — parecer que o clique não fez nada é o pior desfecho —
    // e o dono pode tentar outra vez daqui a pouco.
    salvarSnapshot(
      window.localStorage,
      { products: [PRODUTO], pending: [], config: { fundoAtual: 200 } },
      "t1",
    );
    abrindoSemInternet({ navegadorOffline: false });

    const app = await montar(<PonteLocalConfig />);
    expect(recadoDaTela()).toContain("Sem internet agora");

    filtrosIn = []; // só interessa o que o CLIQUE pedir ao banco daqui pra frente
    await act(async () => { fireEvent.click(botaoBuscar()); });

    // O clique buscou de verdade: pediu o ajuste ao banco outra vez. Sem esta
    // conferência o recado de "tentamos agora e não deu" passaria mesmo se o
    // botão não tivesse tentado nada.
    expect(filtrosIn.some((f) => f.tabela === "config" && f.valores?.includes("ponte_local_ativa"))).toBe(true);
    expect(app.current.abriuSemInternet).toBe(true); // continua sem alcançar o banco
    expect(app.current.ponteLocalAtiva).toBeNull();  // e sem o ajuste
    expect(recadoDaTela()).toContain("Ainda sem internet — tentamos agora e não deu");
    expect(botaoBuscar()).not.toBeNull();
    expect(botaoBuscar().disabled).toBe(false);
  });
});
