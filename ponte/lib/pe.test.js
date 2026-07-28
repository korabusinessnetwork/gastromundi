// Testes do patch de subsistema PE (Leva 15).
//
// O que estes testes protegem: o `KoraPonte.exe` tem 58 MB e é o programa que
// vai rodar no PC do cliente — escrever no lugar errado dele é estragar a
// instalação de alguém. Então a conta que acha o campo `Subsystem` e todas as
// recusas (arquivo que não é .exe, arquivo cortado, executável 32 bits) têm
// que estar certas ANTES de o script encostar num arquivo de verdade.
//
// Nenhum teste aqui precisa de executável real: montamos um cabeçalho PE de
// mentira, com os mesmos bytes nas mesmas posições.
import { describe, it, expect } from "vitest";
import {
  offsetSubsystem, lerSubsystem, patchSubsystem, SUBSYSTEM_CONSOLE, SUBSYSTEM_GUI,
} from "./pe.js";

const E_LFANEW = 0x100; // posição típica do cabeçalho PE num .exe de verdade
const OFFSET_OPTIONAL = E_LFANEW + 4 + 20;
const OFFSET_SUBSYSTEM = OFFSET_OPTIONAL + 68;

/**
 * Monta um "executável" de mentira com só o que importa preenchido:
 * "MZ", e_lfanew, "PE\0\0", a magic do optional header e o Subsystem.
 */
function exeFalso({
  mz = "MZ",
  eLfanew = E_LFANEW,
  assinatura = "PE\0\0",
  magic = 0x20b,
  subsystem = SUBSYSTEM_CONSOLE,
  tamanho = 1024,
} = {}) {
  const buffer = Buffer.alloc(tamanho);
  buffer.write(mz, 0, "latin1");
  buffer.writeUInt32LE(eLfanew, 0x3c);
  if (assinatura) buffer.write(assinatura, eLfanew, "latin1");
  buffer.writeUInt16LE(magic, eLfanew + 4 + 20);
  // Escreve o campo Subsystem só se ele couber inteiro no tamanho pedido —
  // o teste "recusa arquivo que termina antes do campo" monta um buffer
  // propositalmente curto demais para o campo, e o próprio helper de
  // montagem não pode estourar o buffer antes de o código testado rodar.
  const offsetSubsystemFalso = eLfanew + 4 + 20 + 68;
  if (offsetSubsystemFalso + 2 <= tamanho) {
    buffer.writeUInt16LE(subsystem, offsetSubsystemFalso);
  }
  return buffer;
}

describe("offsetSubsystem", () => {
  it("acha o campo somando assinatura (4) + COFF (20) + 68 a partir do e_lfanew", () => {
    const r = offsetSubsystem(exeFalso());
    expect(r).toEqual({ ok: true, offset: OFFSET_SUBSYSTEM, offsetOptional: OFFSET_OPTIONAL });
  });

  it("acompanha o e_lfanew quando ele muda (não é posição fixa)", () => {
    const r = offsetSubsystem(exeFalso({ eLfanew: 0x2a0 }));
    expect(r.ok).toBe(true);
    expect(r.offset).toBe(0x2a0 + 4 + 20 + 68);
  });

  it("recusa o que não é Buffer", () => {
    expect(offsetSubsystem(null).ok).toBe(false);
    expect(offsetSubsystem(undefined).ok).toBe(false);
    expect(offsetSubsystem("KoraPonte.exe").ok).toBe(false);
    expect(offsetSubsystem({}).ok).toBe(false);
  });

  it("recusa arquivo sem a assinatura MZ do começo", () => {
    const r = offsetSubsystem(exeFalso({ mz: "ZZ" }));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/MZ/);
  });

  it("recusa e_lfanew zerado ou absurdo (arquivo corrompido)", () => {
    expect(offsetSubsystem(exeFalso({ eLfanew: 0 })).ok).toBe(false);
    const gigante = Buffer.alloc(1024);
    gigante.write("MZ", 0, "latin1");
    gigante.writeUInt32LE(0xfffffff0, 0x3c);
    expect(offsetSubsystem(gigante).ok).toBe(false);
  });

  it("recusa quando não há \"PE\\0\\0\" no lugar apontado", () => {
    const r = offsetSubsystem(exeFalso({ assinatura: "NE\0\0" }));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/assinatura/i);
  });

  it("recusa executável 32 bits (magic 0x10B) — o alvo do pkg é x64", () => {
    const r = offsetSubsystem(exeFalso({ magic: 0x10b }));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/64 bits/);
  });

  it("recusa arquivo que termina antes do campo", () => {
    const r = offsetSubsystem(exeFalso({ tamanho: OFFSET_SUBSYSTEM + 1 }));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/termina antes/);
  });

  it("recusa arquivo curto demais até para ter o e_lfanew", () => {
    expect(offsetSubsystem(Buffer.alloc(8)).ok).toBe(false);
  });
});

