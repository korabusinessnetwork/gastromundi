// @vitest-environment jsdom
//
// Testes do hook que liga o caixa à Ponte KORA. Eles moram AQUI, e não em
// PonteLocalBridge.test.jsx, porque é aqui que o código mora: os casos de
// `resumirImpressaoParada` viviam no teste da tela, via `importActual`, e
// "npx vitest run src/hooks" não executava uma linha deste arquivo — quem
// mexesse no hook via a suíte verde e achava que estava coberto.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const {
  pingPonte, buscarInfoPonte, enviarSnapshotPonte, buscarFilaImpressaoPonte,
  buscarPedidosPonte, confirmarPedidosPonte, vincularPonte,
} = vi.hoisted(() => ({
  pingPonte: vi.fn(),
  buscarInfoPonte: vi.fn(),
  enviarSnapshotPonte: vi.fn(),
  buscarFilaImpressaoPonte: vi.fn(),
  buscarPedidosPonte: vi.fn(),
  confirmarPedidosPonte: vi.fn(),
  vincularPonte: vi.fn(),
}));

vi.mock("@/lib/ponte", () => ({
  pingPonte, buscarInfoPonte, enviarSnapshotPonte, buscarFilaImpressaoPonte,
  buscarPedidosPonte, confirmarPedidosPonte, vincularPonte,
  montarEnderecoPalm: () => null,
}));
// A impressão de verdade não entra neste teste (e evita arrastar o Supabase).
vi.mock("@/lib/impressao/despacho", () => ({
  imprimirLancamento: vi.fn(async () => ({ error: null, impresso: false })),
}));

import {
  usePonteLocal, resumirImpressaoParada, ESPERA_PARA_AVISAR_MS, JANELA_AVISO_MS,
} from "./usePonteLocal";

