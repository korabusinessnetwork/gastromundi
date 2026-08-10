import DocumentoLegal from "./DocumentoLegal";
import { POLITICA_PRIVACIDADE } from "@/lib/legal/politicaPrivacidade";

/** Rota /privacidade — Política de Privacidade (LGPD). */
export default function PrivacidadePage() {
  return <DocumentoLegal documento={POLITICA_PRIVACIDADE} />;
}
