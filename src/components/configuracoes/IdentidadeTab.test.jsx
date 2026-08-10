// @vitest-environment jsdom
//
// S1-3 — a aba "Identidade". O que estes testes protegem:
//
// 1. o recorte de quem vê (a escrita é RPC de admin; mostrar a aba a um
//    gerente só levaria a um 42501 na cara dele);
// 2. a prévia, que é o motivo de a tela ser intuitiva — ela precisa mudar
//    ENQUANTO se digita, senão o dono salva para descobrir o resultado;
// 3. o botão de salvar apagado sem mudança (prevenção de erro);
// 4. a distinção entre "subiu a imagem" e "salvou a identidade": se a RPC
//    falhar depois do upload, a tela NÃO pode dizer que salvou;
// 5. a ausência de qualquer `update` direto em `tenants` — a tabela não tem
//    policy de UPDATE (ADR-005/008 §7), então só a RPC funciona.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

const { mockSupabase, enviarLogoTenant } = vi.hoisted(() => ({
  mockSupabase: { current: null },
  enviarLogoTenant: vi.fn(),
}));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

// Só o upload é substituído: `comprimirLogo` depende de <canvas>, que o
// jsdom não implementa. O resto do módulo (RPC, "mudou?", trim) roda real.
vi.mock("@/lib/tenant/identidadeTenant", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, enviarLogoTenant };
});

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/jarvas/jarvas", () => ({ emitirEvento: vi.fn() }));

import { setAppMock } from "@/test/mockApp";
import IdentidadeTab from "./IdentidadeTab";
import ConfiguracoesView from "./ConfiguracoesView";

const admin = { id: 1, name: "Dona Ana", username: "ana", role: "admin", permissions: {} };
const gerente = { id: 2, name: "Gerente", username: "ger", role: "gerente", permissions: {} };

const tenant = {
  id: "t1",
  nome: "Restaurante Teste",
  slug: "teste",
  tema: { nome_exibicao: "Bar do Zé", logo_url: "https://cdn.exemplo/t1/logo.png", accent: "#123456" },
};

function montar(overrides = {}) {
  const app = setAppMock({ currentUser: admin, tenant, aplicarTenantSalvo: vi.fn(), ...overrides });
  return { app, ...render(<IdentidadeTab />) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
  enviarLogoTenant.mockResolvedValue({ url: "https://cdn.exemplo/t1/identidade/logo.png?v=9", error: null });
});

describe("IdentidadeTab — quem enxerga a aba", () => {
  it("admin vê a aba 'Identidade' nas Configurações", () => {
    setAppMock({ currentUser: admin, tenant });

    render(<ConfiguracoesView />);

    expect(screen.getByRole("button", { name: /identidade/i })).toBeInTheDocument();
  });

  it("gerente NÃO vê — a RPC é de admin, mostrar a aba só levaria a um erro", () => {
    setAppMock({ currentUser: gerente, tenant });

    render(<ConfiguracoesView />);

    expect(screen.queryByRole("button", { name: /identidade/i })).toBeNull();
  });
});

describe("IdentidadeTab — bootstrap e preenchimento", () => {
  it("com o tenant em voo mostra carregando — nunca 'sem identidade'", () => {
    montar({ tenant: null });

    expect(screen.getByText(/carregando a identidade/i)).toBeInTheDocument();
  });

  it("abre com o nome de exibição já salvo no campo", () => {
    montar();

    expect(screen.getByLabelText(/nome do estabelecimento/i)).toHaveValue("Bar do Zé");
  });

  it("sem nome de exibição, sugere o nome cadastrado no placeholder", () => {
    montar({ tenant: { ...tenant, tema: {} } });

    const campo = screen.getByLabelText(/nome do estabelecimento/i);
    expect(campo).toHaveValue("");
    expect(campo).toHaveAttribute("placeholder", "Restaurante Teste");
    expect(screen.getByText(/aparece o nome cadastrado: Restaurante Teste/i)).toBeInTheDocument();
  });
});

describe("IdentidadeTab — prévia (o resultado antes de salvar)", () => {
  it("mostra o logo salvo, com o nome como texto alternativo", () => {
    montar();

    const img = screen.getByRole("img", { name: "Bar do Zé" });
    expect(img).toHaveAttribute("src", "https://cdn.exemplo/t1/logo.png");
  });

  it("sem logo, mostra o nome escrito — não um quadrado quebrado", () => {
    montar({ tenant: { ...tenant, tema: { nome_exibicao: "Bar do Zé" } } });

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("BAR DO ZÉ")).toBeInTheDocument();
  });

  it("logo com esquema perigoso não vai para a prévia (allowlist)", () => {
    montar({ tenant: { ...tenant, tema: { nome_exibicao: "Bar do Zé", logo_url: "javascript:alert(1)" } } });

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("BAR DO ZÉ")).toBeInTheDocument();
  });

  it("a prévia acompanha o que está sendo digitado, sem salvar", () => {
    montar({ tenant: { ...tenant, tema: { nome_exibicao: "Bar do Zé" } } });

    fireEvent.change(screen.getByLabelText(/nome do estabelecimento/i), { target: { value: "Cantina Nova" } });

    expect(screen.getByText("CANTINA NOVA")).toBeInTheDocument();
    expect(mockSupabase.current.rpc).not.toHaveBeenCalled();
  });
});

