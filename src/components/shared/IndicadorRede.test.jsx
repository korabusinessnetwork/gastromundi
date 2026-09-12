// @vitest-environment jsdom
//
// O texto do indicador tem de dizer a verdade sobre a fila.
//
// O defeito: com o navegador se dizendo online e o servidor fora de alcance
// (link do provedor caído, portal cativo, Supabase fora do ar), o dreno parava
// no erro de rede e o indicador seguia afirmando "Enviando N pedidos
// guardados..." para sempre. A frase prometia um envio que não estava
// acontecendo, e quem opera o caixa não tinha como saber que a venda continuava
// parada ali.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import IndicadorRede from "./IndicadorRede";

describe("IndicadorRede, o texto dos dois desfechos do envio", () => {
  it("enviando de verdade: diz que está enviando", () => {
    render(<IndicadorRede online pendencias={2} falhaEnvio={false} />);

    expect(screen.getByRole("status")).toHaveTextContent("Enviando 2 pedidos guardados...");
  });

  it("última tentativa parada por rede: NÃO diz que está enviando", () => {
    render(<IndicadorRede online pendencias={2} falhaEnvio />);

    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("Sem conexão com o servidor");
    expect(aviso).toHaveTextContent("2 pedidos guardados");
    expect(aviso).toHaveTextContent("tentando de novo sozinho");
    expect(aviso.textContent).not.toMatch(/Enviando/);
  });

  it("um pedido só fica no singular nos dois textos", () => {
    const { unmount } = render(<IndicadorRede online pendencias={1} />);
    expect(screen.getByRole("status")).toHaveTextContent("Enviando 1 pedido guardado...");
    unmount();

    render(<IndicadorRede online pendencias={1} falhaEnvio />);
    expect(screen.getByRole("status")).toHaveTextContent("1 pedido guardado esperando");
  });

  it("sem internet o texto continua sendo o da falta de internet", () => {
    render(<IndicadorRede online={false} pendencias={3} falhaEnvio />);

    expect(screen.getByRole("status")).toHaveTextContent("Sem internet, 3 pedidos guardados para enviar");
  });

  it("online, sem pendência e sem falha, o indicador não aparece", () => {
    render(<IndicadorRede online pendencias={0} />);

    expect(screen.queryByRole("status")).toBeNull();
  });
});
