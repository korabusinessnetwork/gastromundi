// Contrato entre os DOIS programas: o app (este repositório, src/) e a
// Ponte KORA (ponte/, que roda no PC do caixa).
//
// Por que este teste existe fora do lugar óbvio: o tamanho da letra
// atravessa uma fronteira de processo — o app manda `tamanhoFonte` pela
// rede local, a Ponte valida, guarda na fila e transforma em bytes
// ESC/POS. Cada lado já tem teste próprio, e é justamente por isso que um
// nome de campo trocado (ou um degrau que existe de um lado só) passaria
// nos dois e quebraria em produção: a impressão sairia no tamanho padrão,
// mas com a largura calculada pro tamanho pedido — comanda torta. Aqui os
// dois lados são exercitados no mesmo caso, do clique do dono até o byte.
import { describe, it, expect, vi } from "vitest";

const enviados = [];
vi.mock("@/lib/ponte", () => ({
  enviarImpressaoPonte: async (trabalho) => {
    enviados.push(trabalho);
    return { error: null };
  },
}));

const { imprimir } = await import("./drivers/escposPonte");
const { criarTrabalho } = await import("../../../ponte/lib/filaImpressao.js");
const { montarBytes } = await import("../../../ponte/lib/escpos.js");

const IMPRESSORA = { tipo: "windows", nome: "EPSON TM-T20" };

const VIA_PRODUCAO = {
  tipo: "via_producao",
  comanda: "7",
  apelido: null,
  mesa: "3",
  garcom: "ana",
  horario: "2026-09-03T18:00:00.000Z",
  itens: [{ nome: "CAPPUCINO ITALIANO MEDIO", qty: 2, emoji: "", obs: ["sem açúcar"] }],
};

// O que o dono escolhe na tela (px gravado no perfil) → o que tem que
// chegar na impressora: bytes do tamanho e largura máxima da linha.
const CASOS = [
  { px: null, tamanho: "normal", colunas: 48, comando: null },
  { px: 11, tamanho: "pequena", colunas: 64, comando: [0x1b, 0x4d, 0x01] }, // ESC M 1 (Fonte B)
  { px: 18, tamanho: "alta", colunas: 48, comando: [0x1d, 0x21, 0x01] },    // GS ! altura 2x
  { px: 22, tamanho: "grande", colunas: 24, comando: [0x1d, 0x21, 0x11] },  // GS ! altura+largura 2x
];

const contem = (bytes, procurado) =>
  bytes.some((_, i) => procurado.every((b, j) => bytes[i + j] === b));

describe("tamanho da letra: do perfil do app aos bytes da impressora", () => {
  it.each(CASOS)("$tamanho chega inteiro na Ponte e vira comando ESC/POS", async ({ px, tamanho, colunas, comando }) => {
    enviados.length = 0;
    const { error } = await imprimir(VIA_PRODUCAO, { impressora: IMPRESSORA, larguraMm: 80, fonteBase: px });
    expect(error).toBeNull();

    // 1. O app mandou o tamanho e formatou nas colunas daquele tamanho.
    const corpo = enviados[0];
    expect(corpo.tamanhoFonte).toBe(tamanho);
    expect(Math.max(...corpo.linhas.map((l) => l.length))).toBeLessThanOrEqual(colunas);

    // 2. A Ponte aceita esse corpo e guarda o tamanho na fila.
    const registro = criarTrabalho(corpo, { id: "contrato-teste" });
    expect(registro.ok).toBe(true);
    expect(registro.trabalho.tamanhoFonte).toBe(tamanho);

    // 3. E os bytes que vão pra impressora pedem esse tamanho.
    const bytes = [...montarBytes(registro.trabalho.linhas, {
      cortaPapel: registro.trabalho.cortaPapel,
      tamanhoFonte: registro.trabalho.tamanhoFonte,
    })];
    if (comando) expect(contem(bytes, comando)).toBe(true);
    // No tamanho padrão nada muda: o fluxo começa igual ao de sempre
    // (ESC @ + ESC t 2) e nenhum comando de fonte entra no meio.
    else expect(bytes.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x02]);
  });
});
