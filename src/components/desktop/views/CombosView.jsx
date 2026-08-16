import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import { carregarGruposDoCombo, carregarTodosGrupos, salvarGrupos } from "@/lib/gruposEscolha";
import EditorGruposEscolha from "./EditorGruposEscolha";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuPlus, LuPencil, LuX, LuPackage, LuTrash2, LuTriangleAlert } from "react-icons/lu";
import "./CombosView.css";

// ── Helpers ────────────────────────────────────────────────────────

function fmtBRL(v) {
  return `R$ ${Number(v || 0).toFixed(2)}`;
}

// ── Modal de criar/editar combo ────────────────────────────────────
//
// Combo flexível = nome + preço + grupos de escolha (ex.: "Hambúrguer +
// Refri", onde o cliente escolhe qualquer hambúrguer e qualquer refri).
// Não tem mais produto principal fixo: a composição é definida pelos
// grupos, que o operador monta no EditorGruposEscolha.

function ModalCombo({ combo, products, onClose, onSalvo }) {
  const isEdit = !!combo;

  const [nome,     setNome]     = useState(combo?.nome ?? "");
  const [preco,    setPreco]    = useState(combo?.preco_total != null ? String(combo.preco_total) : "");
  const [grupos,   setGrupos]   = useState([]);
  const [carregandoGrupos, setCarregandoGrupos] = useState(isEdit);
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  // ao editar — carrega os grupos de escolha do combo
  useEffect(() => {
    if (!combo) return;
    let vivo = true;
    carregarGruposDoCombo(combo.id).then(({ data, error }) => {
      if (!vivo) return;
      if (error) setErro("Não deu para carregar os grupos deste combo.");
      else setGrupos(data);
      setCarregandoGrupos(false);
    });
    return () => { vivo = false; };
  }, [combo]);

  const salvar = async () => {
    if (!nome.trim()) { setErro("Informe o nome do combo."); return; }
    const precoNum = parseFloat(String(preco).replace(",", ".")) || 0;
    if (precoNum <= 0) { setErro("Informe o preço do combo."); return; }
    if (grupos.length === 0) { setErro("Adicione ao menos um grupo de escolha."); return; }
    setSalvando(true);
    setErro("");
    try {
      const payload = {
        nome:        nome.trim(),
        preco_total: precoNum,
        updated_at:  new Date().toISOString(),
      };

      let comboId = combo?.id;
      if (isEdit) {
        const { error } = await supabase.from("combos").update(payload).eq("id", comboId);
        if (error) throw error;
      } else {
        // Combo flexível nasce sem item_principal_id (agora nullable).
        const { data, error } = await supabase.from("combos").insert({ ...payload, ativo: true }).select("id").single();
        if (error) throw error;
        comboId = data.id;
      }

      const { error: errG } = await salvarGrupos({ comboId, grupos });
      if (errG) throw errG;

      onSalvo();
    } catch (e) {
      setErro(e.message ?? "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div {...fecharAoClicarFora(onClose)} className="combos-view__modal-overlay">
      <div className="combos-view__modal">

        {/* Título */}
        <div className="combos-view__modal-topo">
          <div className="combos-view__modal-titulo" style={{ fontWeight: 800 }}>{isEdit ? "Editar Combo" : "Criar Combo"}</div>
          <button onClick={onClose} className="combos-view__modal-fechar"><LuX size={20} /></button>
        </div>

        {/* Nome */}
        <div>
          <div className="combos-view__label">Nome do combo *</div>
          <input
            autoFocus
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex: Combo Hambúrguer + Refri"
            maxLength={100}
            className="combos-view__input"
          />
        </div>

        {/* Preço */}
        <div>
          <div className="combos-view__label">Preço do combo *</div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={preco}
            onChange={e => setPreco(e.target.value)}
            placeholder="Ex: 35,00"
            className="combos-view__input"
          />
          <div className="combos-view__ajuda" style={{ color: varColor(C.muted), fontSize: 12, marginTop: 6 }}>
            Preço fixo do combo. Opções com acréscimo somam a este valor na venda.
          </div>
        </div>

        {/* Grupos de escolha */}
        <div>
          <div className="combos-view__label">Grupos de escolha *</div>
          <div className="combos-view__ajuda" style={{ color: varColor(C.muted), fontSize: 12, marginBottom: 10 }}>
            Cada grupo é uma pergunta que o cliente responde no caixa. Ex.: um grupo "Escolha o hambúrguer" e outro "Escolha o refri".
          </div>
          {carregandoGrupos ? (
            <div className="combos-view__estado">Carregando grupos…</div>
          ) : (
            <EditorGruposEscolha grupos={grupos} onChange={setGrupos} products={products} />
          )}
        </div>

        {erro && <div className="combos-view__erro">⚠ {erro}</div>}

        <div className="combos-view__modal-botoes">
          <button onClick={onClose} className="combos-view__btn-cancelar">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="combos-view__btn-salvar" style={{ background: salvando ? varColor(C.faint) : varColor(C.accent), cursor: salvando ? "not-allowed" : "pointer" }}>
            {salvando ? "Salvando…" : isEdit ? "Salvar alterações" : "Criar combo"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── View principal ─────────────────────────────────────────────────

export default function CombosView({ sz }) {
  const { products } = useApp();
  const [combos,     setCombos]     = useState([]);
  const [gruposPorCombo, setGruposPorCombo] = useState({});
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState(false);
  const [editando,   setEditando]   = useState(null);
  const [busca,      setBusca]      = useState("");
  const [excluindo,  setExcluindo]  = useState(null); // combo pendente de exclusão
  const [deletando,  setDeletando]  = useState(false);
  const [erroDelete, setErroDelete] = useState("");
  const [erroTela,   setErroTela]   = useState("");

  const carregar = async () => {
    setLoading(true);
    setErroTela("");
    const [{ data: c, error: erroCombos }, { porCombo, error: erroGrupos }] = await Promise.all([
      supabase.from("combos").select("id, nome, preco_total, ativo, created_at").order("created_at", { ascending: false }),
      carregarTodosGrupos(),
    ]);
    // Sem isto, uma falha de leitura virava "Nenhum combo cadastrado" — e o
    // usuário recriava combos que já existem.
    if (erroCombos || erroGrupos) {
      setErroTela("Não deu para carregar os combos. Recarregue a página.");
    } else {
      setCombos(c ?? []);
      setGruposPorCombo(porCombo ?? {});
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
    const { error } = await supabase.from("combos").update({ ativo: !c.ativo, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) {
      setCombos(prev => prev.map(x => x.id === c.id ? { ...x, ativo: c.ativo } : x));
      setErroTela("Não deu para mudar a situação do combo. Tente de novo.");
    }
  };

  // Excluir combo — os grupos de escolha (e seus itens) somem em cascata
  // (FK ON DELETE CASCADE); os produtos do catálogo não são tocados. Ação
  // destrutiva → confirmação obrigatória.
  const confirmarExcluir = async () => {
    if (!excluindo || deletando) return;
    setDeletando(true);
    setErroDelete("");
    const { error } = await supabase.from("combos").delete().eq("id", excluindo.id);
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
              const qtdGrupos = gruposPorCombo[c.id]?.length ?? 0;
              const composicao = qtdGrupos > 0
                ? `${qtdGrupos} grupo${qtdGrupos !== 1 ? "s" : ""} de escolha`
                : "sem grupos";
              return (
                <div
                  key={c.id}
                  className="combos-view__card"
                  style={{ padding: `${sz.padSm}px ${sz.pad}px`, opacity: c.ativo ? 1 : 0.55 }}
                >
                  {/* Ícone */}
                  <div className="combos-view__card-icone" style={{ background: alfa(C.accent, "15"), border: `1px solid ${alfa(C.accent, "33")}` }}>
                    🍽️
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="combos-view__card-nome">{c.nome}</div>
                    <div className="combos-view__card-info">{composicao}</div>
                  </div>

                  {/* Preço */}
                  <div className="combos-view__card-preco">
                    {fmtBRL(c.preco_total)}
                  </div>

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
          onClose={fecharModal}
          onSalvo={aoSalvar}
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
                <div className="combos-view__confirm-sub">🍽️ <strong style={{ color: varColor(C.text) }}>{excluindo.nome}</strong></div>
              </div>
            </div>
            <div className="combos-view__confirm-aviso" style={{ background: alfa(C.red, "0d"), border: `1px solid ${alfa(C.red, "33")}` }}>
              Esta ação <strong style={{ color: varColor(C.red) }}>não pode ser desfeita</strong>. O combo será removido permanentemente. Os produtos do catálogo <strong>não</strong> são afetados.
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
