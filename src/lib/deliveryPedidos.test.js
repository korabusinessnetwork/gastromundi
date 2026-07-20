import { describe, it, expect, vi, beforeEach } from "vitest";

// A camada importa o client Supabase (que exige VITE_* no import). Só
// testamos as funções PURAS aqui — o client é mockado para não exigir env.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import {
  STATUS_FLUXO,
  STATUS_CANCELADO,
  statusLabel,
  statusCor,
  ehTerminal,
  proximoStatus,
  rotuloAcao,
  podeCancelar,
  agruparPorStatus,
  resumoEndereco,
  apenasDigitosTelefone,
  formatarTelefone,
  linkWhatsApp,
  formatarFormaPagamento,
  resumoPagamento,
  formatarReais,
  tempoDecorrido,
  atualizarStatusPedido,
} from "./deliveryPedidos";
import { supabase } from "./supabase";

describe("statusLabel", () => {
  it("traduz cada status do fluxo + cancelado", () => {
    expect(statusLabel("recebido")).toBe("Novo pedido");
    expect(statusLabel("em_preparo")).toBe("Em preparo");
    expect(statusLabel("saiu_entrega")).toBe("Saiu para entrega");
    expect(statusLabel("entregue")).toBe("Entregue");
    expect(statusLabel("cancelado")).toBe("Cancelado");
  });
  it("faz fallback pro próprio código quando desconhecido", () => {
    expect(statusLabel("xpto")).toBe("xpto");
    expect(statusLabel(null)).toBe("—");
  });
});

describe("statusCor", () => {
  it("mapeia cada status a uma chave de cor", () => {
    expect(statusCor("recebido")).toBe("blue");
    expect(statusCor("em_preparo")).toBe("amber");
    expect(statusCor("saiu_entrega")).toBe("accent");
    expect(statusCor("entregue")).toBe("green");
    expect(statusCor("cancelado")).toBe("red");
    expect(statusCor("qualquer")).toBe("muted");
  });
});

describe("ehTerminal", () => {
  it("entregue e cancelado são terminais; o resto não", () => {
    expect(ehTerminal("entregue")).toBe(true);
    expect(ehTerminal(STATUS_CANCELADO)).toBe(true);
    expect(ehTerminal("recebido")).toBe(false);
    expect(ehTerminal("em_preparo")).toBe(false);
    expect(ehTerminal("saiu_entrega")).toBe(false);
  });
});

describe("proximoStatus", () => {
  it("avança na ordem do fluxo", () => {
    expect(proximoStatus("recebido")).toBe("em_preparo");
    expect(proximoStatus("em_preparo")).toBe("saiu_entrega");
    expect(proximoStatus("saiu_entrega")).toBe("entregue");
  });
  it("retorna null no fim do fluxo e em status fora do fluxo", () => {
    expect(proximoStatus("entregue")).toBeNull();
    expect(proximoStatus("cancelado")).toBeNull();
    expect(proximoStatus("xpto")).toBeNull();
  });
});

describe("rotuloAcao", () => {
  it("dá o rótulo do botão de avanço", () => {
    expect(rotuloAcao("recebido")).toBe("Aceitar e preparar");
    expect(rotuloAcao("em_preparo")).toBe("Saiu para entrega");
    expect(rotuloAcao("saiu_entrega")).toBe("Confirmar entrega");
  });
  it("é null quando não há avanço", () => {
    expect(rotuloAcao("entregue")).toBeNull();
    expect(rotuloAcao("cancelado")).toBeNull();
  });
});

describe("podeCancelar", () => {
  it("permite cancelar enquanto não terminou", () => {
    expect(podeCancelar("recebido")).toBe(true);
    expect(podeCancelar("saiu_entrega")).toBe(true);
  });
  it("não deixa cancelar terminal", () => {
    expect(podeCancelar("entregue")).toBe(false);
    expect(podeCancelar("cancelado")).toBe(false);
  });
});

