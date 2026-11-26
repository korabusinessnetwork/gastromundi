// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ApexNotasPage from "./ApexNotasPage";
import { NOTAS_DE_ATUALIZACAO, dataPorExtenso } from "@/features/apex/regras/notasDeAtualizacao";

describe("ApexNotasPage, novidades do sistema", () => {
  it("mostra cada atualização com a data por extenso, o título e os itens", () => {
    render(<ApexNotasPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Novidades do sistema" })).toBeInTheDocument();
    const maisNova = NOTAS_DE_ATUALIZACAO[0];
    expect(screen.getByText(dataPorExtenso(maisNova.data))).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: maisNova.titulo })).toBeInTheDocument();
    expect(screen.getByText(maisNova.itens[0].texto)).toBeInTheDocument();
  });

  it("a atualização mais nova aparece primeiro", () => {
    render(<ApexNotasPage />);
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual(NOTAS_DE_ATUALIZACAO.map((n) => n.titulo));
  });

  it("tem a saída de volta ao site", () => {
    render(<ApexNotasPage />);
    const saidas = screen.getAllByRole("link", { name: /voltar ao site/i });
    expect(saidas.length).toBeGreaterThan(0);
    for (const link of saidas) expect(link).toHaveAttribute("href", "/");
  });

  it("item com anexo mostra o link para baixar o arquivo", () => {
    render(<ApexNotasPage />);
    const comAnexo = NOTAS_DE_ATUALIZACAO.flatMap((n) => n.itens).filter((i) => i.anexo);
    expect(comAnexo.length).toBeGreaterThan(0);
    for (const item of comAnexo) {
      expect(screen.getByRole("link", { name: item.anexo.rotulo })).toHaveAttribute("href", item.anexo.href);
    }
  });
});

