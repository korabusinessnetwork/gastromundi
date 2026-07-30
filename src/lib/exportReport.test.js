// Run 5, leva 11 — a marca carimbada no arquivo exportado.
//
// O PDF e a planilha saem do sistema: vão para o contador, para o sócio, para
// o banco. O fallback deste módulo (usado quando o chamador não informa a
// identidade do tenant) ERA a marca de um cliente específico — ou seja, todo
// export sem `opts.empresa` levava o nome de outra empresa impresso no
// cabeçalho (decisão 017).
//
// jsPDF/XLSX viram dublês: aqui não interessa gerar arquivo, e sim o que é
// escrito no cabeçalho antes de gerar.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { pdf } = vi.hoisted(() => ({ pdf: { textos: [], arquivos: [] } }));
vi.mock("jspdf", () => ({
  jsPDF: class {
    constructor() {
      this.internal = { pageSize: { width: 297 } };
      this.lastAutoTable = { finalY: 100 };
    }
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    line() {}
    text(txt) { pdf.textos.push(txt); }
    save(nome) { pdf.arquivos.push(nome); }
  },
}));
vi.mock("jspdf-autotable", () => ({ default: vi.fn() }));

const { xlsx } = vi.hoisted(() => ({ xlsx: { planilhas: [], arquivos: [] } }));
vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: (data) => { xlsx.planilhas.push(data); return { data }; },
    book_new: () => ({}),
    book_append_sheet: () => {},
  },
  writeFile: (_wb, nome) => { xlsx.arquivos.push(nome); },
}));

import { exportToPDF, exportToXLSX } from "./exportReport";

/** Primeira linha da planilha: "<empresa> — <título>", período e data. */
const metaDaPlanilha = () => xlsx.planilhas[0][0][0];

beforeEach(() => {
  pdf.textos.length = 0;
  pdf.arquivos.length = 0;
  xlsx.planilhas.length = 0;
  xlsx.arquivos.length = 0;
});

describe("exportReport — marca no cabeçalho do arquivo (Run 5, leva 11)", () => {
  it("sem identidade informada, o PDF sai com a marca da PLATAFORMA", () => {
    exportToPDF("Vendas", ["Produto"], [["Café"]], "hoje");

    // O nome da empresa é a primeira coisa escrita no PDF.
    expect(pdf.textos[0]).toBe("Kora");
    expect(pdf.textos.join(" | ")).not.toContain("GASTROMUNDI");
  });

  it("com identidade informada, o PDF sai com a marca do estabelecimento", () => {
    // Contrapeso: o fallback não pode passar por cima de quem informou.
    exportToPDF("Vendas", ["Produto"], [["Café"]], "hoje", { empresa: "CASA COFFEE by Kora" });

    expect(pdf.textos[0]).toBe("CASA COFFEE by Kora");
  });

  it("sem identidade informada, a planilha sai com a marca da PLATAFORMA", () => {
    exportToXLSX("Vendas", ["Produto"], [["Café"]], "hoje");

    expect(metaDaPlanilha()).toContain("Kora — Vendas");
    expect(metaDaPlanilha()).not.toContain("GASTROMUNDI");
  });

  it("com identidade informada, a planilha sai com a marca do estabelecimento", () => {
    exportToXLSX("Vendas", ["Produto"], [["Café"]], "hoje", { empresa: "CASA COFFEE by Kora" });

    expect(metaDaPlanilha()).toContain("CASA COFFEE by Kora — Vendas");
  });
});
