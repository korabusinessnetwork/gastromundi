import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuTrash2, LuX, LuPlus, LuUtensils, LuClipboardList, LuArrowLeft
} from "react-icons/lu";
import {
  alternarProdutoId, vincularGrupoProduto, desvincularGrupoProduto, salvarGrupoComplemento, removerGrupoComplemento, salvarComplemento, removerComplemento, subgrupoCriaCiclo, vincularSubgrupo, desvincularSubgrupo, reordenarSubgrupos, formatarReais
} from "@/lib/deliveryAdmin";
import ListaArrastavel from "@/components/shared/ListaArrastavel";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import SeletorProdutoComplemento from "./SeletorProdutoComplemento";
import SeletorSubgrupo from "./SeletorSubgrupo";
import SeletorProdutosMulti from "./SeletorProdutosMulti";

// Menu de edição LIMPO de um grupo. Abre a partir de um card da grade
// (GrupoCardMini). Header com "voltar" + nome; corpo com regras (mín/máx),
// itens do grupo e a busca multi-seleção de "aparece nestes produtos".
export default function GrupoEditor({ isAdmin, grupo, biblioteca = [], products, itensCardapio = [], aviso, recarregar, onVoltar, onRemovido }) {
  // ── Rascunho local — NADA persiste até "Salvar" ─────────────────────
  // Todo o editor é um rascunho: nome, mín/máx, itens e "aparece nestes
  // produtos" ficam só na memória. "Salvar" grava tudo de uma vez; "Voltar"
  // com pendências pede confirmação. Assim o dono nunca altera um grupo sem
  // querer — o que estava salvo fica intacto até ele confirmar.
  const mapItem = (it) => ({ id: it.id, produto_id: it.produto_id, nome: it.nome, preco: it.preco });
  const [nome, setNome] = useState(grupo.nome);
  const [min, setMin] = useState(String(grupo.min_escolhas ?? 0));
  const [max, setMax] = useState(String(grupo.max_escolhas ?? 1));
  const [itens, setItens] = useState(() => (grupo.itens || []).map(mapItem));
  const [produtoIds, setProdutoIds] = useState(grupo.produtoIds ?? []);
  // Subgrupos aninhados (estilo iFood): ids dos grupos-filho, em ordem.
  const [subgrupoIds, setSubgrupoIds] = useState(() => (grupo.subgrupoIds ?? []).map(String));
  const [selecionadoProd, setSelecionadoProd] = useState(null);
  const [novoPreco, setNovoPreco] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmarVoltar, setConfirmarVoltar] = useState(false);
  const [confirmarRemover, setConfirmarRemover] = useState(false);

  // Ressincroniza o rascunho quando o grupo é recarregado do servidor (só
  // acontece após salvar/remover — durante a edição a referência do grupo é
  // estável, então edições em andamento nunca são perdidas por re-render).
  useEffect(() => {
    setNome(grupo.nome);
    setMin(String(grupo.min_escolhas ?? 0));
    setMax(String(grupo.max_escolhas ?? 1));
    setItens((grupo.itens || []).map(mapItem));
    setProdutoIds(grupo.produtoIds ?? []);
    setSubgrupoIds((grupo.subgrupoIds ?? []).map(String));
    setSelecionadoProd(null);
    setNovoPreco("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo]);

  // Há algo diferente do que está salvo? Controla o botão "Salvar" e o
  // aviso ao voltar.
  const sujo = useMemo(() => {
    if ((nome ?? "").trim() !== (grupo.nome ?? "")) return true;
    if ((Number(min) || 0) !== (Number(grupo.min_escolhas) || 0)) return true;
    if ((Number(max) || 1) !== (Number(grupo.max_escolhas) || 1)) return true;
    if (itens.some((i) => !i.id)) return true; // itens novos ainda não salvos
    // Ordem importa (reordenar arrastando também é alteração a salvar):
    // compara os ids preservando a sequência, não como conjunto ordenado.
    const idsOrig = (grupo.itens || []).map((i) => String(i.id));
    const idsAtual = itens.filter((i) => i.id).map((i) => String(i.id));
    if (idsOrig.length !== idsAtual.length) return true;
    if (idsOrig.some((v, k) => v !== idsAtual[k])) return true;
    const pOrig = (grupo.produtoIds || []).map(String).sort();
    const pAtual = produtoIds.map(String).sort();
    if (pOrig.length !== pAtual.length) return true;
    if (pOrig.some((v, k) => v !== pAtual[k])) return true;
    // Subgrupos: ordem também conta (arrastar reordena) → compara em sequência.
    const sOrig = (grupo.subgrupoIds || []).map(String);
    const sAtual = subgrupoIds.map(String);
    if (sOrig.length !== sAtual.length) return true;
    if (sOrig.some((v, k) => v !== sAtual[k])) return true;
    return false;
  }, [nome, min, max, itens, produtoIds, subgrupoIds, grupo]);

  // Marca/desmarca "aparece nestes produtos" — só no rascunho.
  const alternarProduto = (produtoId) => {
    setProdutoIds((prev) => alternarProdutoId(prev, produtoId));
  };

  // produto_id já no rascunho — não deixa adicionar o mesmo item duas vezes.
  const idsNoGrupo = itens.map((it) => it.produto_id).filter((x) => x != null);

  const escolherProduto = (prod) => {
    setSelecionadoProd(prod);
    // Pré-preenche o preço com o do PDV, mas fica editável (preço do
    // delivery pode ser diferente do balcão — decisão do dono).
    setNovoPreco(prod?.price != null ? String(prod.price) : "");
  };

  // Adiciona o item só ao rascunho (o id nasce quando "Salvar" gravar).
  const addItem = () => {
    if (!selecionadoProd) return;
    setItens((prev) => [
      ...prev,
      {
        _tempId: `novo-${Date.now()}`,
        produto_id: selecionadoProd.id,
        nome: selecionadoProd.name,
        preco: parseFloat(String(novoPreco).replace(",", ".")) || 0,
      },
    ]);
    setSelecionadoProd(null);
    setNovoPreco("");
  };

  // Remove o item do rascunho (some do banco só quando "Salvar" rodar).
  const removerItem = (item) => {
    setItens((prev) => prev.filter((x) => (x.id ?? x._tempId) !== (item.id ?? item._tempId)));
  };

  // Reordena os itens do rascunho pela nova ordem de ids (arrastar). Só
  // muda a sequência local; persiste ao "Salvar".
  const reordenarItens = (idsEmOrdem) => {
    setItens((prev) => {
      const chave = (x) => String(x.id ?? x._tempId);
      const porId = new Map(prev.map((x) => [chave(x), x]));
      return idsEmOrdem.map((id) => porId.get(String(id))).filter(Boolean);
    });
  };

  // ── Subgrupos (grupos aninhados, recicláveis) ───────────────────────
  // A biblioteca inteira, indexada por id, para resolver nome/resumo do
  // subgrupo a partir do id guardado no rascunho.
  const bibliotecaPorId = useMemo(() => {
    const m = new Map();
    for (const g of biblioteca || []) m.set(String(g.id), g);
    return m;
  }, [biblioteca]);

  // Anexa um grupo existente como subgrupo (só rascunho). O seletor já
  // exclui candidatos que criariam ciclo, mas revalidamos por garantia.
  const addSubgrupo = (grupoFilho) => {
    const fid = String(grupoFilho.id);
    setSubgrupoIds((prev) => {
      if (prev.includes(fid)) return prev;
      if (subgrupoCriaCiclo(biblioteca, grupo.id, fid)) return prev;
      return [...prev, fid];
    });
  };

  const removerSubgrupo = (filhoId) => {
    setSubgrupoIds((prev) => prev.filter((x) => x !== String(filhoId)));
  };

  const reordenarSubs = (idsEmOrdem) => {
    setSubgrupoIds(idsEmOrdem.map(String));
  };

  // Candidatos a subgrupo: todo grupo da biblioteca menos ele mesmo, os
  // já anexados e os que fechariam um ciclo (prevenção de erro > erro).
  const candidatosSubgrupo = useMemo(
    () =>
      (biblioteca || []).filter((g) => {
        const gid = String(g.id);
        if (gid === String(grupo.id)) return false;
        if (subgrupoIds.includes(gid)) return false;
        if (subgrupoCriaCiclo(biblioteca, grupo.id, gid)) return false;
        return true;
      }),
    [biblioteca, grupo.id, subgrupoIds]
  );

  // Grava TUDO de uma vez: config do grupo, itens (novos/removidos) e vínculos.
  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);

    // 1) Config do grupo (nome, mín, máx).
    const g = await salvarGrupoComplemento({
      id: grupo.id, nome: nome.trim() || grupo.nome,
      min_escolhas: Number(min) || 0, max_escolhas: Number(max) || 1, ordem: grupo.ordem,
    });
    if (g.error) { setSalvando(false); return aviso("Não foi possível salvar o grupo.", "err"); }

    // 2) Itens: remove os tirados, grava o resto NA ORDEM do rascunho.
    // Percorrer `itens` em ordem e gravar ordem = índice persiste tanto os
    // novos quanto a reordenação por arrasto (upsert atualiza os que já têm id).
    const idsAtuais = new Set(itens.filter((i) => i.id).map((i) => String(i.id)));
    const removidos = (grupo.itens || []).filter((o) => !idsAtuais.has(String(o.id)));
    for (const it of removidos) {
      const { error } = await removerComplemento(it.id);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar os itens.", "err"); }
    }
    for (let k = 0; k < itens.length; k++) {
      const it = itens[k];
      const { error } = await salvarComplemento({
        id: it.id, grupo_id: grupo.id, produto_id: it.produto_id, nome: it.nome,
        preco: it.preco, disponivel: true, ordem: k,
      });
      if (error) { setSalvando(false); return aviso("Não foi possível salvar os itens.", "err"); }
    }

    // 3) "Aparece nestes produtos": vincula os novos, desvincula os tirados.
    const pOrig = (grupo.produtoIds || []).map(String);
    const pAtual = produtoIds.map(String);
    for (const pid of pAtual.filter((x) => !pOrig.includes(x))) {
      const { error } = await vincularGrupoProduto(grupo.id, pid);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar onde o grupo aparece.", "err"); }
    }
    for (const pid of pOrig.filter((x) => !pAtual.includes(x))) {
      const { error } = await desvincularGrupoProduto(grupo.id, pid);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar onde o grupo aparece.", "err"); }
    }

    // 4) Subgrupos aninhados: desanexa os tirados, anexa os novos e grava
    // a ordem final (arrastar reordena). Diff por id, ordem = índice.
    const sOrig = (grupo.subgrupoIds || []).map(String);
    const sAtual = subgrupoIds.map(String);
    for (const fid of sOrig.filter((x) => !sAtual.includes(x))) {
      const { error } = await desvincularSubgrupo(grupo.id, fid);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar os subgrupos.", "err"); }
    }
    for (let k = 0; k < sAtual.length; k++) {
      const { error } = await vincularSubgrupo(grupo.id, sAtual[k], k);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar os subgrupos.", "err"); }
    }
    // Reforça a ordem dos que já existiam (o upsert com ignoreDuplicates
    // não atualiza a ordem de um vínculo pré-existente).
    if (sAtual.length > 0) {
      const { error } = await reordenarSubgrupos(grupo.id, sAtual);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar os subgrupos.", "err"); }
    }

    setSalvando(false);
    aviso("Grupo salvo.", "ok");
    await recarregar(); // recarrega → o effect ressincroniza o rascunho.
  };

  // Voltar: se há rascunho pendente, confirma antes de descartar.
  const tentarVoltar = () => {
    if (sujo) { setConfirmarVoltar(true); return; }
    onVoltar();
  };

  // Remove o grupo inteiro (ação destrutiva — só após confirmar no modal).
  const removerGrupo = async () => {
    const { error } = await removerGrupoComplemento(grupo.id);
    if (error) return aviso("Não foi possível remover o grupo.", "err");
    setConfirmarRemover(false);
    await recarregar();
    onRemovido?.();
  };

  return (
    <div className="delivery-view__editor">
      {/* Header do editor: voltar + título + Salvar (trava de tudo) */}
      <div className="delivery-view__editor-topo">
        <button
          type="button"
          onClick={tentarVoltar}
          className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--voltar"
        >
          <LuArrowLeft size={15} /> Voltar
        </button>
        <span className="delivery-view__editor-titulo">
          <span className="delivery-view__editor-titulo-rotulo">nome: </span>
          {nome || grupo.nome}
        </span>
        {isAdmin && (
          <>
            {sujo && (
              <span className="delivery-view__hint delivery-view__editor-sujo">
                Alterações não salvas
              </span>
            )}
            <button
              type="button"
              onClick={salvar}
              disabled={!sujo || salvando}
              className={`delivery-view__btn delivery-view__btn--sm delivery-view__btn--salvar delivery-view__btn--${sujo ? "primario" : "inerte"}`}
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </>
        )}
      </div>

    <div className="delivery-view__editor-caixa">
      <div className="delivery-view__editor-linha">
        <input
          className="delivery-view__input delivery-view__input--titulo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={!isAdmin}
          maxLength={60}
        />
        {/* Obrigatório × Opcional — o cliente é obrigado a marcar este grupo?
            Seletor explícito no lugar do número cru "mín": opcional → min=0,
            obrigatório → min≥1. O dono escolhe em palavras, sem pensar em
            número (Princípio nº1 — intuitividade acima de densidade). */}
        <div
          role="group"
          aria-label="O cliente é obrigado a escolher neste grupo?"
          className="delivery-view__segmentado"
        >
          {[
            { obrig: false, texto: "Opcional" },
            { obrig: true, texto: "Obrigatório" },
          ].map((opt) => {
            const ativo = (Number(min) > 0) === opt.obrig;
            return (
              <button
                key={opt.texto}
                type="button"
                aria-pressed={ativo}
                disabled={!isAdmin}
                onClick={() => isAdmin && setMin(opt.obrig ? String(Math.max(1, Number(min) || 0)) : "0")}
                className={`delivery-view__editor-toggle${ativo ? " delivery-view__editor-toggle--ativo" : ""}`}
              >
                {opt.texto}
              </button>
            );
          })}
        </div>
        <label className="delivery-view__hint delivery-view__editor-max">
          máx
          <input className="delivery-view__input delivery-view__input--qtd" type="number" min="1" value={max} onChange={(e) => setMax(e.target.value)} disabled={!isAdmin} />
        </label>
        {isAdmin && (
          <button
            onClick={() => setConfirmarRemover(true)}
            title="Remover grupo"
            className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--remover-grupo"
          >
            <LuTrash2 size={13} />
          </button>
        )}
      </div>
      <div className="delivery-view__hint delivery-view__editor-explica">
        {Number(min) > 0
          ? `Obrigatório, o cliente precisa escolher ${Number(max) > 1 ? `de ${min || 1} a ${max}` : "1 opção"}`
          : `Opcional, o cliente pode escolher ${Number(max) > 1 ? `até ${max}` : "1, se quiser"}`}
      </div>

      {/* Itens do grupo — arraste pela alça (⠿) para reordenar (cima/baixo).
          A ordem aqui é a mesma que o cliente vê na vitrine. */}
      <div className="delivery-view__editor-itens">
        <ListaArrastavel
          itens={itens}
          idDe={(it) => it.id ?? it._tempId}
          onReordenar={reordenarItens}
          renderItem={(it, { alca }) => (
            <div className="delivery-view__item-linha delivery-view__item-linha--compacta">
              {isAdmin && <span {...alca}>⠿</span>}
              <span className="delivery-view__item-nome">{it.nome}</span>
              <span className="delivery-view__item-preco">
                {Number(it.preco) > 0 ? `+ ${formatarReais(it.preco)}` : "Grátis"}
              </span>
              {isAdmin && (
                <button
                  onClick={() => removerItem(it)}
                  className="delivery-view__modal-fechar"
                >
                  <LuX size={14} />
                </button>
              )}
            </div>
          )}
        />
      </div>

      {isAdmin && (
        <div className="delivery-view__add-item">
          {selecionadoProd ? (
            // Produto escolhido: mostra o item + preço (editável) + confirmar.
            <>
              <div className="delivery-view__selecionado">
                {selecionadoProd.emoji && <span>{selecionadoProd.emoji}</span>}
                <span className="delivery-view__selecionado-nome">{selecionadoProd.name}</span>
                <button
                  type="button"
                  onClick={() => { setSelecionadoProd(null); setNovoPreco(""); }}
                  className="delivery-view__modal-fechar delivery-view__modal-fechar--accent"
                  title="Trocar item"
                >
                  <LuX size={14} />
                </button>
              </div>
              <input className="delivery-view__input delivery-view__input--preco" type="number" min="0" step="0.01" value={novoPreco} onChange={(e) => setNovoPreco(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="R$ 0,00" />
              <button onClick={addItem} className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--primario delivery-view__btn--add-item">
                <LuPlus size={13} /> Adicionar
              </button>
            </>
          ) : (
            // Ainda escolhendo: menu de busca dos produtos já criados.
            <SeletorProdutoComplemento
              products={products}
              idsExcluir={idsNoGrupo}
              onEscolher={escolherProduto}
            />
          )}
        </div>
      )}

      {/* Subgrupos aninhados (estilo iFood): anexa OUTROS grupos da
          biblioteca dentro deste. Cada subgrupo continua reutilizável
          sozinho — aqui só se reaproveita. Arraste pela alça pra ordenar. */}
      {isAdmin && (
        <div className="delivery-view__editor-secao">
          <div className="delivery-view__secao-titulo">
            <LuClipboardList size={12} className="delivery-view__secao-icone" /> Subgrupos deste grupo
          </div>
          <div className="delivery-view__hint delivery-view__secao-desc">
            Reaproveite grupos já criados aqui dentro. Cada subgrupo mantém suas próprias
            regras (obrigatório/opcional) e continua disponível sozinho em outros produtos.
          </div>

          {subgrupoIds.length > 0 && (
            <div className="delivery-view__secao-lista">
              <ListaArrastavel
                itens={subgrupoIds}
                idDe={(id) => id}
                onReordenar={reordenarSubs}
                renderItem={(id, { alca }) => {
                  const sub = bibliotecaPorId.get(String(id));
                  const nSub = (sub?.itens || []).length;
                  const obrig = Number(sub?.min_escolhas) > 0;
                  return (
                    <div className="delivery-view__item-linha">
                      <span {...alca}>⠿</span>
                      <span className="delivery-view__item-nome delivery-view__item-nome--forte">
                        {sub?.nome || "(grupo removido)"}
                      </span>
                      <span className="delivery-view__hint">
                        {obrig ? "Obrigatório" : "Opcional"} · {nSub} {nSub === 1 ? "item" : "itens"}
                      </span>
                      <button
                        onClick={() => removerSubgrupo(id)}
                        className="delivery-view__modal-fechar"
                        title="Remover subgrupo (não apaga o grupo)"
                      >
                        <LuX size={14} />
                      </button>
                    </div>
                  );
                }}
              />
            </div>
          )}

          {candidatosSubgrupo.length > 0 ? (
            <SeletorSubgrupo candidatos={candidatosSubgrupo} onEscolher={addSubgrupo} />
          ) : (
            <div className="delivery-view__hint">
              {biblioteca.length <= 1
                ? "Crie outros grupos na biblioteca para reaproveitá-los aqui como subgrupos."
                : "Nenhum outro grupo disponível para anexar aqui."}
            </div>
          )}
        </div>
      )}

      {/* Onde este grupo aparece — busca multi-seleção dos produtos do cardápio. */}
      {isAdmin && (
        <div className="delivery-view__editor-secao">
          <div className="delivery-view__secao-titulo delivery-view__secao-titulo--respiro">
            <LuUtensils size={12} className="delivery-view__secao-icone" /> Aparece nestes produtos
          </div>
          {itensCardapio.length === 0 ? (
            <div className="delivery-view__hint">
              Adicione produtos ao cardápio para vincular este grupo a eles.
            </div>
          ) : (
            <SeletorProdutosMulti
              itens={itensCardapio}
              produtoIds={produtoIds}
              vinculando={false}
              onAlternar={alternarProduto}
            />
          )}
        </div>
      )}
    </div>

      {/* Confirmação ao voltar com rascunho pendente (avisa e confirma) */}
      {confirmarVoltar && createPortal(
        <div className="delivery-view__overlay" {...fecharAoClicarFora(() => setConfirmarVoltar(false))}>
          <div className="delivery-view__modal delivery-view__modal--estreito">
            <div className="delivery-view__modal-topo">
              <div className="delivery-view__modal-titulo">Alterações não salvas</div>
              <button onClick={() => setConfirmarVoltar(false)} className="delivery-view__modal-fechar">
                <LuX size={18} />
              </button>
            </div>
            <div className="delivery-view__modal-texto">
              Você tem alterações não salvas neste grupo. Se sair agora, elas serão descartadas e o grupo continua como estava.
            </div>
            <div className="delivery-view__modal-botoes">
              <button onClick={() => setConfirmarVoltar(false)} className="delivery-view__btn delivery-view__btn--secundario">
                Continuar editando
              </button>
              <button onClick={() => { setConfirmarVoltar(false); onVoltar(); }} className="delivery-view__btn delivery-view__btn--perigo">
                Descartar e sair
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmação da remoção do grupo inteiro (ação destrutiva) */}
      {confirmarRemover && createPortal(
        <div className="delivery-view__overlay" {...fecharAoClicarFora(() => setConfirmarRemover(false))}>
          <div className="delivery-view__modal delivery-view__modal--estreito">
            <div className="delivery-view__modal-topo">
              <div className="delivery-view__modal-titulo">Remover grupo</div>
              <button onClick={() => setConfirmarRemover(false)} className="delivery-view__modal-fechar">
                <LuX size={18} />
              </button>
            </div>
            <div className="delivery-view__modal-texto">
              Remover o grupo <strong>{grupo.nome}</strong>? Ele deixará de aparecer em todos os produtos vinculados. Essa ação não pode ser desfeita.
            </div>
            <div className="delivery-view__modal-botoes">
              <button onClick={() => setConfirmarRemover(false)} className="delivery-view__btn delivery-view__btn--secundario">
                Cancelar
              </button>
              <button onClick={removerGrupo} className="delivery-view__btn delivery-view__btn--perigo">
                Remover grupo
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
