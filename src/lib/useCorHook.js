import { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { resolverCor } from "./tema";

/**
 * Hook reativo para resolver cores via CSS Custom Properties em runtime.
 * Resolve DEPOIS de `aplicarVariaveisTema()` e re-resolve quando
 * `tenant.tema` muda, garantindo que componentes que precisam do valor
 * hex real (props de ícones, charts, canvas) sempre tenham a cor correta.
 *
 * Uso (em componentes React):
 *   import { useCor } from '@/lib/useCorHook';
 *   const corAccent = useCor('--gm-accent');
 *   <Icon color={corAccent} />
 *
 * @param {string} tokenName - nome da CSS var, ex.: '--gm-accent'
 * @returns {string} hex resolvido
 */
export function useCor(tokenName) {
  const { tenant } = useApp();
  const [cor, setCor] = useState(() => resolverCor(tokenName));

  // Re-resolve quando tenant.tema muda
  useEffect(() => {
    setCor(resolverCor(tokenName));
  }, [tenant?.tema, tokenName]);

  return cor;
}
