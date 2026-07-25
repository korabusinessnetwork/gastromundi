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
