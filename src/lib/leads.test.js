import { describe, it, expect, vi, beforeEach } from "vitest";

// leads.js importa ./supabase (que exige VITE_* no import) e conversa com
// o banco por RPC. Mockamos o módulo inteiro: aqui se testa a regra, não a
// rede — mesmo padrão de console.test.js.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { supabase } from "./supabase";
import {
  ORIGEM_PADRAO,
  linkDoLead,
  listarLeads,
  marcarLeadAtendido,
  mascararWhatsapp,
  mensagemDeContatoDoLead,
  montarLinkWhatsapp,
  registrarLead,
  resumirLeads,
  rotularItemDoPlano,
  somenteDigitos,
  validarLead,
} from "./leads";

beforeEach(() => {
  supabase.reset();
  vi.clearAllMocks();
});

const PLANO = {
  total: 189,
  modulos: [{ codigo: "mesas", nome: "Mesas e comandas" }],
  addons: [{ codigo: "estoque", nome: "Estoque" }],
};

describe("somenteDigitos", () => {
  it("tira tudo que não é número", () => {
    expect(somenteDigitos("(11) 98765-4321")).toBe("11987654321");
  });

  it("aguenta nulo e indefinido sem quebrar", () => {
    expect(somenteDigitos(null)).toBe("");
    expect(somenteDigitos(undefined)).toBe("");
  });
});

describe("mascararWhatsapp", () => {
  it("formata no padrão brasileiro conforme a pessoa digita", () => {
    expect(mascararWhatsapp("1")).toBe("(1");
    expect(mascararWhatsapp("11")).toBe("(11");
    expect(mascararWhatsapp("1198")).toBe("(11) 98");
    expect(mascararWhatsapp("1198765432")).toBe("(11) 9876-5432");
    expect(mascararWhatsapp("11987654321")).toBe("(11) 98765-4321");
  });

  it("para de aceitar no 11º dígito — número BR não passa disso", () => {
    expect(mascararWhatsapp("119876543219999")).toBe("(11) 98765-4321");
  });

  it("apagar tudo esvazia o campo (o parêntese não fica preso)", () => {
    expect(mascararWhatsapp("")).toBe("");
    expect(mascararWhatsapp("(")).toBe("");
    expect(mascararWhatsapp(null)).toBe("");
  });

  it("é idempotente: remascarar o já mascarado não muda nada", () => {
    const uma = mascararWhatsapp("11987654321");
    expect(mascararWhatsapp(uma)).toBe(uma);
  });
});

describe("validarLead", () => {
  const ok = {
    nome: "Ana Souza",
    whatsapp: "(11) 98765-4321",
    email: "ana@bar.com.br",
    consentimento: true,
  };

  it("aprova o preenchimento completo", () => {
    expect(validarLead(ok)).toEqual({ ok: true, erros: {} });
  });

  it("aceita fixo com DDD (10 dígitos)", () => {
    expect(validarLead({ ...ok, whatsapp: "(11) 3456-7890" }).ok).toBe(true);
  });

  it("cobra o nome quando vem vazio ou curto demais", () => {
    expect(validarLead({ ...ok, nome: " " }).erros.nome).toBe(
      "Diga como podemos te chamar."
    );
    expect(validarLead({ ...ok, nome: "A" }).erros.nome).toBeTruthy();
  });

  it("cobra o WhatsApp com DDD", () => {
    expect(validarLead({ ...ok, whatsapp: "98765432" }).erros.whatsapp).toBe(
      "Informe um WhatsApp com DDD."
    );
    expect(validarLead({ ...ok, whatsapp: "" }).erros.whatsapp).toBeTruthy();
  });

  it("recusa e-mail sem arroba, sem domínio ou com espaço", () => {
    for (const email of ["ana", "ana@", "ana@bar", "a na@bar.com", "@bar.com"]) {
      expect(validarLead({ ...ok, email }).erros.email).toBe(
        "Confira o e-mail digitado."
      );
    }
  });

  it("aceita domínio com vários pontos", () => {
    expect(validarLead({ ...ok, email: "ana@x.com.br" }).ok).toBe(true);
  });

  it("sem aceite marcado não passa — é a regra da LGPD, não letra miúda", () => {
    expect(validarLead({ ...ok, consentimento: false }).erros.consentimento).toBe(
      "Precisamos do seu aceite para guardar o contato."
    );
    expect(validarLead({ ...ok, consentimento: undefined }).ok).toBe(false);
    // "true" (texto) não é aceite: só o booleano marcado vale.
    expect(validarLead({ ...ok, consentimento: "true" }).ok).toBe(false);
  });

  it("chamada sem nada devolve todos os erros de uma vez", () => {
    const { ok: passou, erros } = validarLead();
    expect(passou).toBe(false);
    expect(Object.keys(erros).sort()).toEqual([
      "consentimento",
      "email",
      "nome",
      "whatsapp",
    ]);
  });
});

