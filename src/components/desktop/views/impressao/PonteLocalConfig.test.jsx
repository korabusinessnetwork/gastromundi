// @vitest-environment jsdom
//
// A chave "Receber pedidos do celular do garçom neste computador" é o único
// lugar onde o dono liga a Ponte sozinho. Se ela mentir o estado (aparecer
// desligada enquanto o ajuste ainda carrega, ou continuar ligada depois de a
// gravação falhar), o dono conclui que o recurso não funciona e desiste.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

const { mockUseApp, mockPingPonte } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockPingPonte: vi.fn(),
}));
vi.mock("@/context/AppContext", () => ({ useApp: mockUseApp }));
vi.mock("@/lib/ponte", () => ({
  pingPonte: mockPingPonte,
  buscarInfoPonte: vi.fn(() => Promise.resolve({ data: null, error: null })),
  montarEnderecoPalm: () => null,
}));

import PonteLocalConfig from "./PonteLocalConfig";

const setPonteLocalAtiva = vi.fn(() => Promise.resolve({ error: null }));
// A busca que o dono aciona quando a internet volta: no app é o `bootstrap` do
// AppContext, a mesma carga da abertura do sistema.
const recarregarDadosDoEstabelecimento = vi.fn(() => Promise.resolve());

// `loading` é o do AppContext: true enquanto o sistema ainda está abrindo.
// É ele que separa "o ajuste ainda vem" de "o ajuste não vem mais".
//
// `sinais` entrega os DOIS avisos de falta de internet, um de cada vez, do
// jeito que eles aparecem na vida real: `redeOnline` é o `navigator.onLine`
// (a placa de rede deste aparelho) e `abriuSemInternet` é o AppContext
// dizendo que a carga não alcançou o banco. Quem não passa nenhum recebe
// `undefined` nos dois — é assim que o contexto se comporta em quem ainda não
// lê esses campos, e o caminho de sempre tem de continuar valendo.
const abrir = async (ponteLocalAtiva, loading = false, sinais = {}) => {
  mockUseApp.mockReturnValue({
    ponteLocalAtiva, setPonteLocalAtiva, loading,
    recarregarDadosDoEstabelecimento,
    ...sinais,
  });
  await act(async () => { render(<PonteLocalConfig />); });
};

const chave = () => screen.getByRole("switch");
const botaoBuscar = () => screen.queryByRole("button", { name: /Buscar o ajuste agora/i });

beforeEach(() => {
  vi.clearAllMocks();
  // Sem a Ponte instalada: a tela cai no caminho de instalação e o QR nem
  // entra em cena — aqui o que interessa é a chave.
  mockPingPonte.mockResolvedValue({ data: null, error: new Error("sem ponte") });
  setPonteLocalAtiva.mockResolvedValue({ error: null });
  recarregarDadosDoEstabelecimento.mockResolvedValue(undefined);
});