describe("agruparPorStatus", () => {
  it("agrupa na ordem do fluxo e só devolve colunas com pedido", () => {
    const pedidos = [
      { id: 1, status: "recebido" },
      { id: 2, status: "entregue" },
      { id: 3, status: "recebido" },
      { id: 4, status: "cancelado" },
    ];
    const grupos = agruparPorStatus(pedidos);
    expect(grupos.map((g) => g.status)).toEqual(["recebido", "entregue", "cancelado"]);
    expect(grupos[0].pedidos).toHaveLength(2);
    expect(grupos[0].label).toBe("Novo pedido");
  });
  it("trata status ausente como recebido", () => {
    const grupos = agruparPorStatus([{ id: 1 }]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].status).toBe("recebido");
  });
  it("lida com entrada inválida", () => {
    expect(agruparPorStatus(null)).toEqual([]);
    expect(agruparPorStatus(undefined)).toEqual([]);
  });
  it("respeita a ordem canônica do fluxo", () => {
    expect(STATUS_FLUXO).toEqual(["recebido", "em_preparo", "saiu_entrega", "entregue"]);
  });
});

describe("resumoEndereco", () => {
  it("junta as partes existentes com separador", () => {
    expect(
      resumoEndereco({ endereco: "Rua A, 10", complemento_endereco: "ap 2", bairro: "Centro" }),
    ).toBe("Rua A, 10 · ap 2 · Centro");
  });
  it("pula pedaços vazios", () => {
    expect(resumoEndereco({ endereco: "Rua A, 10", complemento_endereco: "", bairro: "Centro" })).toBe(
      "Rua A, 10 · Centro",
    );
  });
  it("é seguro com pedido nulo", () => {
    expect(resumoEndereco(null)).toBe("");
  });
});

describe("apenasDigitosTelefone", () => {
  it("remove tudo que não é dígito", () => {
    expect(apenasDigitosTelefone("(11) 91234-5678")).toBe("11912345678");
    expect(apenasDigitosTelefone(null)).toBe("");
  });
});

describe("formatarTelefone", () => {
  it("formata celular (11 dígitos)", () => {
    expect(formatarTelefone("11912345678")).toBe("(11) 91234-5678");
  });
  it("formata fixo (10 dígitos)", () => {
    expect(formatarTelefone("1112345678")).toBe("(11) 1234-5678");
  });
  it("devolve o original quando não casa", () => {
    expect(formatarTelefone("123")).toBe("123");
    expect(formatarTelefone(null)).toBe("");
  });
});

describe("linkWhatsApp", () => {
  it("monta wa.me com DDI 55", () => {
    expect(linkWhatsApp("11912345678")).toBe("https://wa.me/5511912345678");
  });
  it("anexa texto quando dado", () => {
    expect(linkWhatsApp("11912345678", "Olá!")).toBe(
      "https://wa.me/5511912345678?text=Ol%C3%A1!",
    );
  });
  it("não duplica DDI quando o número já tem 12+ dígitos", () => {
    expect(linkWhatsApp("5511912345678")).toBe("https://wa.me/5511912345678");
  });
  it("retorna null sem telefone utilizável", () => {
    expect(linkWhatsApp("123")).toBeNull();
    expect(linkWhatsApp(null)).toBeNull();
  });
});

describe("formatarFormaPagamento", () => {
  it("traduz as formas conhecidas", () => {
    expect(formatarFormaPagamento("dinheiro")).toBe("Dinheiro");
    expect(formatarFormaPagamento("pix")).toBe("Pix");
    expect(formatarFormaPagamento("cartao")).toBe("Cartão na entrega");
    expect(formatarFormaPagamento("outro")).toBe("—");
  });
});

