// @vitest-environment jsdom
//
// A Ponte nunca recebeu um pedido em produção porque quem a ligava era uma
// variável de BUILD (VITE_PONTE_LOCAL_ATIVA) que não existia em .env nenhum:
// em toda build ela era undefined, o ciclo de 5s nunca começava e nenhum
// pedido do celular do garçom chegava ao caixa. Agora quem liga é o
// estabelecimento, por config (decisão 017). Estes testes seguram os dois
// lados disso: a chave do tenant manda, e a variável ausente NÃO desliga.
//
// Aqui só moram casos de TELA. A regra pura de "o que conta como impressão
// que não saiu" é do hook e é testada em src/hooks/usePonteLocal.test.js —
// ela morava neste arquivo, via importActual, e por isso rodar os testes de
// src/hooks não executava uma linha do hook.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockUseApp, mockUsePonteLocal } = vi.hoisted(() => ({
  mockUseApp: vi.fn(),
  mockUsePonteLocal: vi.fn(() => ({ disponivel: false, info: null })),
}));
vi.mock("@/context/AppContext", () => ({ useApp: mockUseApp }));
vi.mock("@/hooks/usePonteLocal", () => ({ usePonteLocal: mockUsePonteLocal }));

import PonteLocalBridge from "./PonteLocalBridge";

/** PC do caixa, gerente logado, estabelecimento com a chave ligada. */
const contexto = (sobrescrever = {}) => ({
  isMobile: false,
  currentUser: { id: 1, username: "gerente" },
  products: [],
  pending: [],
  addPending: vi.fn(),
  updatePending: vi.fn(),
  ponteEndereco: null,
  setPonteEndereco: vi.fn(),
  redeOnline: true,
  tenant: { id: "tenant-1", nome: "Restaurante do Zé" },
  ponteLocalAtiva: true,
  ...sobrescrever,
});

/** O ciclo que busca os pedidos do Palm está rodando? */
const cicloLigado = () => mockUsePonteLocal.mock.calls.at(-1)[0].ativo;

const montar = (sobrescrever) => {
  mockUseApp.mockReturnValue(contexto(sobrescrever));
  render(<PonteLocalBridge />);
};

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("PonteLocalBridge — quem liga é o estabelecimento", () => {
  it("liga quando o estabelecimento ligou a chave, mesmo sem variável de build definida", () => {
    // Nenhum .env define VITE_PONTE_LOCAL_ATIVA na suíte — é exatamente o
    // cenário de toda build real, e antes era o que mantinha tudo desligado.
    expect(import.meta.env.VITE_PONTE_LOCAL_ATIVA).toBeUndefined();
    montar({ ponteLocalAtiva: true });
    expect(cicloLigado()).toBe(true);
  });

  it("não liga quando o estabelecimento deixou a chave desligada", () => {
    montar({ ponteLocalAtiva: false });
    expect(cicloLigado()).toBe(false);
  });

  it("não liga enquanto a config do estabelecimento ainda não chegou", () => {
    // `null` é "ainda não sei". Ligar aqui e desligar em seguida faria o
    // recurso piscar e bateria na porta da Ponte de quem nem tem Ponte.
    montar({ ponteLocalAtiva: null });
    expect(cicloLigado()).toBe(false);
  });

  it("não liga no celular do garçom nem sem usuário logado, mesmo com a chave ligada", () => {
    montar({ ponteLocalAtiva: true, isMobile: true });
    expect(cicloLigado()).toBe(false);

    montar({ ponteLocalAtiva: true, currentUser: null });
    expect(cicloLigado()).toBe(false);
  });

  it("a variável de build só serve de trava global: com 'false' explícito, nem a chave do tenant liga", async () => {
    vi.stubEnv("VITE_PONTE_LOCAL_ATIVA", "false");
    vi.resetModules();
    const { default: BridgeComTrava } = await import("./PonteLocalBridge");

    mockUseApp.mockReturnValue(contexto({ ponteLocalAtiva: true }));
    render(<BridgeComTrava />);

    expect(cicloLigado()).toBe(false);
  });
});

// A comanda que não sai no papel é o defeito que o serviço sente na hora: a
// cozinha não recebe e o caixa não fica sabendo. O ciclo já descobria — o que
// faltava era isso chegar à tela.
describe("PonteLocalBridge — o que não saiu no papel chega à tela", () => {
  it("mostra na tela o que o ciclo encontrou parado na impressora", () => {
    mockUsePonteLocal.mockReturnValue({
      disponivel: true,
      info: null,
      impressaoParada: { impressoes: 2, esperaMs: 4 * 60 * 1000, chavesEncerradas: [] },
      conferirImpressao: vi.fn(),
    });
    montar({ ponteLocalAtiva: true });
    expect(screen.getByText("2 impressões não saíram na impressora")).toBeInTheDocument();
  });

  it("não ocupa a tela quando está tudo saindo", () => {
    mockUsePonteLocal.mockReturnValue({
      disponivel: true, info: null, impressaoParada: null, conferirImpressao: vi.fn(),
    });
    montar({ ponteLocalAtiva: true });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("a Ponte parar de responder aparece na tela em vez de virar tela verde", () => {
    // Sem isto, a Ponte fechada no meio do serviço deixava o caixa achando
    // que estava tudo bem — enquanto nada mais era impresso no PC.
    mockUsePonteLocal.mockReturnValue({
      disponivel: false,
      info: null,
      impressaoParada: null,
      ponteSemResposta: true,
      conferirImpressao: vi.fn(),
    });
    montar({ ponteLocalAtiva: true });
    expect(
      screen.getByText("Não estou conseguindo falar com a impressora deste computador")
    ).toBeInTheDocument();
  });

  it("passa adiante o estado de quem está conferindo agora", () => {
    mockUsePonteLocal.mockReturnValue({
      disponivel: true,
      info: null,
      impressaoParada: { impressoes: 1, esperaMs: 0, chavesEncerradas: [] },
      conferindo: true,
      falhaAoConferir: true,
      conferirImpressao: vi.fn(),
    });
    montar({ ponteLocalAtiva: true });
    expect(screen.getByRole("button", { name: "Conferindo…" })).toBeDisabled();
    expect(screen.getByText("Não consegui conferir agora. Tente daqui a pouco.")).toBeInTheDocument();
  });

  it("com a chave do estabelecimento desligada não aparece aviso nenhum", () => {
    // Espelha o hook: sem `ativo` ele zera o que estava na tela.
    mockUsePonteLocal.mockImplementation(({ ativo }) => ({
      disponivel: false,
      info: null,
      impressaoParada: ativo ? { impressoes: 1, esperaMs: 0, chavesEncerradas: [] } : null,
      ponteSemResposta: false,
      conferirImpressao: vi.fn(),
    }));
    montar({ ponteLocalAtiva: false });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
