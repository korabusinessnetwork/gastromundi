// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import CupomNfce from "./CupomNfce";
import { montarDanfeNfce } from "@/lib/nfceDanfe";

const CHAVE = "43260712345678000195650010000000011000000017";

const baseDados = {
  emit: { xNome: "Zé Lanches LTDA", xFant: "Zé Lanches", cnpj: "12345678000195" },
  itens: [{ xProd: "X-Salada", qCom: 2, vUnCom: 15, vProd: 30 }],
  pagamentos: [{ tPag: "01", vPag: 30 }],
  chave: CHAVE,
  tpAmb: 2,
  dataEmissao: "2026-07-13T14:00:00Z",
};

describe("<CupomNfce>", () => {
  it("renderiza itens, total e a tarja de homologação", () => {
    render(<CupomNfce danfe={montarDanfeNfce(baseDados)} />);
    expect(screen.getByText("X-Salada")).toBeInTheDocument();
    expect(screen.getByText(/SEM VALOR FISCAL/)).toBeInTheDocument();
    expect(screen.getByText(/CONSUMIDOR NÃO IDENTIFICADO/)).toBeInTheDocument();
  });

  it("mostra o estado pendente quando não há protocolo e não renderiza QR", () => {
    render(<CupomNfce danfe={montarDanfeNfce(baseDados)} />);
    expect(screen.getByText(/Aguardando autorização/i)).toBeInTheDocument();
  });

  it("gera o SVG do QR quando a nota está autorizada com urlQrCode", async () => {
    const danfe = montarDanfeNfce({
      ...baseDados,
      tpAmb: 1,
      protocolo: "135260000123456",
      urlQrCode: "https://sefaz.rs.gov.br/nfce?p=" + CHAVE + "|2|1|000001|HASH",
    });
    const { container } = render(<CupomNfce danfe={danfe} />);
    await waitFor(() => expect(container.querySelector(".cupom-nfce__qr svg")).toBeTruthy());
    expect(screen.getByText(/Protocolo de autorização/)).toBeInTheDocument();
  });

  it("não quebra sem danfe", () => {
    const { container } = render(<CupomNfce danfe={null} />);
    expect(container.firstChild).toBeNull();
  });
});