describe("PonteLocalConfig — chave de liga/desliga do estabelecimento", () => {
  it("enquanto o ajuste não chegou, não afirma ligado nem desligado e não deixa clicar", async () => {
    await abrir(null, true);
    expect(chave()).toBeDisabled();
    expect(screen.getByText(/Carregando o ajuste/i)).toBeTruthy();
  });

  // O sistema terminou de abrir e o ajuste não veio (abriu sem internet e sem
  // cópia salva, ou o banco recusou a leitura). Um "Carregando…" eterno faria
  // o dono concluir que o recurso está quebrado.
  it("quando o sistema já abriu e o ajuste não veio, admite que não sabe e oferece recarregar", async () => {
    await abrir(null, false);
    expect(chave()).toBeDisabled();
    expect(screen.queryByText(/Carregando o ajuste/i)).toBeNull();
    expect(screen.getByText(/Não deu para carregar o ajuste/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Recarregar a tela/i })).toBeTruthy();
    // Cada causa com o botão que resolve ela: aqui a rede está de pé, então o
    // botão de buscar de novo não tem o que fazer e não aparece.
    expect(screen.queryByRole("button", { name: /Buscar o ajuste agora/i })).toBeNull();
  });

  // O aparelho sabe que está sem rede: recarregar refaz o mesmo caminho e
  // devolve o mesmo recado, então o botão não aparece.
  it("com o aparelho offline, troca o recado e não oferece um botão que não resolve", async () => {
    await abrir(null, false, { redeOnline: false });

    expect(screen.getByText(/Sem internet agora/i)).toBeTruthy();
    expect(screen.queryByText(/Não deu para carregar o ajuste/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Recarregar a tela/i })).toBeNull();
  });

  // O caso mais comum do restaurante: Wi-Fi de pé e link do provedor caído. O
  // `navigator.onLine` continua dizendo "online" — quem sabe a verdade é o
  // AppContext, que não alcançou o banco e abriu com a cópia salva. Enquanto a
  // tela olhava só o navegador, esse cenário caía no recado de falha do banco
  // e ganhava um "Recarregar a tela" que não resolvia nada.
  it("mesmo com o navegador se dizendo online, reconhece a abertura sem internet", async () => {
    await abrir(null, false, { redeOnline: true, abriuSemInternet: true });

    expect(screen.getByText(/Sem internet agora/i)).toBeTruthy();
    expect(screen.queryByText(/Não deu para carregar o ajuste/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Recarregar a tela/i })).toBeNull();
  });

  // Nada relê a config sozinho quando a conexão volta. Prometer que o ajuste
  // chega sozinho deixava o dono esperando por algo que não vem: o recado
  // aponta o botão, que é o que traz o ajuste quando ele clicar.
  it("o recado sem internet não promete ajuste que chega sozinho — aponta o botão", async () => {
    await abrir(null, false, { redeOnline: false });

    expect(screen.queryByText(/só chega quando a conexão voltar/i)).toBeNull();
    expect(screen.getByText(/quando a conexão voltar, toque no botão abaixo/i)).toBeTruthy();
  });

  // O defeito que motivou esta frente: sem internet a tela escondia o único
  // botão que resolveria e ficava repetindo "Sem internet agora" para sempre.
  it("com a internet fora, oferece o botão que busca o ajuste de novo", async () => {
    await abrir(null, false, { redeOnline: true, abriuSemInternet: true });

    await act(async () => { fireEvent.click(botaoBuscar()); });

    expect(recarregarDadosDoEstabelecimento).toHaveBeenCalledTimes(1);
  });

  // Botão que não muda de cara depois do clique faz o dono clicar de novo — e
  // duas cargas em fila só fazem o caixa esperar o dobro.
  it("enquanto busca, o botão mostra que está trabalhando e não aceita um segundo clique", async () => {
    let terminarBusca;
    recarregarDadosDoEstabelecimento.mockReturnValue(
      new Promise((resolve) => { terminarBusca = resolve; }),
    );
    await abrir(null, false, { redeOnline: false });

    await act(async () => { fireEvent.click(botaoBuscar()); });

    const trabalhando = screen.getByRole("button", { name: /Buscando o ajuste/i });
    expect(trabalhando.disabled).toBe(true);
    await act(async () => { fireEvent.click(trabalhando); });
    expect(recarregarDadosDoEstabelecimento).toHaveBeenCalledTimes(1);

    await act(async () => { terminarBusca(); });
    expect(botaoBuscar()).not.toBeNull(); // e volta a aceitar clique
    expect(botaoBuscar().disabled).toBe(false);
  });

  // Sem esse recado o dono clica, a tela não muda em nada visível e ele
  // conclui que o botão está quebrado.
  it("buscou e a internet ainda está fora: a tela conta que a tentativa não deu", async () => {
    await abrir(null, false, { redeOnline: false });
    expect(screen.getByText(/Sem internet agora/i)).toBeTruthy();

    await act(async () => { fireEvent.click(botaoBuscar()); });

    expect(screen.getByText(/Ainda sem internet — tentamos agora e não deu/i)).toBeTruthy();
  });

  // Sem saber o ajuste, não dá para dizer que a chave está desligada — seria
  // afirmar uma resposta que não temos bem em cima da impressão da comanda.
  it("sem o ajuste, não acusa a chave de estar desligada mesmo com a ponte rodando", async () => {
    mockPingPonte.mockResolvedValue({ data: { ok: true }, error: null });
    await abrir(null, false);

    expect(screen.queryByText(/a chave acima está desligada/i)).toBeNull();
  });

  it("mostra Desligado e liga a chave no clique", async () => {
    await abrir(false);
    expect(chave().getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Desligado")).toBeTruthy();

    await act(async () => { fireEvent.click(chave()); });
    expect(setPonteLocalAtiva).toHaveBeenCalledWith(true);
  });

  it("mostra Ligado e desliga a chave no clique", async () => {
    await abrir(true);
    expect(chave().getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Ligado")).toBeTruthy();

    await act(async () => { fireEvent.click(chave()); });
    expect(setPonteLocalAtiva).toHaveBeenCalledWith(false);
  });

  it("avisa quando não deu para salvar", async () => {
    setPonteLocalAtiva.mockResolvedValue({ error: new Error("rls") });
    await abrir(false);

    await act(async () => { fireEvent.click(chave()); });
    expect(screen.getByText(/Não deu para salvar/i)).toBeTruthy();
  });

  it("com a Ponte rodando e a chave desligada, avisa antes de o garçom escanear qualquer coisa", async () => {
    mockPingPonte.mockResolvedValue({ data: { ok: true }, error: null });
    await abrir(false);

    expect(screen.getByText(/a chave acima está desligada/i)).toBeTruthy();
    expect(screen.queryByAltText(/QR code/i)).toBeNull();
  });
});