describe("mensagemDeContatoDoLead", () => {
  it("usa o primeiro nome e lista o plano montado", () => {
    const texto = mensagemDeContatoDoLead({ nome: "Ana Souza", plano: PLANO });
    expect(texto).toContain("Aqui é Ana");
    expect(texto).toContain("Módulos: Mesas e comandas.");
    expect(texto).toContain("Adicionais: Estoque.");
    expect(texto).toContain("R$ 189/mês");
  });

  it("sem nome e sem plano ainda diz a que veio", () => {
    const texto = mensagemDeContatoDoLead();
    expect(texto).toBe("Oi! Quero agendar a demonstração do KORA.");
  });

  it("não inventa linha de módulo quando a lista está vazia", () => {
    const texto = mensagemDeContatoDoLead({
      nome: "Ana",
      plano: { total: 149, modulos: [], addons: [] },
    });
    expect(texto).not.toContain("Módulos:");
    expect(texto).not.toContain("Adicionais:");
    expect(texto).toContain("R$ 149/mês");
  });
});

describe("montarLinkWhatsapp", () => {
  it("sem número configurado devolve null — a tela não mostra botão morto", () => {
    expect(montarLinkWhatsapp("", "oi")).toBeNull();
    expect(montarLinkWhatsapp(null, "oi")).toBeNull();
    expect(montarLinkWhatsapp("   ", "oi")).toBeNull();
  });

  it("anexa o texto codificado", () => {
    expect(montarLinkWhatsapp("https://wa.me/5511999999999", "oi tudo bem")).toBe(
      "https://wa.me/5511999999999?text=oi%20tudo%20bem"
    );
  });

  it("respeita query string que já existe na URL", () => {
    expect(montarLinkWhatsapp("https://wa.me/551199?x=1", "oi")).toBe(
      "https://wa.me/551199?x=1&text=oi"
    );
  });

  it("sem texto devolve o link puro", () => {
    expect(montarLinkWhatsapp("https://wa.me/551199", "")).toBe(
      "https://wa.me/551199"
    );
  });
});

