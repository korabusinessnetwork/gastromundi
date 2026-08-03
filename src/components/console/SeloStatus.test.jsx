// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SeloStatus from "./SeloStatus";

/**
 * O selo saiu de dentro do PlanosDashboard para ser usado também na lista de
 * estabelecimentos. Estes testes fixam o vocabulário: é ele que as duas abas
 * do Console mostram para a MESMA situação, e divergir de novo (uma dizendo
 * "Ativo", a outra "Em atraso") é o defeito que a extração fecha.
 */
describe("SeloStatus", () => {
  it("assinatura em dia e longe do vencimento diz apenas Ativo", () => {
    render(<SeloStatus status="ativo" dias={40} />);
    expect(screen.getByText("Ativo")).toBeInTheDocument();
  });

  it("dentro da janela de 5 dias, troca o rótulo pela contagem", () => {
    render(<SeloStatus status="ativo" dias={3} />);
    expect(screen.getByText("Vence em 3 dias")).toBeInTheDocument();
  });

  it("um dia no singular e vencimento hoje sem número", () => {
    const { unmount } = render(<SeloStatus status="ativo" dias={1} />);
    expect(screen.getByText("Vence em 1 dia")).toBeInTheDocument();
    unmount();

    render(<SeloStatus status="ativo" dias={0} />);
    expect(screen.getByText("Vence hoje")).toBeInTheDocument();
  });

  it("carência mostra os dias em atraso em módulo (o número vem negativo)", () => {
    render(<SeloStatus status="carencia" dias={-2} />);
    expect(screen.getByText("Em atraso (2d)")).toBeInTheDocument();
  });

  it("bloqueado, cancelado e sem assinatura têm rótulo em português, sem jargão", () => {
    const { unmount } = render(<SeloStatus status="bloqueado" dias={-10} />);
    expect(screen.getByText("Bloqueado")).toBeInTheDocument();
    unmount();

    const t2 = render(<SeloStatus status="cancelado" dias={null} />);
    expect(screen.getByText("Cancelado")).toBeInTheDocument();
    t2.unmount();

    render(<SeloStatus status="sem_assinatura" dias={null} />);
    expect(screen.getByText("Sem assinatura")).toBeInTheDocument();
  });

  it("status desconhecido ou ausente cai em 'Sem assinatura' — nunca em branco", () => {
    render(<SeloStatus status={undefined} dias={null} />);
    expect(screen.getByText("Sem assinatura")).toBeInTheDocument();
  });
});