describe("resumoPagamento", () => {
  it("mostra troco só no dinheiro", () => {
    expect(resumoPagamento({ forma_pagamento: "dinheiro", troco_para: 50 }).replace(/\s/g, " ")).toBe(
      "Dinheiro · troco p/ R$ 50,00",
    );
    expect(resumoPagamento({ forma_pagamento: "dinheiro", troco_para: 0 })).toBe("Dinheiro");
  });
  it("lembra maquininha só no cartão", () => {
    expect(resumoPagamento({ forma_pagamento: "cartao", levar_maquininha: true })).toBe(
      "Cartão na entrega · levar maquininha",
    );
    expect(resumoPagamento({ forma_pagamento: "cartao", levar_maquininha: false })).toBe(
      "Cartão na entrega",
    );
  });
  it("pix é só a forma", () => {
    expect(resumoPagamento({ forma_pagamento: "pix" })).toBe("Pix");
  });
  it("é seguro com pedido nulo", () => {
    expect(resumoPagamento(null)).toBe("—");
  });
});

describe("formatarReais", () => {
  it("formata como moeda BRL", () => {
    expect(formatarReais(50).replace(/ /g, " ")).toBe("R$ 50,00");
    expect(formatarReais(1234.5).replace(/ /g, " ")).toBe("R$ 1.234,50");
  });
  it("trata inválido como zero", () => {
    expect(formatarReais(null).replace(/ /g, " ")).toBe("R$ 0,00");
    expect(formatarReais("abc").replace(/ /g, " ")).toBe("R$ 0,00");
  });
});

describe("tempoDecorrido", () => {
  const base = new Date("2026-07-20T12:00:00Z");
  it("mostra 'agora' para menos de 1 min", () => {
    expect(tempoDecorrido("2026-07-20T11:59:30Z", base)).toBe("agora");
  });
  it("mostra minutos", () => {
    expect(tempoDecorrido("2026-07-20T11:45:00Z", base)).toBe("15 min");
  });
  it("mostra horas", () => {
    expect(tempoDecorrido("2026-07-20T09:00:00Z", base)).toBe("3 h");
  });
  it("mostra dias", () => {
    expect(tempoDecorrido("2026-07-18T12:00:00Z", base)).toBe("2 d");
  });
  it("é seguro com entradas inválidas", () => {
    expect(tempoDecorrido(null, base)).toBe("");
    expect(tempoDecorrido("não-é-data", base)).toBe("");
  });
  it("trata data futura como 'agora'", () => {
    expect(tempoDecorrido("2026-07-20T12:05:00Z", base)).toBe("agora");
  });
});

describe("atualizarStatusPedido (DL2)", () => {
  beforeEach(() => {
    supabase.reset();
  });

  it("some com o pedido, id/status ausentes: nem chama o banco", async () => {
    const { data, error } = await atualizarStatusPedido(null, "em_preparo");
    expect(error).toBeTruthy();
    expect(data).toBeNull();
  });

  it("propaga erro explícito do Supabase", async () => {
    supabase.setTableError("delivery_pedidos", { message: "falhou" });
    const { data, error } = await atualizarStatusPedido("p1", "em_preparo");
    expect(error).toBeTruthy();
    expect(data).toBeNull();
  });

  it("DL2 — UPDATE que não bate em nenhuma linha (RLS/id inexistente) vira erro, não sucesso falso", async () => {
    // supabase-js não lança aqui: sem `error`, mas `data: null` porque
    // maybeSingle() não achou a linha (outro tenant ou id apagado).
    supabase.setTableResult("delivery_pedidos", { data: null, error: null });
    const { data, error } = await atualizarStatusPedido("p1", "em_preparo");
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it("sucesso real: retorna o pedido atualizado sem erro", async () => {
    supabase.setTableResult("delivery_pedidos", {
      data: { id: "p1", numero: 7, status: "em_preparo" },
      error: null,
    });
    const { data, error } = await atualizarStatusPedido("p1", "em_preparo");
    expect(error).toBeNull();
    expect(data).toEqual({ id: "p1", numero: 7, status: "em_preparo" });
  });
});
