// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// O hub é a única peça com regra própria (quem vê o quê, o que abre nativo e o
// que ainda é do computador). As seções são carregadas sob demanda e cada uma
// só espelha uma aba do desktop — aqui elas viram stubs para o teste medir o
// roteamento do hub, não o conteúdo delas.
vi.mock("./SecaoGeral", () => ({ default: () => <div>corpo-geral</div> }));
vi.mock("./SecaoPagamentos", () => ({ default: () => <div>corpo-pagamentos</div> }));
vi.mock("./SecaoUnidades", () => ({ default: () => <div>corpo-unidades</div> }));
vi.mock("./SecaoMesas", () => ({ default: () => <div>corpo-mesas</div> }));
vi.mock("./SecaoDelivery", () => ({ default: () => <div>corpo-delivery</div> }));
vi.mock("./SecaoRadar", () => ({ default: () => <div>corpo-radar</div> }));

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));

let contexto = {};
vi.mock("@/context/AppContext", () => ({ useApp: () => contexto }));

import ConfiguracoesModulo from "./ConfiguracoesModulo";

function montar(role, props = {}) {
  contexto = { currentUser: { role }, tenant: { nome: "Restaurante Teste" } };
  return render(<ConfiguracoesModulo onVoltar={vi.fn()} {...props} />);
}

describe("ConfiguracoesModulo — Configurações nativa do Palm", () => {
  beforeEach(() => {
    navigate.mockClear();
  });

  it("lista para o admin todas as seções, nativas e as de computador", () => {
    montar("admin");
    expect(screen.getByText("Geral")).toBeInTheDocument();
    expect(screen.getByText("Meios de pagamento")).toBeInTheDocument();
    expect(screen.getByText("Mesas")).toBeInTheDocument();
    expect(screen.getByText("Impressão")).toBeInTheDocument();
    expect(screen.getByText(/melhor no computador/i)).toBeInTheDocument();
  });

  it("esconde do garçom o que é de gerente e de admin", () => {
    montar("garcom");
    expect(screen.getByText("Geral")).toBeInTheDocument();
    expect(screen.queryByText("Mesas")).toBeNull();
    expect(screen.queryByText("Delivery")).toBeNull();
    expect(screen.queryByText("Radar de oportunidades")).toBeNull();
    expect(screen.queryByText("Impressão")).toBeNull();
    expect(screen.queryByText("Importar e exportar")).toBeNull();
  });

  it("dá ao gerente as seções de gerente, mas não as de admin", () => {
    montar("gerente");
    expect(screen.getByText("Mesas")).toBeInTheDocument();
    expect(screen.getByText("Radar de oportunidades")).toBeInTheDocument();
    expect(screen.queryByText("Impressão")).toBeNull();
  });

  it("abre a seção nativa dentro do Palm e volta para a lista", async () => {
    montar("admin");

    await userEvent.click(screen.getByRole("button", { name: /Geral/i }));
    expect(await screen.findByText("corpo-geral")).toBeInTheDocument();
    // O cabeçalho passa a ser o da seção — o usuário sabe onde está.
    expect(screen.getByRole("heading", { name: "Geral" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /voltar para configurações/i }));
    expect(screen.getByRole("heading", { name: "Configurações" })).toBeInTheDocument();
    expect(screen.queryByText("corpo-geral")).toBeNull();
  });

  it("volta para o hub de Módulos quando já está na lista", async () => {
    const onVoltar = vi.fn();
    montar("admin", { onVoltar });

    await userEvent.click(screen.getByRole("button", { name: /voltar para módulos/i }));
    expect(onVoltar).toHaveBeenCalledTimes(1);
  });

  it("manda para a tela de computador o que ainda não tem versão de celular", async () => {
    montar("admin");

    await userEvent.click(screen.getByRole("button", { name: /Usuários/i }));
    expect(navigate).toHaveBeenCalledWith("/app/configuracoes");
  });
});
