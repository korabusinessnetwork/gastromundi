import { Suspense } from "react";
import { TELAS_MODULO } from "@/pages/mobile/modulos/registro";

/**
 * Renderiza a tela nativa de um módulo dentro do Palm. Cada tela é
 * auto-suficiente (lê o próprio dado do contexto/lib) e só recebe o
 * `onVoltar` — o shell não intermedia a regra de negócio de cada módulo.
 */
export default function TelaModulo({ chave, onVoltar }) {
  const Tela = TELAS_MODULO[chave];
  if (!Tela) return null;
  return (
    <Suspense fallback={<p className="mod-carregando">Abrindo…</p>}>
      <Tela onVoltar={onVoltar} />
    </Suspense>
  );
}
