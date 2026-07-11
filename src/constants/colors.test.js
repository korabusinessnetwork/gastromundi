import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import C from "./colors";

const __dirname = dirname(fileURLToPath(import.meta.url));
const temaCss = readFileSync(resolve(__dirname, "../styles/tema.css"), "utf8");

/**
 * F018 — trava a FONTE ÚNICA DE VERDADE de cores.
 *
 * Depois do F018, `colors.js` (C) não guarda mais hex: guarda apenas
 * os NOMES dos tokens (`--gm-*`). Os valores hex vivem SÓ em
 * `src/styles/tema.css`. Estes testes garantem que:
 *   1. C.x é sempre o nome de token `--gm-x` (nenhum hex em JS).
 *   2. Todo token referenciado por C tem um default definido em tema.css.
 *      (é isso que mantém a aparência default idêntica: o browser resolve
 *       var(--gm-x) para o mesmo hex que colors.js tinha antes.)
 */
describe("colors.js — fonte única de verdade (F018)", () => {
  it("C.x é o nome do token '--gm-x' (nunca um hex em JS)", () => {
    for (const [chave, valor] of Object.entries(C)) {
      expect(valor, `C.${chave}`).toBe(`--gm-${chave}`);
      expect(valor, `C.${chave} não pode ser hex`).not.toMatch(/^#|rgb/);
    }
  });

  it("todo token de C tem um default declarado em tema.css (:root)", () => {
    for (const chave of Object.keys(C)) {
      const token = `--gm-${chave}`;
      expect(temaCss, `tema.css deve declarar ${token}`).toContain(`${token}:`);
    }
  });

  it("os defaults em tema.css são os hex legados da marca GastroMundi (aparência default idêntica)", () => {
    // Snapshot dos valores originais de colors.js antes do F018 — se algum
    // mudar, a aparência default mudou e o teste falha de propósito.
    const DEFAULTS_LEGADOS = {
      "--gm-bg": "#070b14",
      "--gm-card": "#0e1220",
      "--gm-surface": "#161b2c",
      "--gm-border": "#28324d",
      "--gm-accent": "#7c3aed",
      "--gm-green": "#10b981",
      "--gm-red": "#ef4444",
      "--gm-blue": "#3b82f6",
      "--gm-text": "#eef2f7",
      "--gm-muted": "#9aa8c4",
      "--gm-faint": "#323d58",
    };
    for (const [token, hex] of Object.entries(DEFAULTS_LEGADOS)) {
      const regex = new RegExp(`${token}:\\s*${hex}\\s*;`, "i");
      expect(temaCss, `${token} deve valer ${hex} em tema.css`).toMatch(regex);
    }
    // alow (overlay translúcido do accent) — mantém o mesmo rgba legado
    expect(temaCss).toMatch(/--gm-alow:\s*rgba\(124,\s*58,\s*237,\s*0\.13\)/);
  });
});
