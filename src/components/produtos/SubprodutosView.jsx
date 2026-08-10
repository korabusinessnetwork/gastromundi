import { fecharAoClicarFora } from "@/lib/comum/overlayFechar";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import C from "@/constants/colors";
import { varColor } from "@/lib/tenant/tema";
import { alfa } from "@/constants/colorAlfa";
import {
  LuPlus, LuPencil, LuX, LuTriangleAlert, LuPackage, LuTrash2,
} from "react-icons/lu";
import "./SubprodutosView.css";

const CATEGORIAS = ["Acompanhamentos", "Bebidas", "Molhos", "Adicionais", "Sobremesas"];
const UNIDADES   = ["Unidade", "Porção", "Copo", "Dose"];

const EMPTY = {
  nome: "", categoria: "Acompanhamentos", preco: "",
  unidade_medida: "Unidade", controla_estoque: false, ativo: true,
  quantidade: "", minimo: "",
};

// B4 — o relacionamento estoque_subprodutos pode vir como objeto (1-pra-1)
// ou array de 1, dependendo da versão do PostgREST; normaliza aqui.
const estoqueDe = (s) => {
  const e = s?.estoque_subprodutos;
  return Array.isArray(e) ? (e[0] ?? null) : (e ?? null);
};

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="subprodutos-view__toggle"
      style={{ background: value ? varColor(C.green) : varColor(C.faint) }}
    >
      <span className="subprodutos-view__toggle-bolinha" style={{ left: value ? 22 : 2 }} />
    </button>
  );
}