describe("lerSubsystem", () => {
  it("lê 3 num executável de console (o que o pkg entrega)", () => {
    expect(lerSubsystem(exeFalso())).toEqual({
      ok: true, valor: SUBSYSTEM_CONSOLE, offset: OFFSET_SUBSYSTEM,
    });
  });

  it("lê 2 num executável já sem janela", () => {
    expect(lerSubsystem(exeFalso({ subsystem: SUBSYSTEM_GUI })).valor).toBe(SUBSYSTEM_GUI);
  });

  it("repassa a recusa de offsetSubsystem", () => {
    expect(lerSubsystem(Buffer.alloc(4)).ok).toBe(false);
  });
});

describe("patchSubsystem", () => {
  it("troca console(3) por janela(2) e escreve no lugar certo do buffer", () => {
    const buffer = exeFalso();
    const r = patchSubsystem(buffer);
    expect(r).toEqual({
      ok: true, alterado: true, de: SUBSYSTEM_CONSOLE, para: SUBSYSTEM_GUI, offset: OFFSET_SUBSYSTEM,
    });
    expect(buffer.readUInt16LE(OFFSET_SUBSYSTEM)).toBe(SUBSYSTEM_GUI);
  });

  it("não mexe em mais nenhum byte do arquivo", () => {
    const antes = exeFalso();
    const depois = Buffer.from(antes);
    patchSubsystem(depois);
    for (let i = 0; i < antes.length; i += 1) {
      if (i === OFFSET_SUBSYSTEM) continue;
      if (i === OFFSET_SUBSYSTEM + 1) continue;
      expect(depois[i]).toBe(antes[i]);
    }
  });

  it("é idempotente: rodar de novo num exe já sem janela não altera nada", () => {
    const buffer = exeFalso({ subsystem: SUBSYSTEM_GUI });
    const r = patchSubsystem(buffer);
    expect(r.ok).toBe(true);
    expect(r.alterado).toBe(false);
    expect(buffer.readUInt16LE(OFFSET_SUBSYSTEM)).toBe(SUBSYSTEM_GUI);
  });

  it("recusa (sem escrever) um subsistema desconhecido — nunca \"conserta\" arquivo estranho", () => {
    const buffer = exeFalso({ subsystem: 9 });
    const r = patchSubsystem(buffer);
    expect(r.ok).toBe(false);
    expect(buffer.readUInt16LE(OFFSET_SUBSYSTEM)).toBe(9);
  });

  it("recusa valor de destino fora de 2/3", () => {
    const buffer = exeFalso();
    expect(patchSubsystem(buffer, 0).ok).toBe(false);
    expect(patchSubsystem(buffer, 3).ok).toBe(true); // 3 é válido (volta a ter janela)
    expect(buffer.readUInt16LE(OFFSET_SUBSYSTEM)).toBe(SUBSYSTEM_CONSOLE);
  });

  it("não escreve nada quando o arquivo não passa na validação", () => {
    const buffer = exeFalso({ assinatura: "XX\0\0" });
    const original = Buffer.from(buffer);
    expect(patchSubsystem(buffer).ok).toBe(false);
    expect(buffer.equals(original)).toBe(true);
  });
});
