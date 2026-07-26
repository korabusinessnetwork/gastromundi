// Testes puros do nucleo do bot (node:test, sem dependencia externa —
// core.js so importa a lib pura de importacao). As regras pesadas de
// validacao/idempotencia ja tem teste no app (src/lib/importacao/*.test.js);
// aqui cobrimos os helpers proprios do bot.
//
// Rodar:  node --test   (dentro de bot/importador-cardapio)

import { test } from "node:test";
import assert from "node:assert/strict";

import { formatoDoArquivo, resumoImportacao } from "./core.js";

test("formatoDoArquivo reconhece csv/xlsx (qualquer caixa) e ignora o resto", () => {
  assert.equal(formatoDoArquivo("cardapio.csv"), "csv");
  assert.equal(formatoDoArquivo("lista.TXT"), "csv");
  assert.equal(formatoDoArquivo("PRECOS.XLSX"), "xlsx");
  assert.equal(formatoDoArquivo("planilha.xls"), "xlsx");
  assert.equal(formatoDoArquivo("foto.png"), null);
  assert.equal(formatoDoArquivo("semextensao"), null);
});

test("resumoImportacao monta frase legivel e omite zeros", () => {
  assert.equal(
    resumoImportacao({ criados: 3, atualizados: 1, iguais: 0, ignorados: 2 }),
    "3 novo(s), 1 atualizado(s), 2 linha(s) com erro ignorada(s)"
  );
  assert.equal(
    resumoImportacao({ criados: 0, atualizados: 0, iguais: 5, ignorados: 0 }),
    "5 sem mudanca"
  );
  assert.equal(
    resumoImportacao({ criados: 0, atualizados: 0, iguais: 0, ignorados: 0 }),
    "nada a fazer"
  );
});
