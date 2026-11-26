// @vitest-environment jsdom
//
// A identidade anônima do aparelho — o que substitui o cadastro na vitrine.
//
// O que este arquivo protege:
//  1. Que o id seja um UUID de verdade. Ele é PORTADOR DE SEGREDO: quem
//     tiver o valor vê aqueles pedidos. Um id curto, sequencial ou
//     previsível transformaria "acompanhar meu pedido" em "ler o pedido
//     dos outros".
//  2. Que ele seja o MESMO entre visitas — é isso que faz o histórico
//     existir "só de voltar na página".
//  3. Que armazenamento bloqueado (aba anônima estrita, política
//     corporativa) não derrube a compra. Histórico é conveniência;
//     travar a venda por causa dele seria trocar o essencial pelo extra.
//  4. Que o que fica guardado do formulário sejam só os campos previstos
//     — nunca a taxa, nunca coordenada.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ehUuid,
  entregaLembrada,
  entregaLembravel,
  esquecerDispositivo,
  idDoDispositivo,
  lembrarEntrega,
} from "./deliveryDispositivo";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("ehUuid", () => {
  it("aceita só a forma canônica", () => {
    expect(ehUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    expect(ehUuid("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(true);
  });

  it("recusa o que não é UUID — é isso que impede um id fraco de virar segredo", () => {
    expect(ehUuid("abc")).toBe(false);
    expect(ehUuid("3f2504e04f8941d39a0c0305e82c3301")).toBe(false); // sem hífens
    expect(ehUuid("")).toBe(false);
    expect(ehUuid(null)).toBe(false);
    expect(ehUuid(123)).toBe(false);
  });
});

describe("idDoDispositivo", () => {
  it("cria um UUID na primeira visita e devolve o MESMO nas seguintes", () => {
    const primeiro = idDoDispositivo();

    expect(ehUuid(primeiro)).toBe(true);
    // Sem isto o histórico começaria vazio a cada abertura da página, que é
    // exatamente o que esta identidade existe para evitar.
    expect(idDoDispositivo()).toBe(primeiro);
  });

  it("valor estragado no armazenamento é substituído, não fica travando para sempre", () => {
    localStorage.setItem("kora.delivery.dispositivo", "isso-não-é-uuid");

    const id = idDoDispositivo();

    expect(ehUuid(id)).toBe(true);
    expect(localStorage.getItem("kora.delivery.dispositivo")).toBe(id);
  });

  it("sem crypto.randomUUID (Safari antigo), ainda sai um UUID v4 válido", () => {
    // A mesma armadilha que já derrubou o botão "Adicionar" da sacola: a
    // função não existe em contexto inseguro nem no iPhone anterior ao 15.4.
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
      throw new TypeError("não existe aqui");
    });
    // O spy acima lança se for chamado; o caminho reserva não deve chamá-lo.
    globalThis.crypto.randomUUID = undefined;

    const id = idDoDispositivo();

    expect(ehUuid(id)).toBe(true);
    expect(id[14]).toBe("4"); // versão 4
    expect(["8", "9", "a", "b"]).toContain(id[19].toLowerCase()); // variante RFC 4122
  });

  it("armazenamento bloqueado não lança — a venda não pode parar por causa do histórico", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("acesso negado");
    });

    const id = idDoDispositivo();

    expect(ehUuid(id)).toBe(true);
  });
});

describe("esquecerDispositivo", () => {
  it("apaga a identidade E os dados guardados — a saída de quem pediu no celular alheio", () => {
    const antigo = idDoDispositivo();
    lembrarEntrega({ nome: "Ana", endereco: "Rua X, 10" });

    esquecerDispositivo();

    expect(entregaLembrada()).toEqual({});
    // Um id novo entra no lugar: o próximo pedido volta a ter acompanhamento.
    expect(idDoDispositivo()).not.toBe(antigo);
  });
});

describe("os dados de entrega lembrados", () => {
  it("guarda só os campos previstos — nunca a taxa nem a coordenada", () => {
    const guardado = entregaLembravel({
      nome: "Ana",
      telefone: "51999",
      cep: "90000000",
      cidade: "Porto Alegre/RS",
      bairro: "Centro",
      endereco: "Rua X, 10",
      complemento: "ap 3",
      // O que NÃO pode sobreviver: a taxa é a resposta do servidor para um
      // endereço num momento, e reaproveitá-la mostraria o preço de ontem.
      taxa: 7.5,
      lat: -30,
      lng: -51,
      tipo: "retirada",
    });

    expect(guardado).toEqual({
      nome: "Ana",
      telefone: "51999",
      cep: "90000000",
      cidade: "Porto Alegre/RS",
      bairro: "Centro",
      endereco: "Rua X, 10",
      complemento: "ap 3",
    });
  });

  it("campo em branco não é lembrado (não vira string vazia no formulário)", () => {
    expect(entregaLembravel({ nome: "  Ana  ", bairro: "   ", cep: "" })).toEqual({ nome: "Ana" });
  });

  it("o que foi guardado volta na visita seguinte", () => {
    lembrarEntrega({ nome: "Ana", cidade: "Porto Alegre/RS", bairro: "Centro", taxa: 7.5 });

    expect(entregaLembrada()).toEqual({
      nome: "Ana",
      cidade: "Porto Alegre/RS",
      bairro: "Centro",
    });
  });

  it("armazenamento vazio ou corrompido devolve objeto vazio, não quebra o formulário", () => {
    expect(entregaLembrada()).toEqual({});
    localStorage.setItem("kora.delivery.entrega", "{isso não é json");
    expect(entregaLembrada()).toEqual({});
  });

  it("formulário sem nada digitado não grava lixo", () => {
    lembrarEntrega({ nome: "  ", taxa: 10 });
    expect(localStorage.getItem("kora.delivery.entrega")).toBeNull();
  });
});
