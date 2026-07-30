// @vitest-environment jsdom
//
// R7L8 — a coluna "Mensalidade" do Console virou a via de escrita do preço.
//
// O que este arquivo protege: que o "—" da coluna seja CLICÁVEL (era só
// texto, e o preço só existia via UPDATE no SQL Editor), que a linha SEM
// assinatura NÃO ofereça o clique (a RPC recusaria com no_data_found), e que
// a nota embaixo dos cartões apareça exatamente quando há alguém sem preço —
// ela é o único lugar da tela que explica por que a "Receita mensal" pode
// estar menor que a real.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `resumirPlataforma` fica REAL — é ela que decide quem está sem preço.
// Só a escrita no banco é dublada.
const { mockDefinir } = vi.hoisted(() => ({ mockDefinir: vi.fn() }));
vi.mock("@/lib/console", async () => {
  const real = await vi.importActual("@/lib/console");
  return { ...real, definirMensalidade: mockDefinir };
});

import PlanosDashboard from "./PlanosDashboard";

// O componente chama resumirPlataforma sem `hoje` (usa new Date()), então as
// datas são relativas — teste com data fixa viraria bomba de tempo.
function emDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}
const FOLGADO = emDias(20); // ativo, longe da janela de "vence em breve"

const PLANOS = [{ codigo: "basico", nome: "Básico" }];
const ass = (id, valor) => ({
  tenant_id: id,
  valor_mensal: valor,
  data_vencimento: FOLGADO,
  carencia_dias: 3,
  status: "ativo",
});

const tabela = () => screen.getByRole("table");
const linhaDe = (nome) => within(tabela()).getByText(nome).closest("tr");

function montar({ tenants, assinaturas }) {
  const onAtualizado = vi.fn();
  render(
    <PlanosDashboard
      tenants={tenants}
      planos={PLANOS}
      assinaturas={assinaturas}
      onAtualizado={onAtualizado}
    />
  );
  return { onAtualizado };
}

// Cenário-base: um pagante, um sem preço, um sem linha de assinatura.
const BASE = {
  tenants: [
    { id: "t-pago", nome: "Café Central", plano_codigo: "basico" },
    { id: "t-zero", nome: "Bar do Zé", plano_codigo: "basico" },
    { id: "t-sem", nome: "Lanches Novos", plano_codigo: "basico" },
  ],
  assinaturas: [ass("t-pago", 300), ass("t-zero", 0)],
};

describe("PlanosDashboard — coluna Mensalidade", () => {
  beforeEach(() => {
    mockDefinir.mockReset();
    mockDefinir.mockResolvedValue({ data: { valor_mensal: 250 }, error: null });
  });

  it("quem tem preço mostra o valor e um botão que diz que dá para alterar", () => {
    montar(BASE);
    const botao = within(linhaDe("Café Central")).getByRole("button");
    expect(botao).toHaveTextContent(/R\$\s*300,00/);
    // O aria-label leva o valor de hoje: quem usa leitor de tela não vê a
    // célula ao lado e precisaria abrir o modal só para saber o preço atual.
    expect(botao).toHaveAccessibleName(/Alterar mensalidade de Café Central \(hoje R\$\s*300,00\)/);
  });

  it("o “—” de quem não tem preço É o botão que resolve o “—”", () => {
    // Este era o defeito: a célula mostrava "—" como texto morto e o único
    // jeito de definir o preço era um UPDATE cru no SQL Editor.
    montar(BASE);
    const botao = within(linhaDe("Bar do Zé")).getByRole("button");
    expect(botao).toHaveTextContent("—");
    expect(botao).toHaveAccessibleName("Definir mensalidade de Bar do Zé");
  });

  it("estabelecimento SEM assinatura não oferece o clique", () => {
    // Não há linha para atualizar: a RPC recusaria com no_data_found. Oferecer
    // o botão seria empurrar a pessoa para um erro (prevenção > mensagem).
    montar(BASE);
    const linha = linhaDe("Lanches Novos");
    expect(within(linha).queryByRole("button")).toBeNull();
    expect(linha).toHaveTextContent("Sem assinatura");
  });

  it("clicar abre o modal já apontado para aquele estabelecimento", async () => {
    const user = userEvent.setup();
    montar(BASE);
    await user.click(within(linhaDe("Bar do Zé")).getByRole("button"));

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /Definir mensalidade/i })).toBeInTheDocument();
    // Apontar para o estabelecimento errado gravaria o preço no cliente errado.
    expect(within(modal).getByText("Bar do Zé")).toBeInTheDocument();
  });

  it("salvar fecha o modal e manda a tela recarregar", async () => {
    const user = userEvent.setup();
    const { onAtualizado } = montar(BASE);
    await user.click(within(linhaDe("Bar do Zé")).getByRole("button"));
    await user.type(screen.getByRole("textbox"), "250");
    await user.click(screen.getByRole("button", { name: /Salvar mensalidade/i }));

    expect(mockDefinir).toHaveBeenCalledWith("t-zero", 250);
    // Sem o recarregar, a tabela continuaria mostrando "—" depois de salvar e
    // a pessoa clicaria de novo achando que não funcionou.
    expect(onAtualizado).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancelar fecha sem escrever nem recarregar", async () => {
    const user = userEvent.setup();
    const { onAtualizado } = montar(BASE);
    await user.click(within(linhaDe("Bar do Zé")).getByRole("button"));
    await user.click(screen.getByRole("button", { name: /^Cancelar$/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockDefinir).not.toHaveBeenCalled();
    expect(onAtualizado).not.toHaveBeenCalled();
  });
});

describe("PlanosDashboard — a nota que explica a receita mensal", () => {
  it("no singular, com quem está sem preço", () => {
    montar(BASE);
    const nota = screen.getByText(/1 estabelecimento ativo está sem mensalidade definida/);
    expect(nota).toHaveTextContent(/não entra na receita mensal/);
    // A nota tem de dizer o que FAZER, não só que há um problema.
    expect(nota).toHaveTextContent(/Clique no .*—.* da coluna Mensalidade/);
  });

  it("no plural quando são vários", () => {
    montar({
      tenants: [
        { id: "a", nome: "Um", plano_codigo: "basico" },
        { id: "b", nome: "Dois", plano_codigo: "basico" },
      ],
      assinaturas: [ass("a", 0), ass("b", 0)],
    });
    expect(
      screen.getByText(/2 estabelecimentos ativos estão sem mensalidade definida/)
    ).toBeInTheDocument();
  });

  it("desaparece quando todo mundo que paga tem preço", () => {
    // Aviso que fica na tela para sempre deixa de ser lido. Ele sai sozinho
    // quando o problema acaba.
    montar({
      tenants: [{ id: "a", nome: "Um", plano_codigo: "basico" }],
      assinaturas: [ass("a", 300)],
    });
    expect(screen.queryByText(/sem mensalidade definida/)).toBeNull();
    // E o preço definido entra de verdade na receita mensal (o cartão-herói).
    const cartao = screen.getByText("Receita mensal").closest(".pdash__kpi");
    expect(cartao).toHaveTextContent(/R\$\s*300,00/);
  });
});
