import { useEffect, useRef } from "react";
import { buscarConfigImpressao } from "@/lib/impressao";
import { imprimirDocumento } from "@/lib/impressao/drivers";
import { resolverPerfilDoLocal } from "@/lib/impressao/resolverPerfil";
import { processarFilaImpressao } from "@/lib/impressao/fila";

const INTERVALO_MS = 5000;

/**
 * Poll da fila de impressão em rede — Fase 3 do plano de impressão.
 *
 * Só a máquina que É uma estação e está online processa (o `ativo` vem do
 * FilaImpressaoBridge). A cada 5s lê a config; se `impressaoEmRede` estiver
 * ligada, processa os trabalhos pendentes dos locais que ESTA máquina
 * imprime (a fila só carrega o que é "remoto"; o local vinculado aqui já
 * saiu na hora, no despacho). Espelha o ciclo do usePonteLocal.
 *
 * Nunca derruba o app: cada tick é try/catch e não sobrepõe o anterior.
 *
 * @param {{ ativo: boolean }} params
 */
export function useFilaImpressao({ ativo }) {
  const rodando = useRef(false);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;

    const tick = async () => {
      if (rodando.current) return; // não sobrepõe ticks (impressão pode demorar)
      rodando.current = true;
      try {
        const { data: cfg } = await buscarConfigImpressao();
        if (cancelado || !cfg?.impressaoEmRede) return;
        await processarFilaImpressao({
          imprimir: imprimirDocumento,
          resolverPerfil: resolverPerfilDoLocal,
          configImpressao: cfg,
        });
      } catch {
        // Fila é best-effort — falha de rede/driver nunca interrompe a operação.
      } finally {
        rodando.current = false;
      }
    };

    tick();
    const id = setInterval(tick, INTERVALO_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [ativo]);
}
