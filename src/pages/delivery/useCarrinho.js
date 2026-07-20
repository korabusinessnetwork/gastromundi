// ──────────────────────────────────────────────────────────────────
// useCarrinho — estado da sacola da vitrine de delivery.
//
// Guarda os itens escolhidos pelo cliente (produto/combo + complementos
// + observação + qtd). Só calcula para EXIBIR — o valor que vale é o que
// a RPC criar_pedido_delivery recalcula no servidor. Persiste em
// sessionStorage por slug pra não perder a sacola ao recarregar a aba.
// ──────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from "react";
import { calcularSubtotal, totalItens } from "@/lib/delivery";

function chaveStorage(slug) {
  return `kora.delivery.sacola.${slug || "default"}`;
}

function lerInicial(slug) {
  try {
    const bruto = sessionStorage.getItem(chaveStorage(slug));
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} slug - subdomínio do tenant (isola a sacola por origem).
 */
export function useCarrinho(slug) {
  const [itens, setItens] = useState(() => lerInicial(slug));

  // Persiste a cada mudança (fire-and-forget; sessionStorage pode falhar
  // em modo privado — nunca deixa isso quebrar a operação).
  useEffect(() => {
    try {
      sessionStorage.setItem(chaveStorage(slug), JSON.stringify(itens));
    } catch {
      /* ignora — a sacola em memória continua válida */
    }
  }, [itens, slug]);

  const adicionar = useCallback((item) => {
    // Cada linha é única (id local) — dois "mesmo produto" com complementos
    // diferentes coexistem sem se fundir.
    setItens((prev) => [...prev, { ...item, _linha: crypto.randomUUID() }]);
  }, []);

  const remover = useCallback((linhaId) => {
    setItens((prev) => prev.filter((i) => i._linha !== linhaId));
  }, []);

  const alterarQtd = useCallback((linhaId, delta) => {
    setItens((prev) =>
      prev.flatMap((i) => {
        if (i._linha !== linhaId) return [i];
        const novaQtd = Math.max(0, (Number(i.qtd) || 1) + delta);
        // Zerar a quantidade remove a linha (prevenção de erro: sem "qtd 0").
        return novaQtd === 0 ? [] : [{ ...i, qtd: novaQtd }];
      })
    );
  }, []);

  const limpar = useCallback(() => setItens([]), []);

  const subtotal = useMemo(() => calcularSubtotal(itens), [itens]);
  const quantidade = useMemo(() => totalItens(itens), [itens]);

  return { itens, adicionar, remover, alterarQtd, limpar, subtotal, quantidade };
}

export default useCarrinho;
