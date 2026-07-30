import { describe, it, expect } from "vitest";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  getPermissions,
  mesclarPermissoes,
  calcularOverride,
} from "./roles";

describe("PERMISSION_KEYS / LABELS", () => {
  it("todas as chaves têm rótulo", () => {
    for (const k of PERMISSION_KEYS) {
      expect(PERMISSION_LABELS[k]).toBeTruthy();
    }
  });

  it("cobre exatamente as chaves do mapa de um cargo", () => {
    const doCargo = Object.keys(getPermissions("admin")).sort();
    expect([...PERMISSION_KEYS].sort()).toEqual(doCargo);
  });
});

// Run 5, leva 2 — o fallback antigo era garçom, e garçom NÃO é vazio: tem
// palm, cozinha e clientes. Qualquer role fora da tabela (typo no banco, cargo
// novo criado antes da matriz, o papel `plataforma` do Console) entrava num
// estabelecimento com essas três liberadas. Cargo desconhecido = nada.
describe("getPermissions — cargo desconhecido falha FECHADO (leva 2)", () => {
  const semNada = (mapa) => {
    expect(Object.keys(mapa).sort()).toEqual([...PERMISSION_KEYS].sort());
    for (const k of PERMISSION_KEYS) expect(mapa[k]).toBe(false);
  };

  it("cargo que não existe não recebe nenhuma permissão", () => {
    semNada(getPermissions("supervisor"));
  });

  it("papel `plataforma` (Console) não ganha acesso ao app do tenant", () => {
    semNada(getPermissions("plataforma"));
  });

  it("typo no cargo não vira garçom", () => {
    semNada(getPermissions("gerennte"));
    expect(getPermissions("gerennte").palm).toBe(false);
    expect(getPermissions("gerennte").cozinha).toBe(false);
    expect(getPermissions("gerennte").clientes).toBe(false);
  });

  it("null, undefined e string vazia não recebem nada", () => {
    semNada(getPermissions(null));
    semNada(getPermissions(undefined));
    semNada(getPermissions(""));
  });

  it("chave herdada do Object.prototype não vira cargo", () => {
    semNada(getPermissions("constructor"));
    semNada(getPermissions("toString"));
    semNada(getPermissions("__proto__"));
  });

  it("os quatro cargos reais continuam intactos", () => {
    expect(getPermissions("garcom").palm).toBe(true);
    expect(getPermissions("garcom").pdv).toBe(false);
    expect(getPermissions("caixa").pdv).toBe(true);
    expect(getPermissions("gerente").financeiro).toBe(true);
    expect(getPermissions("gerente").configuracoes).toBe(false);
    expect(getPermissions("admin").configuracoes).toBe(true);
  });

  it("o mapa fechado é imutável — ninguém liga permissão nele por acidente", () => {
    const mapa = getPermissions("inexistente");
    expect(() => { mapa.pdv = true; }).toThrow();
    expect(getPermissions("outro-inexistente").pdv).toBe(false);
  });
});

describe("mesclarPermissoes", () => {
  it("sem override, retorna o mapa do cargo (completo, booleano)", () => {
    const base = getPermissions("caixa");
    const out = mesclarPermissoes(base, null);
    for (const k of PERMISSION_KEYS) expect(out[k]).toBe(!!base[k]);
  });

  it("override manda quando a chave está presente", () => {
    const base = getPermissions("caixa"); // relatorio:false
    const out = mesclarPermissoes(base, { relatorio: true });
    expect(out.relatorio).toBe(true);
    expect(out.pdv).toBe(true); // herdado do cargo
  });

  it("ignora chaves desconhecidas no override", () => {
    const base = getPermissions("garcom");
    const out = mesclarPermissoes(base, { hackzone: true });
    expect(out).not.toHaveProperty("hackzone");
  });

  it("sempre devolve todas as chaves como booleano, mesmo com base parcial", () => {
    const out = mesclarPermissoes({ pdv: true }, null);
    expect(out.pdv).toBe(true);
    expect(out.financeiro).toBe(false);
    expect(Object.keys(out).sort()).toEqual([...PERMISSION_KEYS].sort());
  });
});

describe("calcularOverride", () => {
  it("retorna null quando o desejado é igual ao cargo", () => {
    const base = getPermissions("gerente");
    expect(calcularOverride({ ...base }, base)).toBeNull();
  });

  it("captura só as chaves que diferem do cargo", () => {
    const base = getPermissions("caixa"); // relatorio:false, pdv:true
    const desejado = mesclarPermissoes(base, { relatorio: true });
    const ov = calcularOverride(desejado, base);
    expect(ov).toEqual({ relatorio: true });
  });

  it("captura tanto liberação quanto restrição", () => {
    const base = getPermissions("gerente"); // financeiro:true, configuracoes:false
    const desejado = mesclarPermissoes(base, { financeiro: false, configuracoes: true });
    const ov = calcularOverride(desejado, base);
    expect(ov).toEqual({ financeiro: false, configuracoes: true });
  });

  it("ida-e-volta: mesclar(base, calcularOverride(x, base)) reproduz x", () => {
    const base = getPermissions("garcom");
    const desejado = mesclarPermissoes(base, { pdv: true, financeiro: true });
    const ov = calcularOverride(desejado, base);
    expect(mesclarPermissoes(base, ov)).toEqual(desejado);
  });
});
