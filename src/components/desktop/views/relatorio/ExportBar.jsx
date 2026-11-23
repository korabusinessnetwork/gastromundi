import {
  LuPrinter, LuDownload
} from "react-icons/lu";

export default function ExportBar({ onPDF, onXLSX }) {
  return (
    <div className="relatorio-view__export-bar">
      <button
        onClick={onPDF}
        title="Exportar PDF"
        className="relatorio-view__export-btn"
      >
        <LuPrinter size={13} /> PDF
      </button>
      <button
        onClick={onXLSX}
        title="Exportar Excel"
        className="relatorio-view__export-btn"
      >
        <LuDownload size={13} /> Excel
      </button>
    </div>
  );
}

// ── Modal de detalhe de fechamento ────────────────────────────────
