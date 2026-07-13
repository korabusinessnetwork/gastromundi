// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ModalCupomNfce from "./ModalCupomNfce";

const CHAVE = "43260712345678000195650010000000011000000017";

const venda = {
  id: "v1",
  items: [{ id: "p1", name: "X-Salada", price: 15, qty: 2 }],
  pagamentos: [{ metodo: "dinheiro", valor: 30 }],
  dest: null,
};

const emit = { xNome: "Zé Lanches LTDA", xFant: "Zé Lanches", cnpj: "12345678000195" };

function resultado(over = {}) {
  return { status: "autorizada", emit, tpAmb: 1, tpEmis: 1, dhEmi: "2026-07-13T14:00:00Z", ...over };
}

describe("<ModalCupomNfce>", () => {
  it("estado 'emitindo': mostra o spinner e a mensagem, sem botão Imprimir", () => {
    render(<ModalCupomNfce estadoEmissao="emitindo" resultado={null} venda={venda} onFechar={() => {}} />);
    expect(screen.getByText("Emitindo NFC-e…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Imprimir/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
  });

  it("status 'autorizada': renderiza o cupom com itens e habilita Imprimir", () => {
    render(
      <ModalCupomNfce
        estadoEmissao="concluido"
        resultado={resultado({ chave: CHAVE, protocolo: "135260000123456", urlQrCode: `https://x/nfce?p=${CHAVE}|2|1|1|H` })}
        venda={venda}
        onFechar={() => {}}
      />,
    );
    expect(screen.getByText("X-Salada")).toBeInTheDocument();
    expect(screen.getByText(/Protocolo de autorização/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Imprimir/i })).toBeInTheDocument();
  });

  it("status 'sem_chave': mostra a PRÉVIA com a tarja de aviso (homologação/pendente)", () => {
    render(
      <ModalCupomNfce
        estadoEmissao="concluido"
        resultado={resultado({ status: "sem_chave", tpAmb: 2, chave: null, protocolo: null, urlQrCode: null })}
        venda={venda}
        onFechar={() => {}}
      />,
    );
    // Sem certificado ainda: cupom de prévia, sem valor fiscal, mas visível.
    expect(screen.getByText("X-Salada")).toBeInTheDocument();
    expect(screen.getAllByText(/SEM VALOR FISCAL|PENDENTE DE AUTORIZAÇÃO/).length).toBeGreaterThan(0);
  });

  it("status 'erro': mensagem humana, sem tratar como falha da venda e sem Imprimir", () => {
    render(
      <ModalCupomNfce
        estadoEmissao="concluido"
        resultado={{ status: "erro", detalhe: "cStat 217 — sem retorno" }}
        venda={venda}
        onFechar={() => {}}
      />,
    );
    expect(screen.getByText("A venda foi concluída.")).toBeInTheDocument();
    expect(screen.getByText(/cStat 217/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Imprimir/i })).toBeNull();
  });

  it("Fechar chama onFechar (nunca trava a navegação)", () => {
    const onFechar = vi.fn();
    render(<ModalCupomNfce estadoEmissao="emitindo" resultado={null} venda={venda} onFechar={onFechar} />);
    screen.getByRole("button", { name: "Fechar" }).click();
    expect(onFechar).toHaveBeenCalledTimes(1);
  });
});