// O outro buraco do mesmo tamanho: a tela manda "copie o arquivo
// KoraPonte.exe para este computador" sem nunca dizer de onde vem o arquivo.
// Quem não recebeu o instalador por fora não tem o que fazer com o passo 1.
// O botão fecha isso — mas só pode existir com endereço de verdade no build:
// botão que não leva a lugar nenhum é pior que instrução sem botão.
const ENDERECO = "https://exemplo.invalid/KoraPonte.zip";

/** Abre a tela sem a ponte instalada, como se o build tivesse este endereço. */
const abrirComEndereco = async (endereco) => {
  vi.resetModules();
  vi.stubEnv("VITE_PONTE_DOWNLOAD_URL", endereco);
  mockUseApp.mockReturnValue({
    ponteLocalAtiva: true, setPonteLocalAtiva, loading: false,
    recarregarDadosDoEstabelecimento,
  });
  const { default: Tela } = await import("./PonteLocalConfig");
  await act(async () => { render(<Tela />); });
};

const botaoBaixar = () => document.querySelector(".ponte-config__baixar");
const passo1 = () => document.querySelector(".ponte-config__passos li").textContent;

describe("PonteLocalConfig — baixar o programa da ponte", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("mostra o botão apontando para o endereço configurado", async () => {
    await abrirComEndereco(ENDERECO);

    const botao = botaoBaixar();
    expect(botao).not.toBeNull();
    expect(botao.getAttribute("href")).toBe(ENDERECO);
    expect(botao.textContent).toContain("Baixar o programa da ponte");
  });

  it("com o botão, o passo 1 fala do arquivo baixado em vez de pedir cópia por fora", async () => {
    await abrirComEndereco(ENDERECO);

    expect(passo1()).toContain("acabou de baixar");
  });

  // O programa é publicado compactado (o plano gratuito do Storage recusa o
  // .exe cru). Um passo 1 que mandasse dar dois cliques direto no arquivo
  // baixado pararia o dono no .zip, sem nada acontecendo.
  it("com o botão, o passo 1 manda descompactar antes do duplo clique", async () => {
    await abrirComEndereco(ENDERECO);

    expect(passo1()).toContain("Descompacte");
    expect(passo1()).toContain("KoraPonte.exe");
  });

  it("sem endereço configurado, não existe botão e o passo a passo segue como era", async () => {
    await abrirComEndereco("");

    expect(botaoBaixar()).toBeNull();
    expect(passo1()).toContain("Copie o arquivo");
    // Quem recebeu o arquivo por fora já tem o .exe na mão: mandar
    // descompactar aqui seria pedir um zip que ele não tem.
    expect(passo1()).not.toContain("Descompacte");
  });

  it("endereço escrito errado no build vale o mesmo que endereço nenhum", async () => {
    await abrirComEndereco("peça-o-ao-suporte");

    expect(botaoBaixar()).toBeNull();
    expect(passo1()).toContain("Copie o arquivo");
  });
});
