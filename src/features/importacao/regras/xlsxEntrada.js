// ──────────────────────────────────────────────────────────────────
// Importador Inteligente — ENTRADA de planilha .xlsx (Excel/Sheets).
//
// O "trabalho pesado" pedido pelo dono para xlsx: em vez de exigir que
// o cliente salve como CSV, lemos o .xlsx direto e o convertemos para o
// MESMO texto CSV (";") que o wizard já sabe validar. Assim toda a
// tubulação testada (validação linha a linha, dedupe, limites, proteção
// contra CSV injection, preview e aplicação) continua valendo SEM cópia.
//
// SheetJS (`xlsx`) já é dependência do projeto (usado no export), então
// não há custo novo. Função pura: recebe os bytes, devolve string CSV.
// ──────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";

/**
 * Converte os bytes de um .xlsx no texto CSV (separador ";") da primeira
 * planilha com conteúdo. Escolher a primeira aba NÃO vazia evita cair
 * numa aba de capa/instruções em branco antes dos dados.
 * @param {ArrayBuffer|Uint8Array|number[]} bytes
 * @returns {string} CSV com ";" (vazio se nenhuma aba tiver conteúdo)
 */
export function xlsxParaCSV(bytes) {
  const dados = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  const wb = XLSX.read(dados, { type: "array" });

  for (const nome of wb.SheetNames) {
    const sheet = wb.Sheets[nome];
    if (!sheet || !sheet["!ref"]) continue; // aba sem intervalo = vazia
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ";", blankrows: false });
    // Sobrou algo além de separadores/espaços? Então é a aba de dados.
    if (csv.replace(/[;\s]/g, "") !== "") return csv;
  }
  return "";
}
