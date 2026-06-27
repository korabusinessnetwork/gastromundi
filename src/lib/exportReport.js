import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

const EMPRESA = "GASTROMUNDI by Kora";
const DARK    = [10, 17, 34];   // header fill
const LIGHT   = [245, 247, 250]; // alternate row

function periodoLabel(periodo) {
  return { hoje: "Hoje", semana: "Últimos 7 dias", mes: "Últimos 30 dias", tudo: "Todo o período" }[periodo] ?? periodo;
}

/**
 * Exports tabular data as a PDF file.
 * @param {string}   titulo    - Report title (also used as filename base)
 * @param {string[]} headers   - Column header strings
 * @param {Array[]}  rows      - Row arrays (values are converted to strings)
 * @param {string}   periodo   - Period key for subtitle
 * @param {object}   [opts]    - { landscape: bool, totais: string }
 */
export function exportToPDF(titulo, headers, rows, periodo, opts = {}) {
  const orientation = opts.landscape !== false ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "mm" });
  const W   = doc.internal.pageSize.width;
  const now = new Date().toLocaleString("pt-BR");

  // ── Cabeçalho ────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(EMPRESA, 14, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text(titulo, 14, 22);

  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(`Período: ${periodoLabel(periodo)}`, 14, 28);
  doc.text(`Gerado em: ${now}`, W - 14, 28, { align: "right" });
  doc.setTextColor(0, 0, 0);

  // ── Linha separadora ─────────────────────────────────────────
  doc.setDrawColor(220, 220, 220);
  doc.line(14, 31, W - 14, 31);

  // ── Tabela ───────────────────────────────────────────────────
  autoTable(doc, {
    head:     [headers],
    body:     rows.map(r => r.map(v => v == null ? "—" : String(v))),
    startY:   35,
    margin:   { left: 14, right: 14 },
    styles:         { fontSize: 8.5, cellPadding: 3.5, valign: "middle" },
    headStyles:     { fillColor: DARK, textColor: 255, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles: { fillColor: LIGHT },
    tableLineColor: [210, 210, 210],
    tableLineWidth: 0.2,
  });

  // ── Rodapé opcional ──────────────────────────────────────────
  if (opts.totais) {
    const finalY = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(opts.totais, W - 14, finalY, { align: "right" });
  }

  doc.save(`${titulo.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.pdf`);
}

/**
 * Exports tabular data as an XLSX file.
 * @param {string}   titulo    - Sheet name and filename base
 * @param {string[]} headers   - Column header strings
 * @param {Array[]}  rows      - Row arrays
 * @param {string}   periodo   - Period key
 */
export function exportToXLSX(titulo, headers, rows, periodo) {
  const metaRow  = [`${EMPRESA} — ${titulo}`, "", "", `Período: ${periodoLabel(periodo)}`, "", `Gerado em: ${new Date().toLocaleString("pt-BR")}`];
  const emptyRow = [];

  const data = [metaRow, emptyRow, headers, ...rows];
  const ws   = XLSX.utils.aoa_to_sheet(data);
  const wb   = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 31));
  XLSX.writeFile(wb, `${titulo.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.xlsx`);
}
