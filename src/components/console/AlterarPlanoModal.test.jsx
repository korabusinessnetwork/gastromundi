// @vitest-environment jsdom
//
// R7L3 — o modal de trocar plano era um tiro no escuro.
//
// A troca vale na hora e o efeito é invisível de dentro do Console: o
// estabelecimento perde o módulo imediatamente e, desde a migration
// 20260906, um plano sem `delivery` DERRUBA o site público de pedidos dele
// (os clientes param de conseguir pedir). A tela dizia apenas, em texto
// genérico, que a troca "muda os módulos que este estabelecimento enxerga",
// nunca nomeava a perda e não pedia confirmação nenhuma — um clique errado
// no select tirava o cliente do ar sem nenhum aviso.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `compararModulosDoPlano` fica REAL (é a regra sob teste); só a escrita e a
// leitura dos módulos são dubladas.
const { mockAlterarPlano, mockBuscarModulos } = vi.hoisted(() => ({
  mockAlterarPlano: vi.fn(),
  mockBuscarModulos: vi.fn(),
}));
vi.mock("@/lib/console", async () => {
  const real = await vi.importActual("@/lib/console");
  return { ...real, alterarPlano: mockAlterarPlano };
});
vi.mock("@/lib/tenant", async () => {
  const real = await vi.importActual("@/lib/tenant");
  return { ...real, buscarModulosDoPlano: mockBuscarModulos };
});

import AlterarPlanoModal from "./AlterarPlanoModal";

const MODULOS_DO_PLANO = {
  basico: ["cardapio", "pdv", "caixa", "pedidos"],
  alto: ["cardapio", "pdv", "caixa", "pedidos", "estoque", "relatorios"],
  avancado: ["cardapio", "pdv", "caixa", "pedidos", "estoque", "relatorios", "financeiro", "delivery"],
};
const PLANOS = [
  { codigo: "basico", nome: "Básico" },
  { codigo: "alto", nome: "Alto" },
  { codigo: "avancado", nome: "Avançado" },
];
const TENANT = { id: "t2", nome: "Café Central", plano_codigo: "avancado" };

const salvar = () => screen.getByRole("button", { name: /Salvar plano/i });
const seletor = () => screen.getByRole("combobox");

function montar(props = {}) {
  const onAlterado = vi.fn();
  const onFechar = vi.fn();
  render(
    <AlterarPlanoModal
      tenant={TENANT}
      planos={PLANOS}
      onFechar={onFechar}
      onAlterado={onAlterado}
      {...props}
    />
  );
  return { onAlterado, onFechar };
}

