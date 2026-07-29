// Vigia dos lançamentos que chegam pelo realtime — é assim que o Palm no
// celular imprime COM internet (decisão do dono 2026-07-29).
//
// Sem internet o caminho já existe: o celular abre a página que a própria
// Ponte KORA serve na rede local e a Ponte manda pra térmica (usePonteLocal).
// COM internet o celular fala direto com o Supabase, e aí ele não tem como
// imprimir: um app servido por HTTPS só alcança `http://` no próprio
// `localhost`, e o `localhost` do celular é o celular. Quem tem a impressora
// é o computador do caixa — então é ele que reage ao pedido chegando e
// manda o papel. O garçom não precisa saber de nada disso: lançou, saiu.
//
// Roda só no desktop com alguém logado, e só se ESTE computador estiver
// marcado como o que imprime (ver `lib/impressao/aparelho`).

import { useEffect, useRef, useState } from "react";
import { imprimirLancamento } from "@/lib/impressao/despacho";
import { registroLancamentos } from "@/lib/impressao/lancamentos";
import { aparelhoImprimeLancamentos, assinarAparelhoImprime } from "@/lib/impressao/aparelho";

/** Estado atual da chave deste aparelho, reagindo a mudanças na configuração. */
export function useAparelhoImprime() {
  const [ligado, setLigado] = useState(aparelhoImprimeLancamentos);
  useEffect(() => assinarAparelhoImprime(() => setLigado(aparelhoImprimeLancamentos())), []);
  return ligado;
}

export function useImpressaoLancamentos({ ativo, pending, loading }) {
  const semeadoRef = useRef(false);
  const filaRef = useRef(Promise.resolve());

  useEffect(() => {
    if (!ativo || loading) return;

    // Primeira passada: tudo que já está na tela nasce marcado. Sem isso,
    // abrir o sistema de manhã reimprimiria toda comanda aberta da véspera.
    if (!semeadoRef.current) {
      registroLancamentos.marcarPedidos(pending);
      semeadoRef.current = true;
      return;
    }

    const novos = registroLancamentos.novos(pending);
    if (novos.length === 0) return;

    // Marca ANTES de imprimir. A impressão é assíncrona e o `pending` muda
    // várias vezes enquanto ela acontece (o próprio realtime devolve o eco
    // da gravação) — marcar depois faria o mesmo lançamento sair duas vezes.
    for (const grupo of novos) registroLancamentos.marcar(grupo.chave);

    // Uma fila só: são poucos papéis e a térmica atende um trabalho por vez.
    // Disparar em paralelo embaralharia a ordem na bancada da cozinha.
    filaRef.current = filaRef.current.then(async () => {
      for (const grupo of novos) {
        try {
          const { error } = await imprimirLancamento({ ...grupo.pedido, items: grupo.itens });
          if (error) console.error("[impressao] lançamento não saiu na produção:", error);
        } catch (err) {
          console.error("[impressao] lançamento não saiu na produção:", err);
        }
      }
    });
  }, [ativo, pending, loading]);
}
