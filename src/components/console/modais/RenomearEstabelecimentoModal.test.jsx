// @vitest-environment jsdom
//
// Pré-venda §1.8 — o Console cadastrava e nunca mais consertava.
//
// `tenants` é SELECT-only sob RLS (ADR-005/008 §7) e nenhuma das três RPCs
// existentes escreve `nome` (plano, layout e identidade do próprio admin). Um
// erro de digitação no cadastro ("Bar do Zé" virando "Bar do Ze") ficava para
// sempre: na lista do Console, no texto de primeiro acesso copiado para o
// cliente e em todo relatório da plataforma — com o SQL Editor como único
// conserto.
//
// O que esta tela precisa garantir, além de salvar: que o campo venha com o
// nome de hoje (corrigir a letra, não redigitar), que o endereço apareça
// travado e EXPLICADO (senão a pessoa procura onde trocá-lo e conclui que o
// sistema está quebrado) e que uma recusa do banco nunca apareça como sucesso.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `validarNomeEstabelecimento` e `MAX_NOME_TENANT` ficam REAIS — são a regra
// sob teste, e é o teto real que precisa chegar ao campo. Só a escrita no
// banco é dublada.
const { mockRenomear } = vi.hoisted(() => ({ mockRenomear: vi.fn() }));
vi.mock("@/lib/console/console", async () => {
  const real = await vi.importActual("@/lib/console/console");
  return { ...real, renomearEstabelecimento: mockRenomear };
});

import RenomearEstabelecimentoModal from "./RenomearEstabelecimentoModal";
import { MAX_NOME_TENANT } from "@/lib/console/console";

const TENANT = { id: "t-1", nome: "Bar do Ze", slug: "bar-do-ze" };

const campo = () => screen.getByRole("textbox");
const salvar = () => screen.getByRole("button", { name: /Salvar nome/i });
// Durante o envio o rótulo vira "Salvando…" — buscar só por "Salvar nome"
// não o encontraria mais.
const salvarOuSalvando = () => screen.getByRole("button", { name: /Salvar nome|Salvando/i });
const cancelar = () => screen.getByRole("button", { name: /^Cancelar$/i });

function montar(tenant = TENANT) {
  const onFechar = vi.fn();
  const onRenomeado = vi.fn();
  render(
    <RenomearEstabelecimentoModal tenant={tenant} onFechar={onFechar} onRenomeado={onRenomeado} />
  );
  return { onFechar, onRenomeado };
}