describe("registrarLead", () => {
  const valido = {
    nome: "  Ana Souza ",
    whatsapp: "(11) 98765-4321",
    email: " ANA@Bar.com.br ",
    consentimento: true,
    plano: PLANO,
  };

  it("não chega no banco se a validação reprovar", async () => {
    const { data, error } = await registrarLead({ ...valido, consentimento: false });
    expect(data).toBeNull();
    expect(error.message).toBe("Precisamos do seu aceite para guardar o contato.");
    expect(error.campos.consentimento).toBeTruthy();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("grava pela RPC, com os dados limpos e o plano em centavos", async () => {
    supabase.setRpcResult("registrar_lead", {
      data: "11111111-1111-1111-1111-111111111111",
      error: null,
    });

    const { data, error } = await registrarLead(valido);

    expect(error).toBeNull();
    expect(data).toBe("11111111-1111-1111-1111-111111111111");
    expect(supabase.rpc).toHaveBeenCalledWith("registrar_lead", {
      p_nome: "Ana Souza",
      p_whatsapp: "11987654321",
      p_email: "ana@bar.com.br",
      p_consentimento: true,
      p_origem: ORIGEM_PADRAO,
      p_plano_total_centavos: 18900,
      p_plano_modulos: ["mesas"],
      p_plano_addons: ["estoque"],
    });
  });

  it("sem plano montado manda null no total e listas vazias", async () => {
    await registrarLead({ ...valido, plano: undefined });
    const [, args] = supabase.rpc.mock.calls[0];
    expect(args.p_plano_total_centavos).toBeNull();
    expect(args.p_plano_modulos).toEqual([]);
    expect(args.p_plano_addons).toEqual([]);
  });

  it("erro do banco volta como { error } — nada de exceção solta", async () => {
    supabase.setRpcError("registrar_lead", { message: "permission denied" });
    const { data, error } = await registrarLead(valido);
    expect(data).toBeNull();
    expect(error.message).toBe("permission denied");
  });

  it("queda de rede também volta como { error }", async () => {
    supabase.rpc.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    const { data, error } = await registrarLead(valido);
    expect(data).toBeNull();
    expect(error.message).toBe("offline");
  });
});

describe("listarLeads", () => {
  it("pede colunas nomeadas, mais novo primeiro", async () => {
    supabase.setTableResult("leads", { data: [{ id: "a" }], error: null });

    const { data, error } = await listarLeads();

    expect(error).toBeNull();
    expect(data).toEqual([{ id: "a" }]);
    expect(supabase.from).toHaveBeenCalledWith("leads");

    const select = supabase.calls.find((c) => c.method === "select");
    // Dado pessoal não sai em select *.
    expect(select.args[0]).not.toContain("*");
    expect(select.args[0]).toContain("nome");
    expect(select.args[0]).toContain("whatsapp");

    const order = supabase.calls.find((c) => c.method === "order");
    expect(order.args).toEqual(["created_at", { ascending: false }]);
    expect(supabase.calls.find((c) => c.method === "limit").args).toEqual([200]);
  });

  it("aceita outro limite", async () => {
    await listarLeads({ limite: 10 });
    expect(supabase.calls.find((c) => c.method === "limit").args).toEqual([10]);
  });

  it("erro devolve lista vazia — a tela renderiza o estado de erro, não quebra", async () => {
    supabase.setTableError("leads", { message: "falhou" });
    const { data, error } = await listarLeads();
    expect(data).toEqual([]);
    expect(error.message).toBe("falhou");
  });
});

describe("marcarLeadAtendido", () => {
  it("sem id não chama o banco", async () => {
    const { error } = await marcarLeadAtendido(null, true);
    expect(error.message).toBe("Lead não informado.");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("manda id, estado e quem fez", async () => {
    const { data, error } = await marcarLeadAtendido("abc", true, "Matheus");
    expect(error).toBeNull();
    expect(data).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("marcar_lead_atendido", {
      p_lead_id: "abc",
      p_atendido: true,
      p_por: "Matheus",
    });
  });

  it("reabrir manda false e limpa quem fez", async () => {
    await marcarLeadAtendido("abc", false);
    expect(supabase.rpc).toHaveBeenCalledWith("marcar_lead_atendido", {
      p_lead_id: "abc",
      p_atendido: false,
      p_por: null,
    });
  });

  it("erro do banco volta como { error }", async () => {
    supabase.setRpcError("marcar_lead_atendido", { message: "não autorizado" });
    const { data, error } = await marcarLeadAtendido("abc", true);
    expect(data).toBeNull();
    expect(error.message).toBe("não autorizado");
  });
});

describe("resumirLeads", () => {
  const agora = new Date("2026-08-22T12:00:00Z");
  const dias = (n) => new Date(agora.getTime() - n * 86400000).toISOString();

  it("conta total, pendentes e os dos últimos 7 dias", () => {
    const leads = [
      { created_at: dias(0), atendido_em: null },
      { created_at: dias(3), atendido_em: dias(2) },
      { created_at: dias(6), atendido_em: null },
      { created_at: dias(30), atendido_em: null },
    ];
    expect(resumirLeads(leads, agora)).toEqual({
      total: 4,
      pendentes: 3,
      recentes: 3,
    });
  });

  it("lista vazia zera tudo", () => {
    expect(resumirLeads([], agora)).toEqual({ total: 0, pendentes: 0, recentes: 0 });
    expect(resumirLeads()).toEqual({ total: 0, pendentes: 0, recentes: 0 });
  });

  it("data inválida não conta como recente, mas o lead continua no total", () => {
    const r = resumirLeads([{ created_at: "não é data", atendido_em: null }], agora);
    expect(r).toEqual({ total: 1, pendentes: 1, recentes: 0 });
  });
});

describe("linkDoLead", () => {
  it("monta a conversa com o número que a pessoa deixou", () => {
    const link = linkDoLead({ nome: "Ana Souza", whatsapp: "(11) 98765-4321" });
    expect(link).toContain("https://wa.me/5511987654321?text=");
    expect(decodeURIComponent(link)).toContain("Oi, Ana!");
  });

  it("número incompleto não vira link", () => {
    expect(linkDoLead({ nome: "Ana", whatsapp: "119876" })).toBeNull();
    expect(linkDoLead({})).toBeNull();
    expect(linkDoLead()).toBeNull();
  });

  it("sem nome usa a saudação genérica", () => {
    const link = linkDoLead({ whatsapp: "11987654321" });
    expect(decodeURIComponent(link)).toContain("Oi! Aqui é da KORA");
  });
});

describe("rotularItemDoPlano", () => {
  it("traduz o código para o nome que o dono lê", () => {
    expect(rotularItemDoPlano("jarvas")).toBe("JARVAS (IA)");
    expect(rotularItemDoPlano("nfe")).toBe("Nota fiscal");
  });

  it("código novo aparece como veio — item no catálogo não quebra a tela", () => {
    expect(rotularItemDoPlano("modulo_novo")).toBe("modulo_novo");
    expect(rotularItemDoPlano(null)).toBe("");
  });
});