describe("IdentidadeTab — botão de salvar", () => {
  it("nasce desabilitado: não há o que salvar", () => {
    montar();

    expect(screen.getByRole("button", { name: /salvar identidade/i })).toBeDisabled();
    expect(screen.getByText(/nada mudou ainda/i)).toBeInTheDocument();
  });

  it("acende quando o nome muda", () => {
    montar();

    fireEvent.change(screen.getByLabelText(/nome do estabelecimento/i), { target: { value: "Cantina Nova" } });

    expect(screen.getByRole("button", { name: /salvar identidade/i })).toBeEnabled();
  });

  it("só espaço a mais não conta como mudança", () => {
    montar();

    fireEvent.change(screen.getByLabelText(/nome do estabelecimento/i), { target: { value: "  Bar do Zé  " } });

    expect(screen.getByRole("button", { name: /salvar identidade/i })).toBeDisabled();
  });
});

describe("IdentidadeTab — gravação", () => {
  it("salva pela RPC, com o nome aparado e sem id de tenant", async () => {
    montar();

    fireEvent.change(screen.getByLabelText(/nome do estabelecimento/i), { target: { value: "  Cantina Nova  " } });
    fireEvent.click(screen.getByRole("button", { name: /salvar identidade/i }));

    await waitFor(() => expect(mockSupabase.current.rpc).toHaveBeenCalled());
    const [nome, args] = mockSupabase.current.rpc.mock.calls[0];
    expect(nome).toBe("atualizar_identidade_tenant");
    expect(args).toEqual({
      p_nome_exibicao: "Cantina Nova",
      p_logo_url: "https://cdn.exemplo/t1/logo.png",
    });
  });

  it("nunca faz update direto em `tenants` — a tabela não tem policy de UPDATE", async () => {
    montar();

    fireEvent.change(screen.getByLabelText(/nome do estabelecimento/i), { target: { value: "Cantina Nova" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar identidade/i }));

    await waitFor(() => expect(mockSupabase.current.rpc).toHaveBeenCalled());
    expect(mockSupabase.current.from).not.toHaveBeenCalledWith("tenants");
  });

  it("no sucesso avisa que salvou e repinta o tenant do contexto", async () => {
    const linha = { id: "t1", tema: { nome_exibicao: "Cantina Nova", accent: "#123456" } };
    mockSupabase.current.setRpcResult("atualizar_identidade_tenant", { data: linha, error: null });
    const { app } = montar();

    fireEvent.change(screen.getByLabelText(/nome do estabelecimento/i), { target: { value: "Cantina Nova" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar identidade/i }));

    expect(await screen.findByText(/identidade salva/i)).toBeInTheDocument();
    expect(app.aplicarTenantSalvo).toHaveBeenCalledWith(linha);
  });

  it("erro da RPC aparece na tela e NÃO vira sucesso", async () => {
    mockSupabase.current.setRpcError("atualizar_identidade_tenant", {
      message: "Apenas o administrador do estabelecimento pode alterar a identidade.",
    });
    montar();

    fireEvent.change(screen.getByLabelText(/nome do estabelecimento/i), { target: { value: "Cantina Nova" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar identidade/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/apenas o administrador/i);
    expect(screen.queryByText(/identidade salva/i)).toBeNull();
  });
});

describe("IdentidadeTab — logo", () => {
  it("o arquivo escolhido sobe e entra na prévia, mas ainda não está salvo", async () => {
    montar();

    const arquivo = new File(["x"], "logo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("ident-arquivo"), { target: { files: [arquivo] } });

    await waitFor(() => expect(enviarLogoTenant).toHaveBeenCalled());
    expect(enviarLogoTenant.mock.calls[0][0].tenantId).toBe("t1");
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Bar do Zé" }))
        .toHaveAttribute("src", "https://cdn.exemplo/t1/identidade/logo.png?v=9");
    });
    // Subir não é salvar: a identidade só muda quando ele clicar em salvar.
    expect(mockSupabase.current.rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /salvar identidade/i })).toBeEnabled();
  });

  it("falha no upload mostra o motivo e não mexe na prévia", async () => {
    enviarLogoTenant.mockResolvedValue({ url: null, error: new Error("Imagem muito grande (máximo 8 MB).") });
    montar();

    const arquivo = new File(["x"], "gigante.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("ident-arquivo"), { target: { files: [arquivo] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/muito grande/i);
    expect(screen.getByRole("img", { name: "Bar do Zé" }))
      .toHaveAttribute("src", "https://cdn.exemplo/t1/logo.png");
  });

  it("remover o logo pede confirmação antes (ação destrutiva confirma)", async () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: /remover/i }));

    expect(screen.getByRole("alertdialog", { name: /remover o logo/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bar do Zé" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /remover logo/i }));

    // Some da prévia e volta o nome escrito; a gravação ainda depende do salvar.
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("BAR DO ZÉ")).toBeInTheDocument();
    expect(mockSupabase.current.rpc).not.toHaveBeenCalled();
  });

  it("mandando remover, a RPC recebe string vazia (que apaga a chave)", async () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: /remover/i }));
    fireEvent.click(screen.getByRole("button", { name: /remover logo/i }));
    fireEvent.click(screen.getByRole("button", { name: /salvar identidade/i }));

    await waitFor(() => expect(mockSupabase.current.rpc).toHaveBeenCalled());
    expect(mockSupabase.current.rpc.mock.calls[0][1].p_logo_url).toBe("");
  });

  it("desistir da remoção mantém o logo", () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: /remover/i }));
    fireEvent.click(screen.getByRole("button", { name: /manter/i }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("img", { name: "Bar do Zé" })).toBeInTheDocument();
  });

  it("sem logo, o botão convida a enviar; com logo, a trocar", () => {
    const { unmount } = montar({ tenant: { ...tenant, tema: { nome_exibicao: "Bar do Zé" } } });
    expect(screen.getByRole("button", { name: /enviar logo/i })).toBeInTheDocument();
    unmount();

    montar();
    expect(screen.getByRole("button", { name: /trocar logo/i })).toBeInTheDocument();
  });
});