describe("RenomearEstabelecimentoModal — corrigir o nome de um estabelecimento", () => {
  beforeEach(() => {
    mockRenomear.mockReset();
    mockRenomear.mockResolvedValue({ data: { id: "t-1", nome: "Bar do Zé" }, error: null });
  });

  it("já vem com o nome de hoje, para corrigir a letra em vez de redigitar", () => {
    montar();
    expect(campo()).toHaveValue("Bar do Ze");
    // Campo intocado não é acusado de nada — erro em campo que a pessoa nem
    // mexeu é repreensão por algo que ela não fez.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("não deixa salvar o nome que já está gravado, e diz por quê", async () => {
    const user = userEvent.setup();
    montar();
    expect(salvar()).toBeDisabled();
    // Botão travado sem explicação é beco sem saída (Princípio nº1).
    expect(screen.getByText(/Já é esse o nome de hoje/i)).toBeInTheDocument();

    await user.type(campo(), "é"); // vira "Bar do Zeé", mas mudou
    expect(salvar()).toBeEnabled();
  });

  it("ECOA o nome que vai ficar antes do clique", async () => {
    const user = userEvent.setup();
    montar();
    await user.clear(campo());
    await user.type(campo(), "Bar do Zé");
    expect(screen.getByText(/Vai passar a se chamar “Bar do Zé”/)).toBeInTheDocument();
    expect(salvar()).toBeEnabled();
  });

  it("mostra o endereço TRAVADO e escreve o motivo", () => {
    montar();
    // Escondê-lo faria a pessoa procurar em outra tela; mostrá-lo sem o
    // motivo faria parecer defeito.
    expect(screen.getByText("bar-do-ze")).toBeInTheDocument();
    expect(
      screen.getByText(/o endereço não muda junto com o nome.*QR code impresso/i)
    ).toBeInTheDocument();
  });

  it("nome vazio é recusado antes de chegar ao banco", async () => {
    const user = userEvent.setup();
    montar();
    await user.clear(campo());
    expect(screen.getByRole("alert")).toHaveTextContent(/Informe o nome do estabelecimento/i);
    expect(salvar()).toBeDisabled();
    await user.click(salvar());
    expect(mockRenomear).not.toHaveBeenCalled();
  });

  it("uma letra só é recusado dizendo o mínimo", async () => {
    const user = userEvent.setup();
    montar();
    await user.clear(campo());
    await user.type(campo(), "B");
    expect(screen.getByRole("alert")).toHaveTextContent(/ao menos 2 caracteres/i);
    expect(salvar()).toBeDisabled();
  });

  it("o campo não deixa passar do teto que o banco aceita", async () => {
    const user = userEvent.setup();
    montar();
    // Prevenção de erro > mensagem de erro: em vez de digitar 200 letras e
    // levar a recusa do Postgres na cara, o campo simplesmente para no teto.
    expect(campo()).toHaveAttribute("maxlength", String(MAX_NOME_TENANT));

    await user.clear(campo());
    await user.type(campo(), "N".repeat(MAX_NOME_TENANT + 10));
    expect(campo().value).toHaveLength(MAX_NOME_TENANT);
    expect(salvar()).toBeEnabled();
  });

  it("salva o nome APARADO, e devolve o tenant atualizado", async () => {
    const user = userEvent.setup();
    const { onRenomeado } = montar();
    await user.clear(campo());
    await user.type(campo(), "  Bar do Zé  ");
    await user.click(salvar());

    // Espaço nas pontas viraria nome com espaço na lista e no texto de
    // primeiro acesso mandado ao cliente.
    expect(mockRenomear).toHaveBeenCalledWith("t-1", "Bar do Zé");
    expect(onRenomeado).toHaveBeenCalledWith({ id: "t-1", nome: "Bar do Zé" });
  });

  it("clique duplo manda uma vez só", async () => {
    const user = userEvent.setup();
    let liberar;
    mockRenomear.mockImplementation(() => new Promise((r) => { liberar = r; }));
    montar();
    await user.clear(campo());
    await user.type(campo(), "Bar do Zé");
    await user.click(salvar());

    expect(screen.getByText(/Salvando…/)).toBeInTheDocument();
    expect(salvarOuSalvando()).toBeDisabled();
    expect(cancelar()).toBeDisabled();  // fechar no meio da escrita
    expect(campo()).toBeDisabled();     // e mudar o nome no meio dela
    await user.click(salvarOuSalvando());
    expect(mockRenomear).toHaveBeenCalledTimes(1);

    await act(async () => { liberar({ data: { id: "t-1", nome: "Bar do Zé" }, error: null }); });
    expect(mockRenomear).toHaveBeenCalledTimes(1);
  });

  it("recusa do banco aparece na tela e o modal NÃO fecha", async () => {
    const user = userEvent.setup();
    mockRenomear.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Apenas a plataforma pode renomear um estabelecimento." },
    });
    const { onRenomeado, onFechar } = montar();
    await user.clear(campo());
    await user.type(campo(), "Bar do Zé");
    await user.click(salvar());

    // Fechar aqui seria o pior desfecho: a pessoa sai achando que corrigiu e
    // a lista do Console continua com o nome errado.
    expect(screen.getByRole("alert")).toHaveTextContent(/Apenas a plataforma pode renomear/i);
    expect(onRenomeado).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
    // E dá para tentar de novo: nada fica travado depois da falha.
    expect(salvar()).toBeEnabled();
    expect(campo()).toBeEnabled();
  });

  it("Cancelar fecha sem escrever nada", async () => {
    const user = userEvent.setup();
    const { onFechar } = montar();
    await user.clear(campo());
    await user.type(campo(), "Bar do Zé");
    await user.click(cancelar());
    expect(onFechar).toHaveBeenCalled();
    expect(mockRenomear).not.toHaveBeenCalled();
  });
});
