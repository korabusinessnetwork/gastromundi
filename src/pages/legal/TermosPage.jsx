import DocumentoLegal from "./DocumentoLegal";
import { TERMOS_DE_USO } from "@/lib/legal/termosDeUso";

/** Rota /termos — Termos de Uso. Conteúdo em src/lib/legal/termosDeUso.js. */
export default function TermosPage() {
  return <DocumentoLegal documento={TERMOS_DE_USO} />;
}
