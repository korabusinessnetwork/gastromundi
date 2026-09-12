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
  transicaoValida,
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
  inicioDoDiaISO,
  inicioDoRecorteISO,
  listarPedidosDelivery,
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

describe("transicaoValida (N3, espelha o trigger 20260815)", () => {
  it("avança um passo no fluxo", () => {
    expect(transicaoValida("recebido", "em_preparo")).toBe(true);
    expect(transicaoValida("em_preparo", "saiu_entrega")).toBe(true);
    expect(transicaoValida("saiu_entrega", "entregue")).toBe(true);
  });
  it("permite cancelar de qualquer não-terminal", () => {
    expect(transicaoValida("recebido", "cancelado")).toBe(true);
    expect(transicaoValida("em_preparo", "cancelado")).toBe(true);
    expect(transicaoValida("saiu_entrega", "cancelado")).toBe(true);
  });
  it("NÃO ressuscita terminal (entregue/cancelado não mudam)", () => {
    expect(transicaoValida("entregue", "em_preparo")).toBe(false);
    expect(transicaoValida("entregue", "cancelado")).toBe(false);
    expect(transicaoValida("cancelado", "recebido")).toBe(false);
    expect(transicaoValida("cancelado", "entregue")).toBe(false);
  });
  it("NÃO pula etapa nem anda pra trás", () => {
    expect(transicaoValida("recebido", "entregue")).toBe(false);
    expect(transicaoValida("recebido", "saiu_entrega")).toBe(false);
    expect(transicaoValida("saiu_entrega", "recebido")).toBe(false);
  });
  it("mesmo → mesmo é no-op válido (edição de outros campos)", () => {
    expect(transicaoValida("recebido", "recebido")).toBe(true);
    expect(transicaoValida("entregue", "entregue")).toBe(true);
  });
  it("status ausente ou desconhecido → inválido (defensivo)", () => {
    expect(transicaoValida(null, "em_preparo")).toBe(false);
    expect(transicaoValida("recebido", "")).toBe(false);
    expect(transicaoValida("xpto", "em_preparo")).toBe(false);
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

  it("DL2, UPDATE que não bate em nenhuma linha (RLS/id inexistente) vira erro, não sucesso falso", async () => {
    // supabase-js não lança aqui: sem `error`, mas `data: null` porque
    // maybeSingle() não achou a linha (outro tenant ou id apagado).
    supabase.setTableResult("delivery_pedidos", { data: null, error: null });
    const { data, error } = await atualizarStatusPedido("p1", "em_preparo");
    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  it("N3, com `de` terminal, barra antes do banco (não ressuscita)", async () => {
    // Banco devolveria sucesso; a guarda cliente-side impede chegar lá.
    supabase.setTableResult("delivery_pedidos", {
      data: { id: "p1", status: "recebido" },
      error: null,
    });
    const { data, error } = await atualizarStatusPedido("p1", "recebido", { de: "entregue" });
    expect(error).toBeTruthy();
    expect(data).toBeNull();
  });

  it("N3, sem `de` (retrocompat), segue direto pro banco (trigger é a guarda)", async () => {
    supabase.setTableResult("delivery_pedidos", {
      data: { id: "p1", numero: 7, status: "em_preparo" },
      error: null,
    });
    const { error } = await atualizarStatusPedido("p1", "em_preparo");
    expect(error).toBeNull();
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

// D02 — antes disso listarPedidosDelivery puxava TODO pedido de delivery do
// tenant, sem limite e sem recorte de data, a cada montagem e a cada evento de
// realtime. Acima do teto de linhas do PostgREST a resposta é cortada em
// silêncio e o contador da coluna passa a mentir.
describe("listarPedidosDelivery, recorte das colunas terminais (D02)", () => {
  beforeEach(() => {
    supabase.reset();
  });

  const acharOr = () => supabase.calls.find((c) => c.table === "delivery_pedidos" && c.method === "or");

  it("inicioDoDiaISO zera o relógio do dia local", () => {
    const inicio = new Date(inicioDoDiaISO(new Date(2026, 8, 12, 15, 47, 3)));
    expect(inicio.getHours()).toBe(0);
    expect(inicio.getMinutes()).toBe(0);
    expect(inicio.getSeconds()).toBe(0);
    expect(inicio.getDate()).toBe(12);
  });

  it("recorta entregue e cancelado ao dia corrente na própria consulta", async () => {
    const agora = new Date(2026, 8, 12, 15, 47, 3);
    await listarPedidosDelivery({ agora });

    const filtro = acharOr();
    expect(filtro).toBeDefined();
    const expressao = String(filtro.args[0]);
    expect(expressao).toContain("entregue");
    expect(expressao).toContain(STATUS_CANCELADO);
    expect(expressao).toContain(`created_at.gte.${inicioDoDiaISO(agora)}`);
  });

  it("não terminal continua sempre visível: o recorte de data é alternativa, não condição", async () => {
    await listarPedidosDelivery({ agora: new Date(2026, 8, 12, 15, 47, 3) });

    const expressao = String(acharOr().args[0]);
    // `or` = qualquer uma das duas basta, então pedido em andamento antigo
    // entra pelo lado do status, sem depender da data.
    expect(expressao).toMatch(/status\.not\.in\./);
    expect(expressao.split(",created_at.gte.")).toHaveLength(2);
  });

  it("erro do Supabase vira data vazia com o erro, sem lançar", async () => {
    supabase.setTableError("delivery_pedidos", { message: "falhou" });
    const { data, error } = await listarPedidosDelivery();
    expect(data).toEqual([]);
    expect(error).toBeTruthy();
  });
});

// D06 — o recorte do D02 era pelo início do DIA DO CALENDÁRIO, e o delivery
// atravessa a meia-noite: o pedido entregue às 23h50 desaparecia da coluna
// "Entregue" na primeira busca depois da meia-noite (e as buscas acontecem
// sozinhas, a cada avançar, cancelar ou pedido novo). O operador via a coluna
// esvaziar e o contador cair a zero com o entregador ainda na rua. O corte
// passa a ser a abertura do caixa, que é o turno de verdade.
describe("listarPedidosDelivery, recorte pelo TURNO e não pelo dia (D06)", () => {
  beforeEach(() => {
    supabase.reset();
  });

  const acharOr = () => supabase.calls.find((c) => c.table === "delivery_pedidos" && c.method === "or");

  // Caixa aberto às 18h de ontem, agora é 00h30 de hoje: o turno é o mesmo.
  const ABERTURA = new Date(2026, 8, 11, 18, 0, 0);
  const MADRUGADA = new Date(2026, 8, 12, 0, 30, 0);

  it("corta pela abertura do caixa quando há sessão", () => {
    expect(inicioDoRecorteISO({ sessaoAbertaEm: ABERTURA.toISOString(), agora: MADRUGADA }))
      .toBe(ABERTURA.toISOString());
  });

  it("o pedido entregue às 23h50 continua dentro do recorte depois da meia-noite", () => {
    const entregue = new Date(2026, 8, 11, 23, 50, 0);
    const corte = new Date(inicioDoRecorteISO({ sessaoAbertaEm: ABERTURA.toISOString(), agora: MADRUGADA }));
    expect(entregue.getTime()).toBeGreaterThanOrEqual(corte.getTime());
    // Era aqui que o furo aparecia: o início do dia já é DEPOIS da entrega.
    expect(entregue.getTime()).toBeLessThan(new Date(inicioDoDiaISO(MADRUGADA)).getTime());
  });

  it("sem sessão, cai no início do dia (delivery standalone, sem caixa)", () => {
    const agora = new Date(2026, 8, 12, 15, 47, 3);
    expect(inicioDoRecorteISO({ sessaoAbertaEm: null, agora })).toBe(inicioDoDiaISO(agora));
    expect(inicioDoRecorteISO({ sessaoAbertaEm: "", agora })).toBe(inicioDoDiaISO(agora));
    expect(inicioDoRecorteISO({ agora })).toBe(inicioDoDiaISO(agora));
  });

  it("sessão ilegível cai no início do dia, e não numa data inválida", () => {
    const agora = new Date(2026, 8, 12, 15, 47, 3);
    // Formato brasileiro já foi gravado em config.sessao_aberta_em antes.
    expect(inicioDoRecorteISO({ sessaoAbertaEm: "31/07/2026 08:00", agora })).toBe(inicioDoDiaISO(agora));
    expect(inicioDoRecorteISO({ sessaoAbertaEm: "qualquer coisa", agora })).toBe(inicioDoDiaISO(agora));
  });

  it("caixa esquecido aberto há dias não traz a base inteira: o corte tem teto", () => {
    const agora = new Date(2026, 8, 12, 15, 0, 0);
    const abertoHaUmMes = new Date(2026, 7, 12, 18, 0, 0).toISOString();
    const corte = new Date(inicioDoRecorteISO({ sessaoAbertaEm: abertoHaUmMes, agora }));
    const horasAtras = (agora.getTime() - corte.getTime()) / 3600000;
    expect(horasAtras).toBeLessThanOrEqual(48);
    expect(horasAtras).toBeGreaterThan(24);
  });

  it("a consulta usa o corte do turno, não o do dia", async () => {
    await listarPedidosDelivery({ agora: MADRUGADA, sessaoAbertaEm: ABERTURA.toISOString() });

    const expressao = String(acharOr().args[0]);
    expect(expressao).toContain(`created_at.gte.${ABERTURA.toISOString()}`);
    expect(expressao).not.toContain(inicioDoDiaISO(MADRUGADA));
  });

  it("sem sessão a consulta segue cortando pelo dia, com a proteção intacta", async () => {
    const agora = new Date(2026, 8, 12, 15, 47, 3);
    await listarPedidosDelivery({ agora });

    const expressao = String(acharOr().args[0]);
    expect(expressao).toMatch(/status\.not\.in\./);
    expect(expressao).toContain(`created_at.gte.${inicioDoDiaISO(agora)}`);
  });
});