describe("AlterarPlanoModal — a troca de plano diz o que o cliente perde", () => {
  beforeEach(() => {
    mockAlterarPlano.mockReset();
    mockBuscarModulos.mockReset();
    mockAlterarPlano.mockResolvedValue({ data: { plano_codigo: "basico" }, error: null });
    mockBuscarModulos.mockImplementation(async (codigo) => ({
      data: MODULOS_DO_PLANO[codigo] ?? [],
      error: null,
    }));
  });

  it("abre sem comparação nenhuma e com o salvar travado (nada mudou ainda)", () => {
    montar();
    expect(salvar()).toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/perde na hora/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/muda só a cobrança/i)).not.toBeInTheDocument();
    expect(mockBuscarModulos).not.toHaveBeenCalled();
  });

  it("nomeia os módulos perdidos no downgrade e avisa que o site de pedidos sai do ar", async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(seletor(), "basico");

    const perda = await screen.findByRole("alert");
    expect(perda).toHaveTextContent(/perde na hora/i);
    expect(perda).toHaveTextContent("Estoque");
    expect(perda).toHaveTextContent("Financeiro");
    expect(perda).toHaveTextContent("Relatórios");
    expect(perda).toHaveTextContent("Delivery (site de pedidos)");
    expect(perda).toHaveTextContent(/site de pedidos deste estabelecimento sai do ar/i);
    // Nada de código cru na tela.
    expect(screen.queryByText(/fiscal_integracoes|plano_codigo/)).not.toBeInTheDocument();
  });

  it("exige confirmação explícita para salvar um downgrade", async () => {
    const user = userEvent.setup();
    const { onAlterado } = montar();
    await user.selectOptions(seletor(), "basico");
    await screen.findByRole("alert");

    expect(salvar()).toBeDisabled();
    await user.click(salvar());
    expect(mockAlterarPlano).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox"));
    expect(salvar()).toBeEnabled();
    await user.click(salvar());
    await waitFor(() => expect(mockAlterarPlano).toHaveBeenCalledWith("t2", "basico"));
    expect(onAlterado).toHaveBeenCalledWith({ plano_codigo: "basico" });
  });

  it("upgrade só com ganho não pede confirmação — salva direto", async () => {
    const user = userEvent.setup();
    montar({ tenant: { ...TENANT, plano_codigo: "basico" } });
    await user.selectOptions(seletor(), "avancado");

    const ganho = await screen.findByText(/Passa a ter/i);
    expect(ganho.closest("div")).toHaveTextContent("Delivery (site de pedidos)");
    expect(screen.queryByText(/perde na hora/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(salvar()).toBeEnabled();
  });

  it("na troca que perde uma coisa e ganha outra, mostra as duas listas", async () => {
    mockBuscarModulos.mockImplementation(async (codigo) => ({
      data: codigo === "avancado" ? ["pdv", "delivery"] : ["pdv", "jarvas"],
      error: null,
    }));
    const user = userEvent.setup();
    montar();
    await user.selectOptions(seletor(), "alto");

    const perda = await screen.findByRole("alert");
    expect(perda).toHaveTextContent("Delivery (site de pedidos)");
    expect(screen.getByText(/Passa a ter/i).closest("div")).toHaveTextContent(
      "Jarvas (inteligência artificial)"
    );
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("planos com os mesmos módulos: diz que muda só a cobrança e libera o salvar", async () => {
    mockBuscarModulos.mockImplementation(async () => ({ data: ["pdv", "caixa"], error: null }));
    const user = userEvent.setup();
    montar();
    await user.selectOptions(seletor(), "basico");

    expect(await screen.findByText(/muda só a cobrança/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(salvar()).toBeEnabled();
  });

  it("enquanto compara, o salvar fica travado e a tela diz que está comparando", async () => {
    // São DUAS leituras (plano atual e plano novo) e a tela só sai do
    // "comparando" quando as duas voltam — por isso guardamos todos os
    // resolvedores, não só o último.
    const presos = [];
    mockBuscarModulos.mockImplementation(
      () => new Promise((resolve) => { presos.push(() => resolve({ data: [], error: null })); })
    );
    const user = userEvent.setup();
    montar();
    await user.selectOptions(seletor(), "basico");

    expect(await screen.findByText(/Comparando os planos/i)).toBeInTheDocument();
    expect(salvar()).toBeDisabled();
    expect(presos).toHaveLength(2);

    presos.forEach((liberar) => liberar());
    await waitFor(() => expect(screen.queryByText(/Comparando os planos/i)).not.toBeInTheDocument());
  });

  it("leitura lenta que volta depois de outra escolha não pode reescrever a comparação", async () => {
    // Trocar duas vezes rápido: a leitura do primeiro plano volta atrasada.
    // Mostrar o diff do plano anterior seria pior que não mostrar nada — a
    // pessoa leria uma perda que não é a que ela está a ponto de salvar.
    const presos = [];
    let segurar = true;
    mockBuscarModulos.mockImplementation((codigo) => {
      const resultado = { data: MODULOS_DO_PLANO[codigo] ?? [], error: null };
      if (segurar) return new Promise((resolve) => presos.push(() => resolve(resultado)));
      return Promise.resolve(resultado);
    });
    const user = userEvent.setup();
    montar();

    await user.selectOptions(seletor(), "basico");
    expect(presos).toHaveLength(2);
    segurar = false;
    await user.selectOptions(seletor(), "alto");

    const perda = await screen.findByRole("alert");
    expect(perda).toHaveTextContent("Financeiro");
    expect(perda).not.toHaveTextContent("Estoque");

    await act(async () => {
      presos.forEach((liberar) => liberar());
    });
    // Continua sendo o diff do "alto" — a leitura velha foi descartada.
    expect(screen.getByRole("alert")).not.toHaveTextContent("Estoque");
    expect(screen.getByRole("alert")).toHaveTextContent("Financeiro");
  });

  it("quando não consegue comparar, diz que não sabe e não deixa trocar às cegas", async () => {
    // Basta UMA das duas leituras falhar: sem os módulos do plano escolhido
    // não há comparação possível, mesmo sabendo os do plano atual.
    mockBuscarModulos.mockImplementation(async (codigo) =>
      codigo === "basico"
        ? { data: [], error: { message: "network" } }
        : { data: MODULOS_DO_PLANO[codigo] ?? [], error: null }
    );
    const user = userEvent.setup();
    montar();
    await user.selectOptions(seletor(), "basico");

    expect(await screen.findByText(/não foi possível comparar os planos/i)).toBeInTheDocument();
    expect(screen.getByText(/não sabemos o que este estabelecimento perde/i)).toBeInTheDocument();
    expect(salvar()).toBeDisabled();

    // Dá para prosseguir, mas só assumindo o risco por escrito.
    await user.click(screen.getByRole("checkbox"));
    expect(salvar()).toBeEnabled();
  });

  it("o 'Tentar de novo' relê a comparação e mostra a perda de verdade", async () => {
    mockBuscarModulos.mockResolvedValueOnce({ data: [], error: { message: "network" } });
    mockBuscarModulos.mockResolvedValueOnce({ data: [], error: { message: "network" } });
    const user = userEvent.setup();
    montar();
    await user.selectOptions(seletor(), "basico");
    await screen.findByText(/não foi possível comparar os planos/i);

    mockBuscarModulos.mockImplementation(async (codigo) => ({
      data: MODULOS_DO_PLANO[codigo] ?? [],
      error: null,
    }));
    await user.click(screen.getByRole("button", { name: /Tentar de novo/i }));

    expect(await screen.findByText(/perde na hora/i)).toBeInTheDocument();
    expect(screen.queryByText(/não foi possível comparar os planos/i)).not.toBeInTheDocument();
  });

  it("trocar a escolha desmarca a confirmação anterior (não vale para outro plano)", async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(seletor(), "basico");
    await screen.findByRole("alert");
    await user.click(screen.getByRole("checkbox"));
    expect(salvar()).toBeEnabled();

    await user.selectOptions(seletor(), "alto");
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(salvar()).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Delivery (site de pedidos)");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Estoque");
  });

  it("voltar para o plano atual limpa a comparação e volta a travar o salvar", async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(seletor(), "basico");
    await screen.findByRole("alert");

    await user.selectOptions(seletor(), "avancado");
    await waitFor(() => expect(screen.queryByText(/perde na hora/i)).not.toBeInTheDocument());
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(salvar()).toBeDisabled();
  });

  it("erro do servidor ao salvar continua aparecendo com a mensagem do banco", async () => {
    mockAlterarPlano.mockResolvedValue({ data: null, error: { message: "Apenas a plataforma pode trocar o plano." } });
    const user = userEvent.setup();
    const { onAlterado } = montar();
    await user.selectOptions(seletor(), "basico");
    await screen.findByRole("alert");
    await user.click(screen.getByRole("checkbox"));
    await user.click(salvar());

    expect(await screen.findByText(/Apenas a plataforma pode trocar o plano/i)).toBeInTheDocument();
    expect(onAlterado).not.toHaveBeenCalled();
  });
});

// ── CONSOLE-UX 24 — Esc e clique fora ──
//
// Nos modais de um campo só, o gesto de sair é o mesmo do "X": reabrir custa um
// clique, não há o que confirmar. Este teste vale como amostra dos cinco
// modais simples do Console, que ligam o hook exatamente assim.
describe("AlterarPlanoModal — Esc e clique fora", () => {
  it("Esc fecha o modal", async () => {
    const user = userEvent.setup();
    const { onFechar } = montar();

    await user.keyboard("{Escape}");

    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("clique dentro do modal não fecha", async () => {
    const user = userEvent.setup();
    const { onFechar } = montar();

    await user.click(await screen.findByRole("heading", { name: /Trocar plano/i }));

    expect(onFechar).not.toHaveBeenCalled();
  });
});
