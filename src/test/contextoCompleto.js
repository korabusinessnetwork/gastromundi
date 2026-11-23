import { useSessao, useOffline, useConfig, useCatalogo, useComandas, useCaixa } from "@/context/AppContext";

/**
 * Só para os testes do próprio contexto (tarefa 2.10 do plano de
 * refatoração): junta os seis ganchos num objeto, para a sonda do teste poder
 * ler e chamar qualquer assunto, como a antiga fachada `useApp()` permitia.
 *
 * Tela nenhuma deve usar isto. Ler o contexto inteiro faz a tela ser
 * redesenhada por qualquer mudança do app, que é exatamente o que a fase 2
 * acabou; o guard `telasSemUseApp.test.js` cobra.
 */
export function useContextoCompleto() {
  return {
    ...useSessao(),
    ...useOffline(),
    ...useConfig(),
    ...useCatalogo(),
    ...useComandas(),
    ...useCaixa(),
  };
}
