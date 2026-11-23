import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  listarCombos, listarSubprodutosAtivos, alterarSituacaoCombo, excluirCombo
} from "@/features/cardapio/dados/combos";
import { useCatalogo } from "@/context/AppContext";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import {
  LuPlus, LuPencil, LuPackage, LuTrash2, LuTriangleAlert
} from "react-icons/lu";
import "./CombosView.css";
import ModalCombo from "./combos/ModalCombo";
import { fmtBRL } from "./combos/apoio";

export default function CombosView({ sz }) {
  const { products } = useCatalogo();
  const [combos,      setCombos]      = useState([]);
  const [subprodutos, setSubprodutos] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(false);
  const [editando,    setEditando]    = useState(null);
  const [busca,       setBusca]       = useState("");
  const [excluindo,   setExcluindo]   = useState(null); // combo pendente de exclusão
  const [deletando,   setDeletando]   = useState(false);
  const [erroDelete,  setErroDelete]  = useState("");
  const [erroTela,    setErroTela]    = useState("");

  const carregar = async () => {
    setLoading(true);
    setErroTela("");
    const [{ data: c, error: erroCombos }, { data: s, error: erroSubs }] = await Promise.all([
      listarCombos(),
      listarSubprodutosAtivos(),
    ]);
    // Sem isto, uma falha de leitura virava "Nenhum combo cadastrado" — e o
    // usuário recriava combos que já existem.
    if (erroCombos || erroSubs) {
      setErroTela("Não deu para carregar os combos. Recarregue a página.");
    } else {
      setCombos(c ?? []);
      setSubprodutos(s ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo   = () => { setEditando(null); setModal(true); };
  const abrirEditar = (c) => { setEditando(c); setModal(true); };
  const fecharModal = () => { setModal(false); setEditando(null); };
  const aoSalvar    = () => { fecharModal(); carregar(); };

  // Otimista com desfazer: o toggle responde na hora, mas se o banco recusa a
  // chave volta para onde estava. Antes ela ficava mostrando "ativo" para um
  // combo que continuava desativado no cardápio do cliente.
  const toggleAtivo = async (c) => {
    setErroTela("");
    setCombos(prev => prev.map(x => x.id === c.id ? { ...x, ativo: !x.ativo } : x));
    const { error } = await alterarSituacaoCombo(c.id, !c.ativo);
    if (error) {
      setCombos(prev => prev.map(x => x.id === c.id ? { ...x, ativo: c.ativo } : x));
      setErroTela("Não deu para mudar a situação do combo. Tente de novo.");
    }
  };

  // Excluir combo — as junções (combo_subprodutos/combo_produtos) somem em
  // cascata (FK ON DELETE CASCADE); os produtos/subprodutos do catálogo em si
  // não são tocados. Ação destrutiva → confirmação obrigatória.
  const confirmarExcluir = async () => {
    if (!excluindo || deletando) return;
    setDeletando(true);
    setErroDelete("");
    const { error } = await excluirCombo(excluindo.id);
    if (error) {
      setErroDelete(error.message ?? "Não foi possível excluir o combo.");
      setDeletando(false);
      return;
    }
    setCombos(prev => prev.filter(x => x.id !== excluindo.id));
    setDeletando(false);
    setExcluindo(null);
  };

  const listafiltrada = combos.filter(c =>
    !busca || c.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const prodMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);

  return (
    <div className="combos-view">

      {/* Header */}
      <div className="combos-view__header" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
        <div className="combos-view__header-esquerda">
          <div className="combos-view__contagem">{combos.length} combo{combos.length !== 1 ? "s" : ""}</div>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar combo..."
            className="combos-view__busca"
          />
        </div>
        <button
          onClick={abrirNovo}
          className="combos-view__btn-criar"
        >
          <LuPlus size={15} /> Criar Combo
        </button>
      </div>

      {/* Lista */}
      <div className="combos-view__lista-area" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
        {erroTela && (
          <div className="combos-view__erro" role="alert">{erroTela}</div>
        )}
        {loading ? (
          <div className="combos-view__estado">Carregando…</div>
        ) : erroTela && combos.length === 0 ? (
          // Lista vazia por falha de leitura não é lista vazia: o aviso acima
          // já explica. Dizer "Nenhum combo criado" aqui contradiz o aviso.
          null
        ) : listafiltrada.length === 0 ? (
          <div className="combos-view__vazio">
            <LuPackage size={40} style={{ opacity: 0.2 }} />
            <div className="combos-view__vazio-texto" style={{ fontWeight: 600 }}>{busca ? "Nenhum resultado" : "Nenhum combo criado"}</div>
          </div>
        ) : (
          <div className="combos-view__lista">
            {listafiltrada.map(c => {
              const prod = prodMap[c.item_principal_id];
              const qtdSubs = c.combo_subprodutos?.length ?? 0;
              const qtdProds = c.combo_produtos?.length ?? 0;
              const compParts = [];
              if (qtdProds > 0) compParts.push(`${qtdProds} produto${qtdProds !== 1 ? "s" : ""}`);
              if (qtdSubs > 0) compParts.push(`${qtdSubs} subproduto${qtdSubs !== 1 ? "s" : ""}`);
              const composicao = compParts.join(" · ") || "só o principal";
              return (
                <div
                  key={c.id}
                  className="combos-view__card"
                  style={{ padding: `${sz.padSm}px ${sz.pad}px`, opacity: c.ativo ? 1 : 0.55 }}
                >
                  {/* Ícone */}
                  <div className="combos-view__card-icone" style={{ background: alfa(C.accent, "15"), border: `1px solid ${alfa(C.accent, "33")}` }}>
                    {prod?.emoji ?? "🍽️"}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="combos-view__card-nome">{c.nome}</div>
                    <div className="combos-view__card-info">
                      {prod?.name ?? "Produto removido"} · {composicao}
                    </div>
                  </div>

                  {/* Preço */}
                  <div className="combos-view__card-preco">
                    {fmtBRL(c.preco_total)}
                  </div>

                  {/* Modo badge */}
                  <span className="combos-view__badge" style={{ background: c.modo === "substituir" ? alfa(C.blue, "18") : alfa(C.accent, "18"), color: c.modo === "substituir" ? varColor(C.blue) : varColor(C.accent) }}>
                    {c.modo === "substituir" ? "Substitui" : "Combo"}
                  </span>

                  {/* Status */}
                  <button
                    onClick={() => toggleAtivo(c)}
                    className="combos-view__badge-status"
                    style={{ background: c.ativo ? alfa(C.green, "18") : varColor(C.surface), color: c.ativo ? varColor(C.green) : varColor(C.muted) }}
                  >
                    {c.ativo ? "Ativo" : "Inativo"}
                  </button>

                  {/* Editar */}
                  <button
                    onClick={() => abrirEditar(c)}
                    className="combos-view__btn-editar"
                    title="Editar combo"
                  >
                    <LuPencil size={15} />
                  </button>

                  {/* Excluir */}
                  <button
                    onClick={() => { setErroDelete(""); setExcluindo(c); }}
                    className="combos-view__btn-excluir"
                    style={{ borderColor: alfa(C.red, "33"), background: alfa(C.red, "0c"), color: varColor(C.red) }}
                    title="Excluir combo"
                  >
                    <LuTrash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <ModalCombo
          combo={editando}
          products={products}
          subprodutos={subprodutos}
          onClose={fecharModal}
          onSalvo={aoSalvar}
          sz={sz}
        />
      )}

      {/* Confirmação de exclusão */}
      {excluindo && createPortal(
        <div {...fecharAoClicarFora(() => !deletando && setExcluindo(null))} className="combos-view__confirm-overlay">
          <div className="combos-view__confirm-modal">
            <div className="combos-view__confirm-topo">
              <div className="combos-view__confirm-icone" style={{ background: alfa(C.red, "18"), border: `1.5px solid ${alfa(C.red, "44")}` }}>
                <LuTriangleAlert size={22} color={varColor(C.red)} />
              </div>
              <div>
                <div className="combos-view__confirm-titulo">Excluir combo?</div>
                <div className="combos-view__confirm-sub">{prodMap[excluindo.item_principal_id]?.emoji ?? "🍽️"} <strong style={{ color: varColor(C.text) }}>{excluindo.nome}</strong></div>
              </div>
            </div>
            <div className="combos-view__confirm-aviso" style={{ background: alfa(C.red, "0d"), border: `1px solid ${alfa(C.red, "33")}` }}>
              Esta ação <strong style={{ color: varColor(C.red) }}>não pode ser desfeita</strong>. O combo será removido permanentemente. Os produtos e subprodutos do catálogo <strong>não</strong> são afetados.
            </div>
            {erroDelete && <div className="combos-view__erro" style={{ marginBottom: 12 }}>⚠ {erroDelete}</div>}
            <div className="combos-view__confirm-botoes">
              <button onClick={() => setExcluindo(null)} disabled={deletando} className="combos-view__confirm-btn-cancelar">Cancelar</button>
              <button onClick={confirmarExcluir} disabled={deletando} className="combos-view__confirm-btn-excluir" style={{ background: deletando ? varColor(C.faint) : varColor(C.red), cursor: deletando ? "not-allowed" : "pointer" }}>{deletando ? "Excluindo…" : "Sim, excluir"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
