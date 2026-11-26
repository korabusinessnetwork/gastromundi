import { logAction } from "@/lib/logger";
import { mesmoItemDeVenda } from "@/lib/combos";
import { totalItensAtivos, itensNaoCancelados } from "@/features/comandas/regras/comandaItens";
import { fmtComanda } from "@/features/comandas/regras/rotuloComanda";

// Ações de transferir itens entre comandas: abrir a janela e executar a transferência.
// Não guarda estado: recebe o estado de `useEstadoTransferencia` e o que a tela do PDV
// já tem (comanda selecionada, trava, gravações), e devolve as duas ações.
export function acoesTransferencia({
    abertas, addPending, bloqueio, currentUser, notify, removePending, selected, setMode,
    setSelected, setShowTransferir, updatePending, transQtds, setTransQtds, transDestino,
    setTransDestino, transMode, setTransMode, transNumero, setTransNumero, transNomeNova,
    setTransNomeNova, setTransNumeroErro, transferindo, setTransferindo,
}) {
  const abrirTransferir = () => {
    const itens = Array.isArray(selected?.items) ? selected.items : [];
    const qtds = {};
    itens.forEach((_, idx) => { qtds[idx] = 0; });
    setTransQtds(qtds);
    setTransDestino(null);
    setTransMode("lista");
    setTransNumero("");
    setTransNomeNova("");
    setTransNumeroErro("");
    setShowTransferir(true);
  };

  const handleTransferir = async () => {
    const algumSelecionado = Object.values(transQtds).some(q => q > 0);
    if (!algumSelecionado || transferindo) return;
    // Mesma trava de lançar e finalizar: transferir reescreve `items` inteiro,
    // então mexer numa comanda que outro aparelho tem aberta é exatamente o
    // conflito que a trava existe para impedir.
    if (bloqueio) { notify?.(`${fmtComanda(selected?.comanda)} está em uso por ${bloqueio.nome}.`, "err"); return; }

    const itens = Array.isArray(selected?.items) ? selected.items : [];

    // Resolve o destino dependendo do modo
    let destinoId   = transDestino;
    let nomeDestino = "";

    if (transMode === "numero") {
      const num = transNumero.trim();
      if (!num) { setTransNumeroErro("Digite o número da comanda."); return; }
      const encontrada = abertas.find(o => String(o.comanda).trim() === num && o.id !== selected?.id);
      if (!encontrada) { setTransNumeroErro(`Comanda ${num} não encontrada ou é a mesma de origem.`); return; }
      destinoId   = encontrada.id;
      nomeDestino = fmtComanda(encontrada.comanda);
    } else if (transMode === "nova") {
      const nomeNova = transNomeNova.trim();
      if (!nomeNova) { setTransNumeroErro("Digite o nome ou número da nova comanda."); return; }
      const jaExiste = abertas.find(o => String(o.comanda).trim() === nomeNova);
      if (jaExiste) { setTransNumeroErro(`Comanda "${nomeNova}" já existe.`); return; }
      destinoId   = null; // será criada
      nomeDestino = fmtComanda(nomeNova);
    } else {
      if (!destinoId) return;
      const d = abertas.find(o => o.id === destinoId);
      nomeDestino = d ? fmtComanda(d.comanda) : "";
    }

    setTransferindo(true);
    try {
      const aTransferir = itens
        .map((it, idx) => ({ it, qty: transQtds[idx] ?? 0 }))
        .filter(x => x.qty > 0);

      // Origem: subtrai ou remove
      const novosOrigem = itens.map((it, idx) => {
        const qRemover = transQtds[idx] ?? 0;
        if (!qRemover) return it;
        const novaQty = (it.qty ?? 1) - qRemover;
        return novaQty > 0 ? { ...it, qty: novaQty } : null;
      }).filter(Boolean);
      const totalOrigem = totalItensAtivos(novosOrigem);

      // ── Transferência resiliente (sem Promise.all) ──────────────
      // O supabase-js NÃO lança em erro — resolve `{ error }`. Se as duas
      // gravações fossem disparadas juntas e a segunda falhasse, os itens
      // sumiriam de uma comanda sem entrar na outra (perda silenciosa =
      // prejuízo). Por isso as escritas são SEQUENCIAIS e o DESTINO é
      // confirmado ANTES da remoção na ORIGEM: se algo falhar, no pior caso
      // os itens ficam duplicados (visível/recuperável), nunca sumidos.
      if (transMode === "nova") {
        // Cria nova comanda com os itens transferidos.
        const itensNova = aTransferir.map(({ it, qty }) => ({ ...it, qty }));
        const totalNova = totalItensAtivos(itensNova);
        const novaOrder = {
          id:         crypto.randomUUID(),
          comanda:    transNomeNova.trim(),
          garcom:     currentUser?.name || "",
          items:      itensNova,
          total:      totalNova,
          status:     "open",
          created_at: new Date().toISOString(),
          mesa:       selected?.mesa    || "",
          apelido:    selected?.apelido || "",
        };

        // 1º passo — cria/adiciona no destino. Origem ainda intacta.
        const { error: erroDestino } = await addPending(novaOrder);
        if (erroDestino) {
          notify?.("Não foi possível transferir. Nada foi alterado, tente novamente.", "err");
          return;
        }

        // 2º passo — remove da origem só depois do destino confirmado.
        const { error: erroOrigem } = await updatePending(
          selected.id, { items: novosOrigem, total: totalOrigem }, { baseItems: itens },
        );
        if (erroOrigem) {
          // Destino já criado e origem intacta: desfaz a criação
          // (compensação) para não duplicar. Se a compensação também
          // falhar, os itens ficaram duplicados — avisa para conferência.
          const { error: erroCompensacao } = await removePending(novaOrder.id);
          if (erroCompensacao) {
            notify?.("Atenção: os itens podem ter ficado duplicados. Confira as duas comandas.", "err");
          } else {
            notify?.("Não foi possível transferir. Nada foi alterado, tente novamente.", "err");
          }
          return;
        }
      } else {
        // Destino existente.
        const destino          = abertas.find(o => o.id === destinoId);
        // O caixa pode ter fechado a comanda de destino entre a abertura desta
        // modal e o clique. Sem esta checagem, `destino.items` estourava
        // TypeError: a modal ficava aberta, sem mensagem, e o clique de novo
        // repetia o erro.
        if (!destino) {
          notify?.("A comanda de destino não está mais aberta. Nada foi alterado, escolha outra.", "err");
          return;
        }
        const itensDestinoOrig = Array.isArray(destino.items) ? destino.items : [];
        const novosDestino     = [...itensDestinoOrig];
        aTransferir.forEach(({ it, qty }) => {
          const existIdx = novosDestino.findIndex(d => mesmoItemDeVenda(d, it) && !d.cancelado);
          if (existIdx >= 0) {
            novosDestino[existIdx] = { ...novosDestino[existIdx], qty: (novosDestino[existIdx].qty ?? 1) + qty };
          } else {
            novosDestino.push({ ...it, qty });
          }
        });
        const totalDestino = totalItensAtivos(novosDestino);

        // 1º passo — adiciona no destino. Origem ainda intacta.
        const { error: erroDestino } = await updatePending(
          destinoId, { items: novosDestino, total: totalDestino }, { baseItems: itensDestinoOrig },
        );
        if (erroDestino) {
          notify?.("Não foi possível transferir. Nada foi alterado, tente novamente.", "err");
          return;
        }

        // 2º passo — remove da origem só depois do destino confirmado.
        const { error: erroOrigem } = await updatePending(
          selected.id, { items: novosOrigem, total: totalOrigem }, { baseItems: itens },
        );
        if (erroOrigem) {
          // Destino já recebeu os itens e origem intacta: tenta reverter o
          // destino ao estado original (compensação). Se a reversão falhar,
          // os itens podem ficar duplicados (visível/recuperável), nunca
          // sumidos.
          const totalDestinoOrig = totalItensAtivos(itensDestinoOrig);
          const { error: erroCompensacao } = await updatePending(
            destinoId, { items: itensDestinoOrig, total: totalDestinoOrig }, { baseItems: novosDestino },
          );
          if (erroCompensacao) {
            notify?.("Atenção: os itens podem ter ficado duplicados. Confira as duas comandas.", "err");
          } else {
            notify?.("Não foi possível transferir. Nada foi alterado, tente novamente.", "err");
          }
          return;
        }
      }

      const qtdTransf = aTransferir.reduce((s, x) => s + x.qty, 0);
      logAction(currentUser?.username, "itens:transferir", { msg: `Transferência: ${qtdTransf} item(ns) de ${fmtComanda(selected.comanda)} → ${nomeDestino}`, name: currentUser?.name, role: currentUser?.role, de: selected.comanda, para: nomeDestino, qtd: qtdTransf });

      const itensAtivosRestantes = itensNaoCancelados(novosOrigem);
      if (itensAtivosRestantes.length === 0) {
        const { error } = await removePending(selected.id);
        if (error) notify?.("Itens transferidos, mas a comanda de origem vazia não pôde ser removida.", "err");
        setSelected(null);
        setMode("grid");
      } else {
        setSelected(prev => ({ ...prev, items: novosOrigem, total: totalOrigem }));
      }
      setShowTransferir(false);
    } finally {
      setTransferindo(false);
    }
  };

  return { abrirTransferir, handleTransferir };
}
