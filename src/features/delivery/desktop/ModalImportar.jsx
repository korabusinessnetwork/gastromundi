import { LuX } from "react-icons/lu";
import { createPortal } from "react-dom";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { formatarReais } from "@/features/delivery/regras/admin";
import { useMemo, useState } from "react";


// ════════════════════════════════════════════════════════════════
// Escolher O QUE importar do PDV
//
// Antes o botão trazia TODOS os produtos de uma vez, sem perguntar. Num
// cardápio de cem itens, quem queria publicar dez tinha de importar os
// cem e sair removendo — e cada remoção é um clique com confirmação.
// Aqui a lista vem toda marcada (o caso comum continua sendo "traz
// tudo", e ele segue a um clique), com busca e categoria para desmarcar
// o que não vai.
// ════════════════════════════════════════════════════════════════
export default function ModalImportar({ candidatos, importando, onFechar, onConfirmar }) {
  const fundoImp = fecharAoClicarFora(onFechar);
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("Todas");
  const [marcados, setMarcados] = useState(() => new Set(candidatos.map((p) => String(p.id))));

  const categorias = useMemo(
    () => ["Todas", ...new Set(candidatos.map((p) => p.category).filter(Boolean))].sort(
      (a, b) => (a === "Todas" ? -1 : b === "Todas" ? 1 : a.localeCompare(b, "pt-BR")),
    ),
    [candidatos],
  );

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return candidatos.filter(
      (p) =>
        (cat === "Todas" || p.category === cat) &&
        (!t || (p.name ?? "").toLowerCase().includes(t)),
    );
  }, [candidatos, busca, cat]);

  const alternar = (id) =>
    setMarcados((prev) => {
      const nova = new Set(prev);
      const k = String(id);
      if (nova.has(k)) nova.delete(k);
      else nova.add(k);
      return nova;
    });

  // "Marcar todos" age só sobre o que está VISÍVEL. Mexer no que o filtro
  // escondeu seria alterar o que a pessoa não está vendo.
  const idsVisiveis = visiveis.map((p) => String(p.id));
  const todosVisiveisMarcados = idsVisiveis.length > 0 && idsVisiveis.every((id) => marcados.has(id));
  const alternarVisiveis = () =>
    setMarcados((prev) => {
      const nova = new Set(prev);
      for (const id of idsVisiveis) {
        if (todosVisiveisMarcados) nova.delete(id);
        else nova.add(id);
      }
      return nova;
    });

  return createPortal(
    <div className="delivery-view__overlay" {...fundoImp}>
      <div className="delivery-view__modal">
        <div className="delivery-view__modal-topo">
          <div className="delivery-view__modal-titulo">Importar do PDV</div>
          <button onClick={onFechar} className="delivery-view__modal-fechar" aria-label="Fechar">
            <LuX size={18} />
          </button>
        </div>

        <div className="delivery-view__aviso delivery-view__aviso--info">
          Já vem tudo marcado. Desmarque o que não deve aparecer no cardápio online.
          Nome e preço continuam vindo do PDV.
        </div>

        <div className="delivery-view__campo-linha">
          <div className="delivery-view__campo delivery-view__campo--flex">
            <input
              className="delivery-view__input"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto…"
              aria-label="Buscar produto para importar"
            />
          </div>
          <div className="delivery-view__campo delivery-view__campo--flex">
            <select
              className="delivery-view__input"
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              aria-label="Filtrar por categoria"
            >
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="delivery-view__import-cabeca">
          <button type="button" onClick={alternarVisiveis} className="delivery-view__btn delivery-view__btn--sm">
            {todosVisiveisMarcados ? "Desmarcar estes" : "Marcar estes"}
          </button>
          <span className="delivery-view__hint">
            {marcados.size} de {candidatos.length} marcados
          </span>
        </div>

        <div className="delivery-view__import-lista">
          {visiveis.length === 0 ? (
            <div className="delivery-view__hint">Nenhum produto com esse filtro.</div>
          ) : (
            visiveis.map((p) => (
              <label key={p.id} className="delivery-view__import-item">
                <input
                  type="checkbox"
                  checked={marcados.has(String(p.id))}
                  onChange={() => alternar(p.id)}
                />
                <span className="delivery-view__item-nome">{p.name}</span>
                <span className="delivery-view__hint">{p.category}</span>
                <span className="delivery-view__item-preco">{formatarReais(p.price)}</span>
              </label>
            ))
          )}
        </div>

        <div className="delivery-view__modal-botoes">
          <button onClick={onFechar} className="delivery-view__btn delivery-view__btn--secundario">
            Cancelar
          </button>
          <button
            onClick={() => onConfirmar([...marcados])}
            disabled={importando || marcados.size === 0}
            className="delivery-view__btn delivery-view__btn--primario"
          >
            {importando ? "Importando…" : `Importar ${marcados.size}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