describe("resumirImpressaoParada — o que conta como impressão que não saiu", () => {
  const AGORA = Date.parse("2026-08-19T20:00:00.000Z");
  const atras = (ms) => new Date(AGORA - ms).toISOString();

  it("fila vazia (ou Ponte sem resposta) não vira aviso", () => {
    expect(resumirImpressaoParada(null, { agora: AGORA })).toBeNull();
    expect(resumirImpressaoParada({ trabalhos: [] }, { agora: AGORA })).toBeNull();
  });

  it("impressão que acabou de entrar na fila não é alarme falso", () => {
    const dados = { trabalhos: [{ id: "t1", estado: "na_fila", criadoEm: atras(ESPERA_PARA_AVISAR_MS - 1000) }] };
    expect(resumirImpressaoParada(dados, { agora: AGORA })).toBeNull();
  });

  it("impressão esperando a impressora conta, com o tempo de espera junto", () => {
    const dados = { trabalhos: [{ id: "t1", estado: "imprimindo", criadoEm: atras(3 * 60 * 1000), tentativas: 3 }] };
    const resumo = resumirImpressaoParada(dados, { agora: AGORA });
    expect(resumo.impressoes).toBe(1);
    expect(resumo.esperaMs).toBe(3 * 60 * 1000);
    // Ainda pode sair sozinha: conferir não pode calar o que não terminou.
    expect(resumo.chavesEncerradas).toEqual([]);
  });

  it("o que a Ponte já desistiu conta e some quando alguém vai conferir; o que imprimiu não conta", () => {
    const dados = { trabalhos: [
      { id: "t1", estado: "falhou", criadoEm: atras(10 * 60 * 1000), concluidoEm: atras(9 * 60 * 1000) },
      { id: "t2", estado: "concluido", criadoEm: atras(10 * 60 * 1000), concluidoEm: atras(10 * 60 * 1000) },
    ] };
    const resumo = resumirImpressaoParada(dados, { agora: AGORA });
    expect(resumo.impressoes).toBe(1);
    expect(resumo.chavesEncerradas).toEqual(["t1"]);
    expect(resumirImpressaoParada(dados, { agora: AGORA, dispensadas: new Set(["t1"]) })).toBeNull();
  });

  it("impressão que nem chegou à fila da Ponte entra na mesma conta", () => {
    const dados = { trabalhos: [{ id: "t1", estado: "falhou", criadoEm: atras(5 * 60 * 1000) }] };
    const resumo = resumirImpressaoParada(dados, {
      agora: AGORA,
      falhasLocais: [{ chave: "comanda-9:lancamento", criadoEm: atras(15 * 60 * 1000) }],
    });
    expect(resumo.impressoes).toBe(2);
    expect(resumo.esperaMs).toBe(15 * 60 * 1000); // a mais antiga das duas
    expect(resumo.chavesEncerradas).toEqual(["t1", "comanda-9:lancamento"]);
  });

  it("papel que faltou ontem à noite não abre o caixa de hoje com aviso", () => {
    const ontem = atras(JANELA_AVISO_MS + 60 * 1000);
    const dados = { trabalhos: [{ id: "t1", estado: "falhou", criadoEm: ontem, concluidoEm: ontem }] };
    expect(resumirImpressaoParada(dados, { agora: AGORA })).toBeNull();
  });

  it("trabalho parado na fila desde ontem também não abre o caixa de hoje", () => {
    // Com a Ponte fora do ar, a última fila conhecida congela na memória do
    // hook e ninguém mais atualiza aquele "na_fila". Sem teto de idade, o
    // caixa abria de manhã com "havia 2 impressões esperando" da noite
    // anterior — o alarme que ninguém lê, que é o que JANELA_AVISO_MS existe
    // para impedir.
    const ontem = atras(JANELA_AVISO_MS + 60 * 1000);
    const dados = { trabalhos: [
      { id: "t1", estado: "na_fila", criadoEm: ontem },
      { id: "t2", estado: "imprimindo", criadoEm: ontem },
    ] };
    expect(resumirImpressaoParada(dados, { agora: AGORA })).toBeNull();
  });

  it("trabalho na fila dentro da janela continua contando", () => {
    // O teto não pode calar o serviço de agora: papel travado há dez minutos
    // é exatamente o que a cozinha precisa ouvir.
    const dados = { trabalhos: [{ id: "t1", estado: "na_fila", criadoEm: atras(10 * 60 * 1000) }] };
    expect(resumirImpressaoParada(dados, { agora: AGORA }).impressoes).toBe(1);
  });

  it("conta IMPRESSÕES, não comandas: uma comanda fatiada em três pontos são três papéis", () => {
    // Cozinha, Bar e Chapa configurados: UM lançamento vira três trabalhos na
    // fila da Ponte. Chamar isso de "3 comandas" na tela do caixa era número
    // errado — o resumo devolve o que ele realmente sabe contar.
    const criadoEm = atras(5 * 60 * 1000);
    const dados = { trabalhos: [
      { id: "cozinha-1", estado: "falhou", criadoEm },
      { id: "bar-1", estado: "falhou", criadoEm },
      { id: "chapa-1", estado: "falhou", criadoEm },
    ] };
    expect(resumirImpressaoParada(dados, { agora: AGORA }).impressoes).toBe(3);
  });
});

