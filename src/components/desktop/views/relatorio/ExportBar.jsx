import { LuPrinter, LuDownload } from "react-icons/lu";

/**
 * Os dois botões de exportação de um relatório. Extraído de
 * RelatorioView para que uma aba em arquivo próprio (Delivery) use os
 * MESMOS botões, na mesma posição, em vez de desenhar os seus — a
 * consistência entre telas é o princípio nº 1.
 *
 * As classes vivem em RelatorioView.css, que já está carregado sempre
 * que qualquer aba está na tela.
 */
export default function ExportBar({ onPDF, onXLSX }) {
  return (
    <div className="relatorio-view__export-bar">
      <button onClick={onPDF} title="Exportar PDF" className="relatorio-view__export-btn">
        <LuPrinter size={13} /> PDF
      </button>
      <button onClick={onXLSX} title="Exportar Excel" className="relatorio-view__export-btn">
        <LuDownload size={13} /> Excel
      </button>
    </div>
  );
}