function ModalSubproduto({ item, onClose, onSalvo, sz }) {
  const [form, setForm]       = useState(item ? {
    nome:             item.nome,
    categoria:        item.categoria ?? "Acompanhamentos",
    preco:            String(item.preco ?? ""),
    unidade_medida:   item.unidade_medida ?? "Unidade",
    controla_estoque: item.controla_estoque ?? false,
    ativo:            item.ativo ?? true,
    quantidade:       String(estoqueDe(item)?.quantidade ?? ""),
    minimo:           String(estoqueDe(item)?.minimo ?? ""),
  } : { ...EMPTY });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState("");

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    const nome = form.nome.trim();
    if (!nome)                       { setErro("Informe o nome.");           return; }
    const preco = parseFloat(String(form.preco).replace(",", "."));
    if (isNaN(preco) || preco < 0)   { setErro("Preço inválido.");           return; }
    const quantidade = form.controla_estoque ? parseFloat(String(form.quantidade || "0").replace(",", ".")) : null;
    const minimo     = form.controla_estoque ? parseFloat(String(form.minimo || "0").replace(",", "."))     : null;
    if (form.controla_estoque && (isNaN(quantidade) || quantidade < 0)) { setErro("Quantidade em estoque inválida."); return; }
    if (form.controla_estoque && (isNaN(minimo) || minimo < 0))         { setErro("Estoque mínimo inválido.");        return; }
    setSalvando(true);
    setErro("");
    const payload = {
      nome,
      categoria:        form.categoria,
      preco,
      unidade_medida:   form.unidade_medida,
      controla_estoque: form.controla_estoque,
      ativo:            form.ativo,
      updated_at:       new Date().toISOString(),
    };
    try {
      let subprodutoId = item?.id ?? null;
      if (item) {
        const { error } = await supabase.from("subprodutos").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("subprodutos").insert(payload).select("id").single();
        if (error) throw error;
        subprodutoId = data?.id ?? null;
      }
      // B4 — saldo de estoque do subproduto (tabela estoque_subprodutos),
      // mesmo padrão de upsert do estoque de produtos.
      if (form.controla_estoque && subprodutoId != null) {
        const { error } = await supabase
          .from("estoque_subprodutos")
          .upsert(
            { subproduto_id: subprodutoId, quantidade, minimo, updated_at: new Date().toISOString() },
            { onConflict: "subproduto_id" }
          );
        if (error) throw error;
      }
      onSalvo();
    } catch (e) {
      setErro(e.message ?? "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div
      {...fecharAoClicarFora(onClose)}
      className="subprodutos-view__modal-overlay"
    >
      <div className="subprodutos-view__modal">

        <div className="subprodutos-view__modal-topo">
          <div className="subprodutos-view__modal-titulo" style={{ fontWeight: 800 }}>{item ? "Editar Subproduto" : "Novo Subproduto"}</div>
          <button onClick={onClose} className="subprodutos-view__modal-fechar"><LuX size={20} /></button>
        </div>

        {/* Nome */}
        <div>
          <div className="subprodutos-view__label">Nome *</div>
          <input
            autoFocus
            value={form.nome}
            onChange={e => setF("nome", e.target.value)}
            onKeyDown={e => e.key === "Enter" && salvar()}
            placeholder="Ex: Fritas P, Coca-Cola Lata..."
            maxLength={80}
            className="subprodutos-view__input"
          />
        </div>

        {/* Categoria + Unidade lado a lado */}
        <div className="subprodutos-view__grid-dupla">
          <div>
            <div className="subprodutos-view__label">Categoria</div>
            <select value={form.categoria} onChange={e => setF("categoria", e.target.value)} className="subprodutos-view__select">
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="subprodutos-view__label">Unidade</div>
            <select value={form.unidade_medida} onChange={e => setF("unidade_medida", e.target.value)} className="subprodutos-view__select">
              {UNIDADES.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Preço */}
        <div>
          <div className="subprodutos-view__label">Preço unitário (R$) *</div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.preco}
            onChange={e => setF("preco", e.target.value)}
            placeholder="0,00"
            className="subprodutos-view__input subprodutos-view__input--num"
          />
        </div>

        {/* Toggles */}
        <div className="subprodutos-view__toggles">
          <div className="subprodutos-view__toggle-linha">
            <div>
              <div className="subprodutos-view__toggle-titulo">Controlar estoque</div>
              <div className="subprodutos-view__toggle-ajuda">Baixa estoque ao vender</div>
            </div>
            <Toggle value={form.controla_estoque} onChange={v => setF("controla_estoque", v)} />
          </div>
          {form.controla_estoque && (
            <div className="subprodutos-view__grid-dupla">
              <div>
                <div className="subprodutos-view__label">Qtd. em estoque</div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.quantidade}
                  onChange={e => setF("quantidade", e.target.value)}
                  placeholder="0"
                  className="subprodutos-view__input subprodutos-view__input--num"
                />
              </div>
              <div>
                <div className="subprodutos-view__label">Estoque mínimo</div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.minimo}
                  onChange={e => setF("minimo", e.target.value)}
                  placeholder="0"
                  className="subprodutos-view__input subprodutos-view__input--num"
                />
              </div>
            </div>
          )}
          <div className="subprodutos-view__toggle-linha">
            <div className="subprodutos-view__toggle-titulo">Ativo</div>
            <Toggle value={form.ativo} onChange={v => setF("ativo", v)} />
          </div>
        </div>

        {erro && <div className="subprodutos-view__erro">⚠ {erro}</div>}

        <div className="subprodutos-view__modal-botoes">
          <button onClick={onClose} className="subprodutos-view__btn-cancelar">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="subprodutos-view__btn-salvar" style={{ background: salvando ? varColor(C.faint) : varColor(C.accent), cursor: salvando ? "not-allowed" : "pointer" }}>
            {salvando ? "Salvando…" : item ? "Salvar alterações" : "Criar subproduto"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── View principal ─────────────────────────────────────────────────

export default function SubprodutosView({ sz }) {
  const [lista,     setLista]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [editando,  setEditando]  = useState(null);
  const [busca,     setBusca]     = useState("");
  const [catFiltro, setCatFiltro] = useState("Todos");
  const [excluindo, setExcluindo] = useState(null); // subproduto pendente de exclusão
  const [deletando, setDeletando] = useState(false);
  const [erroDelete, setErroDelete] = useState("");
  const [erroTela,  setErroTela]  = useState("");
  const [usoCombo,  setUsoCombo]  = useState({});   // { subproduto_id: qtd de combos que o usam }
  const [usoComboOk, setUsoComboOk] = useState(false); // a contagem acima é confiável?

  const carregar = async () => {
    setLoading(true);
    setErroTela("");
    // Além dos subprodutos, carrega quantos combos usam cada um: a FK
    // combo_subprodutos.subproduto_id é ON DELETE RESTRICT, então subproduto
    // em uso NÃO pode ser excluído — prevenimos o erro (Princípio nº 1) em
    // vez de deixar o banco recusar.
    const [{ data, error }, { data: usos, error: erroUsos }] = await Promise.all([
      supabase.from("subprodutos").select("*, estoque_subprodutos(quantidade, minimo)").order("nome"),
      supabase.from("combo_subprodutos").select("subproduto_id"),
    ]);
    // Falha de leitura não é lista vazia. Sem avisar, a tela dizia "Nenhum
    // subproduto cadastrado" e o operador recadastrava tudo por cima.
    if (error) {
      setErroTela("Não deu para carregar os subprodutos. Recarregue a página — a lista abaixo pode estar incompleta.");
    } else {
      setLista(data ?? []);
    }
    // Sem a contagem de uso em combos, a trava de exclusão cai e o banco
    // recusaria o delete com erro de FK. Melhor avisar e manter a trava.
    if (erroUsos) {
      setErroTela("Não deu para verificar quais subprodutos estão em combos. Recarregue a página antes de excluir qualquer um.");
    }
    const mapa = {};
    for (const u of usos ?? []) mapa[u.subproduto_id] = (mapa[u.subproduto_id] ?? 0) + 1;
    setUsoCombo(mapa);
    setUsoComboOk(!erroUsos);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo    = () => { setEditando(null); setModal(true); };
  const abrirEditar  = (s) => { setEditando(s); setModal(true); };
  const fecharModal  = () => { setModal(false); setEditando(null); };
  const aoSalvar     = () => { fecharModal(); carregar(); };

  // Otimista com desfazer: a gravação não era conferida, então o badge virava
  // "Inativo" na tela e o subproduto continuava à venda no cardápio.
  const toggleAtivo = async (s) => {
    setErroTela("");
    setLista(prev => prev.map(x => x.id === s.id ? { ...x, ativo: !x.ativo } : x));
    const { error } = await supabase.from("subprodutos")
      .update({ ativo: !s.ativo, updated_at: new Date().toISOString() })
      .eq("id", s.id);
    if (error) {
      setLista(prev => prev.map(x => x.id === s.id ? { ...x, ativo: s.ativo } : x));
      setErroTela(`Não deu para ${s.ativo ? "desativar" : "ativar"} "${s.nome}". Nada mudou — tente de novo.`);
    }
  };

  // Excluir subproduto — o saldo em estoque_subprodutos some em cascata
  // (FK ON DELETE CASCADE). Bloqueado quando o subproduto está em algum combo
  // (checado antes de abrir o modal), então aqui é só o caminho liberado.
  const confirmarExcluir = async () => {
    if (!excluindo || deletando) return;
    setDeletando(true);
    setErroDelete("");
    const { error } = await supabase.from("subprodutos").delete().eq("id", excluindo.id);
    if (error) {
      setErroDelete(error.message ?? "Não foi possível excluir o subproduto.");
      setDeletando(false);
      return;
    }
    setLista(prev => prev.filter(x => x.id !== excluindo.id));
    setDeletando(false);
    setExcluindo(null);
  };

  const cats = ["Todos", ...CATEGORIAS];

  const listafiltrada = lista
    .filter(s => catFiltro === "Todos" || s.categoria === catFiltro)
    .filter(s => !busca || s.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="subprodutos-view">

      {/* Header */}
      <div className="subprodutos-view__header" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
        <div className="subprodutos-view__contagem">
          {lista.length} subproduto{lista.length !== 1 ? "s" : ""}
        </div>
        <button
          onClick={abrirNovo}
          className="subprodutos-view__btn-novo"
        >
          <LuPlus size={15} /> Novo Subproduto
        </button>
      </div>

      {/* Filtros */}
      <div className="subprodutos-view__filtros" style={{ padding: `10px ${sz.pad}px` }}>
        <div className="subprodutos-view__categorias">
          {cats.map(cat => (
            <button
              key={cat}
              onClick={() => setCatFiltro(cat)}
              className="subprodutos-view__categoria-btn"
              style={{ background: catFiltro === cat ? varColor(C.accent) : varColor(C.surface), color: catFiltro === cat ? "#fff" : varColor(C.muted) }}
            >
              {cat}
            </button>
          ))}
        </div>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar..."
          className="subprodutos-view__busca"
        />
      </div>

      {/* Tabela */}
      <div className="subprodutos-view__tabela-area" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
        {erroTela && (
          <div className="subprodutos-view__erro subprodutos-view__erro-tela" role="alert">⚠ {erroTela}</div>
        )}
        {loading ? (
          <div className="subprodutos-view__estado">Carregando…</div>
        ) : erroTela && lista.length === 0 ? (
          // Lista vazia por falha de leitura não é lista vazia: o aviso acima
          // já explica, e "Nenhum subproduto cadastrado" contradiria ele.
          null
        ) : listafiltrada.length === 0 ? (
          <div className="subprodutos-view__vazio">
            <LuPackage size={40} style={{ opacity: 0.2 }} />
            <div className="subprodutos-view__vazio-texto" style={{ fontWeight: 600 }}>{busca ? "Nenhum resultado" : "Nenhum subproduto cadastrado"}</div>
          </div>
        ) : (
          <div className="subprodutos-view__tabela-moldura">
            <table className="subprodutos-view__tabela">
              <thead>
                <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                  {["Nome", "Categoria", "Unidade", "Preço", "Estoque", "Status", ""].map((h, i) => (
                    <th key={i} className="subprodutos-view__th" style={{ textAlign: i >= 3 ? "center" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listafiltrada.map(s => (
                  <tr
                    key={s.id}
                    className="subprodutos-view__tr"
                    onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    style={{ opacity: s.ativo ? 1 : 0.5 }}
                  >
                    <td className="subprodutos-view__td subprodutos-view__nome">{s.nome}</td>
                    <td className="subprodutos-view__td">
                      <span className="subprodutos-view__tag-categoria" style={{ background: alfa(C.accent, "15"), color: varColor(C.accent) }}>{s.categoria}</span>
                    </td>
                    <td className="subprodutos-view__td subprodutos-view__unidade">{s.unidade_medida}</td>
                    <td className="subprodutos-view__td subprodutos-view__preco" style={{ textAlign: "center" }}>R$ {Number(s.preco).toFixed(2)}</td>
                    <td className="subprodutos-view__td" style={{ textAlign: "center" }}>
                      {s.controla_estoque ? (() => {
                        const est    = estoqueDe(s);
                        const qtd    = Number(est?.quantidade ?? 0);
                        const minimo = Number(est?.minimo ?? 0);
                        const baixo  = minimo > 0 && qtd <= minimo;
                        return (
                          <span className="subprodutos-view__estoque-qtd" style={{ fontWeight: 700, color: baixo ? varColor(C.red) : varColor(C.green), display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {baixo && <LuTriangleAlert size={13} />}{qtd}
                          </span>
                        );
                      })() : (
                        <span className="subprodutos-view__estoque-vazio" style={{ fontWeight: 600, color: varColor(C.muted) }}>—</span>
                      )}
                    </td>
                    <td className="subprodutos-view__td" style={{ textAlign: "center" }}>
                      <button
                        onClick={() => toggleAtivo(s)}
                        className="subprodutos-view__badge-status"
                        style={{ padding: "3px 10px", background: s.ativo ? alfa(C.green, "18") : varColor(C.surface), color: s.ativo ? varColor(C.green) : varColor(C.muted) }}
                      >
                        {s.ativo ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="subprodutos-view__td" style={{ textAlign: "right" }}>
                      <div className="subprodutos-view__acoes">
                        <button
                          onClick={() => abrirEditar(s)}
                          className="subprodutos-view__btn-editar"
                        >
                          <LuPencil size={13} /> Editar
                        </button>
                        <button
                          onClick={() => { setErroDelete(""); setExcluindo(s); }}
                          className="subprodutos-view__btn-excluir"
                          style={{ borderColor: alfa(C.red, "33"), background: alfa(C.red, "0c"), color: varColor(C.red) }}
                          title="Excluir subproduto"
                        >
                          <LuTrash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <ModalSubproduto item={editando} onClose={fecharModal} onSalvo={aoSalvar} sz={sz} />
      )}

      {/* Confirmação de exclusão */}
      {excluindo && createPortal((() => {
        const usos = usoCombo[excluindo.id] ?? 0;
        // Sem a contagem de combos, "0 usos" não quer dizer nada — prometer
        // exclusão e levar erro de FK do banco é pior do que não deixar entrar.
        const usoDesconhecido = !usoComboOk;
        const bloqueado = usos > 0 || usoDesconhecido;
        const cor = bloqueado ? C.blue : C.red;
        return (
          <div {...fecharAoClicarFora(() => !deletando && setExcluindo(null))} className="subprodutos-view__confirm-overlay">
            <div className="subprodutos-view__confirm-modal">
              <div className="subprodutos-view__confirm-topo">
                <div className="subprodutos-view__confirm-icone" style={{ background: alfa(cor, "18"), border: `1.5px solid ${alfa(cor, "44")}` }}>
                  <LuTriangleAlert size={22} color={varColor(cor)} />
                </div>
                <div>
                  <div className="subprodutos-view__confirm-titulo">{bloqueado ? (usoDesconhecido ? "Não dá para excluir agora" : "Não dá para excluir") : "Excluir subproduto?"}</div>
                  <div className="subprodutos-view__confirm-sub"><strong style={{ color: varColor(C.text) }}>{excluindo.nome}</strong></div>
                </div>
              </div>

              {bloqueado ? (
                <div className="subprodutos-view__confirm-aviso" style={{ background: alfa(C.blue, "0d"), border: `1px solid ${alfa(C.blue, "33")}` }}>
                  {usoDesconhecido ? (
                    <>Não conseguimos verificar se este subproduto está em algum combo. Recarregue a página e tente de novo. Enquanto isso, você pode deixá-lo <strong>inativo</strong> para que ele não apareça na venda.</>
                  ) : (
                    <>Este subproduto está em <strong style={{ color: varColor(C.text) }}>{usos} combo{usos !== 1 ? "s" : ""}</strong>. Remova-o desse{usos !== 1 ? "s" : ""} combo{usos !== 1 ? "s" : ""} antes de excluir. Enquanto isso, você pode deixá-lo <strong>inativo</strong> para que ele não apareça na venda.</>
                  )}
                </div>
              ) : (
                <div className="subprodutos-view__confirm-aviso" style={{ background: alfa(C.red, "0d"), border: `1px solid ${alfa(C.red, "33")}` }}>
                  Esta ação <strong style={{ color: varColor(C.red) }}>não pode ser desfeita</strong>. O subproduto e o saldo de estoque dele serão removidos permanentemente.
                </div>
              )}

              {erroDelete && <div className="subprodutos-view__erro" style={{ marginBottom: 12 }}>⚠ {erroDelete}</div>}

              <div className="subprodutos-view__confirm-botoes">
                {bloqueado ? (
                  <button onClick={() => setExcluindo(null)} className="subprodutos-view__confirm-btn-cancelar" style={{ flex: 1 }}>Entendi</button>
                ) : (
                  <>
                    <button onClick={() => setExcluindo(null)} disabled={deletando} className="subprodutos-view__confirm-btn-cancelar">Cancelar</button>
                    <button onClick={confirmarExcluir} disabled={deletando} className="subprodutos-view__confirm-btn-excluir" style={{ background: deletando ? varColor(C.faint) : varColor(C.red), cursor: deletando ? "not-allowed" : "pointer" }}>{deletando ? "Excluindo…" : "Sim, excluir"}</button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })(), document.body)}
    </div>
  );
}
