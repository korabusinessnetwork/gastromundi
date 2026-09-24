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
  ehComandaDeDelivery,
  comandasDoSalao,
  mensagemPedidoAceito,
  linkConfirmacaoWhatsApp,
  apenasDigitosTelefone,
  formatarTelefone,
  linkWhatsApp,
  formatarFormaPagamento,
  resumoPagamento,
  formatarReais,
  tempoDecorrido,
  atualizarStatusPedido,
  listarItensParaMensagem,
  mensagemPedidoEmRota,
  mensagemDoStatus,
  linkWhatsAppDoPedido,
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
  it("fecha com a cidade — bairro de nome comum não diz de qual cidade é", () => {
    expect(
      resumoEndereco({
        endereco: "Rua A, 10",
        complemento_endereco: "ap 2",
        bairro: "Centro",
        cidade: "Porto Alegre/RS",
      }),
    ).toBe("Rua A, 10 · ap 2 · Centro · Porto Alegre/RS");
  });
  it("pedido antigo, sem cidade, sai como sempre saiu", () => {
    expect(resumoEndereco({ endereco: "Rua A, 10", bairro: "Centro" })).toBe(
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
    expect(formatarReais(50).replace(/\u00A0/g, " ")).toBe("R$ 50,00");
    expect(formatarReais(1234.5).replace(/\u00A0/g, " ")).toBe("R$ 1.234,50");
  });
  it("trata inválido como zero", () => {
    expect(formatarReais(null).replace(/\u00A0/g, " ")).toBe("R$ 0,00");
    expect(formatarReais("abc").replace(/\u00A0/g, " ")).toBe("R$ 0,00");
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

// ══════════════════════════════════════════════════════════════════
// O pedido de delivery não é comanda do salão.
//
// O espelho em `pending` aparecia na lista de comandas do PDV como
// qualquer mesa — e ninguém vai servir aquela comanda. Ele continua
// existindo porque é o que a COZINHA lê e a impressora imprime; só
// deixou de aparecer onde não havia o que fazer com ele.
// ══════════════════════════════════════════════════════════════════
describe("separar o delivery das comandas do salão", () => {
  const mesa = { id: "c1", comanda: "5", created_by: "joao" };
  const delivery = { id: "dlv_x", comanda: "Delivery 260930-001", created_by: "delivery" };

  it("reconhece o espelho pelo carimbo que a RPC pública põe", () => {
    expect(ehComandaDeDelivery(delivery)).toBe(true);
    expect(ehComandaDeDelivery(mesa)).toBe(false);
  });

  it("é seguro com lixo", () => {
    expect(ehComandaDeDelivery(null)).toBe(false);
    expect(ehComandaDeDelivery({})).toBe(false);
  });

  it("a lista do salão fica só com as comandas de verdade", () => {
    expect(comandasDoSalao([mesa, delivery, { ...mesa, id: "c2" }]).map((c) => c.id)).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("lista vazia ou ausente não quebra", () => {
    expect(comandasDoSalao([])).toEqual([]);
    expect(comandasDoSalao(null)).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════
// A confirmação que sai no aceite.
//
// O cliente já viu "Pedido enviado!" na tela dele. O que ele ainda não
// sabe é se a loja VIU e vai fazer — é a angústia dos primeiros minutos,
// e é isso que a mensagem responde.
// ══════════════════════════════════════════════════════════════════
describe("mensagemPedidoAceito", () => {
  const pedido = {
    numero: "260930-001",
    cliente_nome: "Ana Paula Souza",
    cliente_telefone: "11912345678",
    total: 32.5,
    forma_pagamento: "pix",
    tipo_entrega: "entrega",
  };

  it("diz o essencial: que foi recebido, o número, o total e como paga", () => {
    const msg = mensagemPedidoAceito(pedido, { nome: "GastroMundi", tempoPreparo: 40 });

    expect(msg).toContain("260930-001");
    expect(msg).toContain("GastroMundi");
    expect(msg).toContain(formatarReais(32.5));
    expect(msg).toContain("Pix");
    expect(msg).toContain("40 min");
  });

  it("chama a pessoa pelo primeiro nome — não pelo nome inteiro do cadastro", () => {
    expect(mensagemPedidoAceito(pedido)).toContain("Oi, Ana!");
    expect(mensagemPedidoAceito(pedido)).not.toContain("Ana Paula Souza");
  });

  it("sem nome do cliente, cumprimenta assim mesmo (não sai 'Oi, undefined')", () => {
    const msg = mensagemPedidoAceito({ ...pedido, cliente_nome: "" });

    expect(msg.startsWith("Oi!")).toBe(true);
    expect(msg).not.toContain("undefined");
  });

  it("na retirada, promete retirar — e não que alguém vai levar", () => {
    const msg = mensagemPedidoAceito(
      { ...pedido, tipo_entrega: "retirada" },
      { tempoPreparo: 30 },
    );

    expect(msg).toContain("pronto para retirar");
    expect(msg).toContain("retirada no local");
    expect(msg).not.toContain("Deve chegar");
  });

  it("avisa o troco quando o cliente pediu troco", () => {
    const msg = mensagemPedidoAceito({
      ...pedido,
      forma_pagamento: "dinheiro",
      troco_para: 50,
    });

    // Sem esta linha o entregador sai sem saber, e a confirmação promete
    // menos do que o pedido combinou.
    expect(msg).toContain(`troco para ${formatarReais(50)}`);
  });

  it("sem tempo de preparo configurado, não promete prazo nenhum", () => {
    const msg = mensagemPedidoAceito(pedido, { nome: "GastroMundi" });

    expect(msg).not.toContain("min");
  });
});

describe("linkConfirmacaoWhatsApp", () => {
  it("monta o link com DDI e a mensagem escrita", () => {
    const link = linkConfirmacaoWhatsApp(
      { numero: "1", cliente_telefone: "11912345678", total: 10, forma_pagamento: "pix" },
      { nome: "Loja" },
    );

    expect(link.startsWith("https://wa.me/5511912345678?text=")).toBe(true);
    expect(decodeURIComponent(link)).toContain("Loja");
  });

  it("sem telefone utilizável devolve null — o botão some em vez de abrir aba morta", () => {
    expect(linkConfirmacaoWhatsApp({ numero: "1", cliente_telefone: "" })).toBeNull();
    expect(linkConfirmacaoWhatsApp({ numero: "1", cliente_telefone: "123" })).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// As mensagens de WhatsApp — o que o cliente recebe ao clicar no botão.
//
// Nada disto usa API paga: `linkWhatsApp` monta um link wa.me com o texto
// pronto, e quem envia é a pessoa, no aparelho dela. O que os testes
// prendem é o CONTEÚDO, porque mensagem errada aqui vira ligação para a
// loja — que é justamente o que ela existe para evitar.
// ══════════════════════════════════════════════════════════════════
describe("listarItensParaMensagem", () => {
  it("põe a quantidade na frente do nome", () => {
    expect(listarItensParaMensagem([{ nome: "Pizza Calabresa", qtd: 2 }]))
      .toEqual(["• 2× Pizza Calabresa"]);
  });

  it("qtd ausente ou quebrada vira 1, não zero nem NaN", () => {
    expect(listarItensParaMensagem([{ nome: "Coca" }])[0]).toBe("• 1× Coca");
    expect(listarItensParaMensagem([{ nome: "Coca", qtd: "x" }])[0]).toBe("• 1× Coca");
  });

  it("os complementos escolhidos vão abaixo do item", () => {
    const [linha] = listarItensParaMensagem([
      { nome: "X-Burguer", qtd: 1, complementos: [{ nome: "Bacon" }, { nome: "Cheddar" }] },
    ]);
    expect(linha).toContain("Bacon, Cheddar");
  });

  it("aceita complemento que já veio como texto", () => {
    const [linha] = listarItensParaMensagem([
      { nome: "Pizza", qtd: 1, complementos: ["Calabresa", "Portuguesa"] },
    ]);
    expect(linha).toContain("Calabresa, Portuguesa");
  });

  it("a observação entra — é o 'sem cebola' que o cliente quer ver confirmado", () => {
    const [linha] = listarItensParaMensagem([
      { nome: "X-Salada", qtd: 1, obs: "sem cebola" },
    ]);
    expect(linha).toContain("sem cebola");
  });

  it("item sem nome não vira linha fantasma", () => {
    expect(listarItensParaMensagem([{ qtd: 2 }, { nome: "  " }, null])).toEqual([]);
    expect(listarItensParaMensagem(null)).toEqual([]);
  });
});

describe("mensagemPedidoAceito — o que o cliente confere", () => {
  const pedido = {
    numero: "260915-004",
    cliente_nome: "Ana Paula",
    total: 68,
    forma_pagamento: "dinheiro",
    troco_para: 100,
    tipo_entrega: "entrega",
    endereco: "Rua das Flores, 100",
    bairro: "Centro",
    cidade: "Porto Alegre/RS",
  };
  const itens = [{ nome: "Pizza Grande", qtd: 1, complementos: [{ nome: "Calabresa" }] }];

  it("lista o que foi pedido", () => {
    const msg = mensagemPedidoAceito(pedido, { nome: "GastroMundi" }, itens);
    expect(msg).toContain("1× Pizza Grande");
    expect(msg).toContain("Calabresa");
  });

  it("devolve o endereço para o cliente CONFERIR", () => {
    // Entrega errada quase nunca é o entregador que se perdeu: é o número
    // que saiu torto no formulário e que ninguém mais olhou.
    const msg = mensagemPedidoAceito(pedido, {}, itens);
    expect(msg).toContain("Rua das Flores, 100");
    expect(msg).toContain("Centro");
    expect(msg).toMatch(/responder aqui/i);
  });

  it("na retirada não promete entrega nem manda endereço do cliente", () => {
    const msg = mensagemPedidoAceito({ ...pedido, tipo_entrega: "retirada" }, {}, itens);
    expect(msg).toMatch(/retirada no local/i);
    expect(msg).not.toContain("Rua das Flores");
  });

  it("sem itens carregados a mensagem sai mesmo assim", () => {
    // O cartão fechado ainda não buscou os itens. Melhor a confirmação sem
    // a lista do que confirmação nenhuma.
    const msg = mensagemPedidoAceito(pedido, { nome: "GastroMundi" }, []);
    expect(msg).toContain("260915-004");
    expect(msg).not.toContain("Seu pedido:");
  });

  it("continua dizendo o total e o troco", () => {
    const msg = mensagemPedidoAceito(pedido, {}, itens);
    expect(msg).toContain("R$ 68,00");
    expect(msg).toContain("R$ 100,00");
  });
});

describe("mensagemPedidoEmRota", () => {
  const pedido = {
    numero: "260915-004",
    cliente_nome: "Ana Paula",
    total: 68,
    forma_pagamento: "dinheiro",
    troco_para: 100,
    endereco: "Rua das Flores, 100",
    bairro: "Centro",
  };

  it("diz que saiu, com o número do pedido", () => {
    const msg = mensagemPedidoEmRota(pedido, { nome: "GastroMundi" });
    expect(msg).toMatch(/saiu para entrega/i);
    expect(msg).toContain("260915-004");
  });

  it("diz quem está levando, quando há entregador", () => {
    const msg = mensagemPedidoEmRota(pedido, { entregador: "Carlos" });
    expect(msg).toContain("Carlos");
  });

  it("sem entregador atribuído não inventa nome", () => {
    const msg = mensagemPedidoEmRota(pedido, {});
    expect(msg).toMatch(/saiu para entrega\./i);
  });

  it("avisa quanto separar e o troco — cliente que procura a carteira segura o entregador", () => {
    const msg = mensagemPedidoEmRota(pedido, {});
    expect(msg).toContain("R$ 68,00");
    expect(msg).toContain("dinheiro");
    expect(msg).toContain("R$ 100,00");
  });

  it("leva o endereço: é a última chance de dizer que o número está errado", () => {
    expect(mensagemPedidoEmRota(pedido, {})).toContain("Rua das Flores, 100");
  });
});

describe("mensagemDoStatus — um botão, o texto do momento", () => {
  const base = { numero: "1", cliente_nome: "Ana", total: 10, endereco: "Rua X, 1" };

  it("em preparo manda a confirmação", () => {
    expect(mensagemDoStatus({ ...base, status: "em_preparo" }, {}, []))
      .toMatch(/Recebemos seu pedido/);
  });

  it("recebido também manda a confirmação", () => {
    expect(mensagemDoStatus({ ...base, status: "recebido" }, {}, []))
      .toMatch(/Recebemos seu pedido/);
  });

  it("saiu para entrega manda a de rota, não a de recebido", () => {
    // Mandar "recebemos seu pedido" para quem já está esperando na porta é
    // pior que não mandar nada.
    const msg = mensagemDoStatus({ ...base, status: "saiu_entrega" }, {}, []);
    expect(msg).toMatch(/saiu para entrega/i);
    expect(msg).not.toMatch(/Recebemos seu pedido/);
  });

  it("status sem mensagem própria abre a conversa sem anunciar nada", () => {
    for (const status of ["entregue", "cancelado"]) {
      expect(mensagemDoStatus({ ...base, status }, {}, [])).toMatch(/sobre o seu pedido/i);
    }
  });
});

describe("linkWhatsAppDoPedido", () => {
  it("monta o link wa.me com o texto do momento — sem API, sem custo", () => {
    const link = linkWhatsAppDoPedido(
      { numero: "7", status: "saiu_entrega", cliente_telefone: "51986557795", cliente_nome: "Ana" },
      {},
      [],
    );
    expect(link).toMatch(/^https:\/\/wa\.me\/5551986557795\?text=/);
    expect(decodeURIComponent(link)).toMatch(/saiu para entrega/i);
  });

  it("sem telefone não há link — o botão some em vez de abrir aba morta", () => {
    expect(linkWhatsAppDoPedido({ numero: "7", status: "em_preparo" }, {}, [])).toBeNull();
  });
});