// O botão "Conferir de novo" não conferia nada: jogava as chaves encerradas
// no dispensadas e recalculava em cima da memória. O alarme sumia, a cozinha
// continuava sem papel, e o operador aprendia que apertar aquilo resolve.
describe("usePonteLocal — o botão de conferir vai mesmo ler a fila", () => {
  const props = (sobrescrever = {}) => ({
    ativo: true,
    products: [],
    pending: [],
    addPending: vi.fn(),
    updatePending: vi.fn(),
    ponteEndereco: null,
    setPonteEndereco: vi.fn(),
    redeOnline: true,
    estabelecimento: null,
    ...sobrescrever,
  });

  const atras = (ms) => new Date(Date.now() - ms).toISOString();
  const filaComFalha = () => ({ trabalhos: [{ id: "t1", estado: "falhou", criadoEm: atras(5 * 60 * 1000) }] });

  beforeEach(() => {
    vi.clearAllMocks();
    pingPonte.mockResolvedValue({ data: { ok: true }, error: null });
    buscarInfoPonte.mockResolvedValue({ data: null, error: null });
    buscarPedidosPonte.mockResolvedValue({ data: { pedidos: [] }, error: null });
    buscarFilaImpressaoPonte.mockResolvedValue({ data: filaComFalha(), error: null });
  });

  afterEach(() => { vi.useRealTimers(); });

  /** Monta o hook e espera o primeiro ciclo achar a impressão parada. */
  const montarComAvisoNaTela = async () => {
    const utils = renderHook(() => usePonteLocal(props()));
    await waitFor(() => expect(utils.result.current.impressaoParada?.impressoes).toBe(1));
    return utils;
  };

  it("relê a fila da Ponte antes de apagar o aviso", async () => {
    const { result } = await montarComAvisoNaTela();

    // A comanda saiu no papel enquanto o operador foi até a impressora.
    buscarFilaImpressaoPonte.mockClear();
    buscarFilaImpressaoPonte.mockResolvedValue({ data: { trabalhos: [] }, error: null });

    await act(async () => { await result.current.conferirImpressao(); });

    expect(buscarFilaImpressaoPonte).toHaveBeenCalled();
    expect(result.current.impressaoParada).toBeNull();
    expect(result.current.falhaAoConferir).toBe(false);
  });

  it("não apaga o aviso quando não conseguiu conferir — e diz que não conseguiu", async () => {
    const { result } = await montarComAvisoNaTela();

    buscarFilaImpressaoPonte.mockResolvedValue({ data: null, error: new Error("Ponte fora") });

    await act(async () => { await result.current.conferirImpressao(); });

    // Apagar aqui seria mentira: ninguém conferiu coisa nenhuma.
    expect(result.current.impressaoParada?.impressoes).toBe(1);
    expect(result.current.falhaAoConferir).toBe(true);
  });

  it("dez cliques seguidos não viram dez leituras", async () => {
    const { result } = await montarComAvisoNaTela();

    let liberar;
    buscarFilaImpressaoPonte.mockClear();
    buscarFilaImpressaoPonte.mockReturnValue(new Promise((resolve) => { liberar = resolve; }));

    await act(async () => {
      result.current.conferirImpressao();
      result.current.conferirImpressao();
      result.current.conferirImpressao();
      await Promise.resolve();
    });

    expect(buscarFilaImpressaoPonte).toHaveBeenCalledTimes(1);
    expect(result.current.conferindo).toBe(true); // o botão avisa que está lendo

    await act(async () => { liberar({ data: { trabalhos: [] }, error: null }); });
    await waitFor(() => expect(result.current.conferindo).toBe(false));
  });

  it("a Ponte parar de responder no meio do serviço não limpa a tela do caixa", async () => {
    // O ramo de erro do ping zerava a fila conhecida: a Ponte caía, tudo que
    // estava parado sumia do aviso e o caixa ficava verde justamente quando
    // nada mais é impresso.
    const fila = filaComFalha();
    vi.useFakeTimers();
    buscarFilaImpressaoPonte.mockResolvedValue({ data: fila, error: null });

    const { result } = renderHook(() => usePonteLocal(props()));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.impressaoParada?.impressoes).toBe(1);

    pingPonte.mockResolvedValue({ data: null, error: new Error("connection refused") });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(result.current.disponivel).toBe(false);
    expect(result.current.ponteSemResposta).toBe(true);
    expect(result.current.impressaoParada?.impressoes).toBe(1);
  });

  it("Ponte que nunca respondeu neste PC não vira alarme permanente", async () => {
    // Alarme que aparece sempre é alarme que ninguém lê. Só acusa "parou de
    // responder" quem já respondeu alguma vez.
    vi.useFakeTimers();
    pingPonte.mockResolvedValue({ data: null, error: new Error("connection refused") });

    const { result } = renderHook(() => usePonteLocal(props()));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });

    expect(result.current.ponteSemResposta).toBe(false);
    expect(result.current.impressaoParada).toBeNull();
  });
});
