// @vitest-environment jsdom
//
// Fila de pedidos de conta no Console.
//
// É a outra ponta do "Criar minha conta" do site: se esta tela mentir,
// um cliente novo fica sem resposta. Por isso o que se garante aqui é o
// que decide a conversa — quem espera há mais tempo aparece primeiro, o
// endereço pedido está visível (é ele que vira o subdomínio e o login da
// equipe), falha de leitura DIZ que não sabe em vez de mostrar "nenhum
// pedido", e recusar é uma ação confirmada, não um clique solto.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SolicitacoesFila from "./SolicitacoesFila";

const PENDENTE = {
  id: "1",
  nome: "Maria Silva",
  whatsapp: "11988887777",
  email: "maria@bardoze.com.br",
  estabelecimento: "Bar do Zé",
  slug_desejado: "bardoze",
  plano_nome: "Restaurante",
  plano_itens: ["Estoque"],
  plano_total: 427,
  status: "pendente",
  criado_em: "2026-08-02T10:00:00Z",
};

const MAIS_ANTIGO = {
  ...PENDENTE,
  id: "2",
  estabelecimento: "Padaria Aurora",
  slug_desejado: "padariaaurora",
  criado_em: "2026-08-01T10:00:00Z",
};

const DECIDIDA = {
  ...PENDENTE,
  id: "3",
  estabelecimento: "Café Central",
  slug_desejado: "cafecentral",
  status: "recusada",
  observacao: "já é cliente",
  decidido_em: "2026-08-03T10:00:00Z",
};

describe("SolicitacoesFila", () => {
  it("quem pediu primeiro aparece primeiro — é quem espera há mais tempo", () => {
    render(<SolicitacoesFila solicitacoes={[PENDENTE, MAIS_ANTIGO]} />);
    const cartoes = screen.getAllByRole("listitem");
    expect(within(cartoes[0]).getByText("Padaria Aurora")).toBeInTheDocument();
  });

  it("mostra o endereço pedido — é ele que vira o subdomínio e o login da equipe", () => {
    render(<SolicitacoesFila solicitacoes={[PENDENTE]} />);
    expect(screen.getByText("bardoze")).toBeInTheDocument();
  });

  it("mostra o contato e o plano que a pessoa escolheu", () => {
    render(<SolicitacoesFila solicitacoes={[PENDENTE]} />);
    expect(screen.getByText("Maria Silva")).toBeInTheDocument();
    expect(screen.getByText(/\(11\) 98888-7777/)).toBeInTheDocument();
    expect(screen.getByText("Restaurante")).toBeInTheDocument();
  });

  it("aprovar entrega o pedido inteiro para quem vai criar o estabelecimento", async () => {
    const onAprovar = vi.fn();
    const user = userEvent.setup();
    render(<SolicitacoesFila solicitacoes={[PENDENTE]} onAprovar={onAprovar} />);

    await user.click(screen.getByRole("button", { name: /aprovar e criar/i }));

    expect(onAprovar).toHaveBeenCalledWith(PENDENTE);
  });

  it("recusar pede confirmação antes de valer", async () => {
    const onRecusar = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<SolicitacoesFila solicitacoes={[PENDENTE]} onRecusar={onRecusar} />);

    await user.click(screen.getByRole("button", { name: "Recusar" }));
    expect(onRecusar).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox"), "já é cliente");
    await user.click(screen.getByRole("button", { name: /confirmar recusa/i }));

    expect(onRecusar).toHaveBeenCalledWith(PENDENTE, "já é cliente");
  });

  it("recusa que falhou mantém o cartão aberto e diz o que houve", async () => {
    const onRecusar = vi.fn().mockResolvedValue({ ok: false, erro: "Sem conexão." });
    const user = userEvent.setup();
    render(<SolicitacoesFila solicitacoes={[PENDENTE]} onRecusar={onRecusar} />);

    await user.click(screen.getByRole("button", { name: "Recusar" }));
    await user.click(screen.getByRole("button", { name: /confirmar recusa/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sem conexão.");
    // O pedido continua pendente: o botão de confirmar ainda está lá.
    expect(screen.getByRole("button", { name: /confirmar recusa/i })).toBeInTheDocument();
  });

  it("offline desabilita as ações em vez de deixar o clique falhar", () => {
    render(<SolicitacoesFila solicitacoes={[PENDENTE]} online={false} />);
    expect(screen.getByRole("button", { name: /aprovar e criar/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Recusar" })).toBeDisabled();
  });

  it("falha de leitura DIZ que não sabe — nunca 'nenhum pedido esperando'", () => {
    render(<SolicitacoesFila solicitacoes={[]} erro={true} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível carregar/i);
    expect(screen.queryByText(/nenhum pedido esperando/i)).not.toBeInTheDocument();
  });

  it("sem pedidos, explica o que vai aparecer ali", () => {
    render(<SolicitacoesFila solicitacoes={[]} />);
    expect(screen.getByText(/nenhum pedido esperando/i)).toBeInTheDocument();
  });

  it("o que já foi decidido fica no histórico, com o motivo", () => {
    render(<SolicitacoesFila solicitacoes={[DECIDIDA]} />);
    expect(screen.getByText(/já decididos/i)).toBeInTheDocument();
    expect(screen.getByText("Café Central")).toBeInTheDocument();
    expect(screen.getByText("já é cliente")).toBeInTheDocument();
    // E não aparece como pendente esperando decisão.
    expect(screen.queryByRole("button", { name: /aprovar e criar/i })).not.toBeInTheDocument();
  });
});
