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

// O banco local que não abriu (aba anônima, dados de site bloqueados, outra aba
// segurando uma versão antiga). A fila continua funcionando, mas só na memória
// desta aba: fechar o navegador apaga pedido que já saiu para o cliente. O
// indicador prometia "pedidos guardados" sem ter onde guardar.
describe("IndicadorRede, o navegador que não guarda os pedidos", () => {
  it("com pendência, diz claramente que fechar o navegador perde os pedidos", () => {
    render(<IndicadorRede online pendencias={2} semArmazenamento />);

    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("2 pedidos guardados só nesta aba");
    expect(aviso).toHaveTextContent("fechar o navegador perde esses pedidos");
    expect(aviso.className).toContain("indicador-rede--alerta");
  });

  it("com um pedido só, a frase fica no singular", () => {
    render(<IndicadorRede online pendencias={1} semArmazenamento />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "1 pedido guardado só nesta aba, fechar o navegador perde esse pedido",
    );
  });

  it("sem pendência o aviso aparece discreto, e não desaparece", () => {
    render(<IndicadorRede online pendencias={0} semArmazenamento />);

    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("Este navegador não está guardando os pedidos");
    expect(aviso.className).toContain("indicador-rede--aviso");
    expect(aviso.className).not.toContain("indicador-rede--alerta");
  });

  it("sem internet e sem banco, o texto diz as duas coisas", () => {
    render(<IndicadorRede online={false} pendencias={0} semArmazenamento />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Sem internet, e os pedidos ficam só nesta aba, evite fechar o navegador",
    );
  });

  it("a pendência em risco vem na frente do aviso de envio parado", () => {
    render(<IndicadorRede online pendencias={3} semArmazenamento falhaEnvio />);

    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("3 pedidos guardados só nesta aba");
    expect(aviso.textContent).not.toMatch(/Enviando/);
  });
});

/**
 * Canal de tempo real caído com a internet aparentando estar de pé.
 *
 * Quem opera não percebe isso sozinho: a tela simplesmente para de receber
 * pedido do garçom, e um kanban parado é lido como "não chegou pedido novo",
 * que é o pior jeito de perder um pedido. O sinal já existia no contexto e não
 * tinha quem o mostrasse.
 */
describe("IndicadorRede, tempo real instável", () => {
  it("online e sem pendência, avisa que os pedidos podem estar atrasando", () => {
    render(<IndicadorRede online pendencias={0} realtimeInstavel />);

    expect(screen.getByRole("status")).toHaveTextContent(/pedidos podem estar atrasando na tela, reconectando/i);
  });

  it("com pendência, diz que está reconectando e quantos esperam", () => {
    render(<IndicadorRede online pendencias={2} realtimeInstavel />);

    expect(screen.getByRole("status")).toHaveTextContent("Reconectando, 2 pedidos guardados esperando");
  });

  it("fila parada por falta de servidor continua vindo antes, porque é dinheiro não registrado", () => {
    render(<IndicadorRede online pendencias={1} falhaEnvio realtimeInstavel />);

    expect(screen.getByRole("status")).toHaveTextContent(/sem conexão com o servidor/i);
  });

  it("sem instabilidade e sem pendência, o badge continua sumindo da tela", () => {
    render(<IndicadorRede online pendencias={0} />);

    expect(screen.queryByRole("status")).toBeNull();
  });
});
