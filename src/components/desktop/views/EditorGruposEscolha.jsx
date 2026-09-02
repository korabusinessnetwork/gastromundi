import { useState, useMemo } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuPlus, LuX, LuSearch, LuMinus, LuTrash2, LuList, LuLayoutGrid } from "react-icons/lu";
import NovosProdutosInline from "./NovosProdutosInline";
import "./EditorGruposEscolha.css";

/**
 * Editor de GRUPOS DE ESCOLHA — a mesma peça serve duas telas:
 * produto com seleção (dono = produto) e combo flexível (dono = combo).
 *
 * Controlado: recebe `grupos` (shape do app, ver src/lib/gruposEscolha.js) e
 * devolve o array inteiro por `onChange` a cada edição. Não fala com o
 * Supabase — quem persiste é quem embute o editor (salvarGrupos).
 *
 * Por que é intuitivo (princípio nº 1): cada grupo é um cartão fechado com
 * uma pergunta clara ("Escolha o hambúrguer"); o operador vê em português
 * quantas opções o cliente escolhe ("de 1 a 1") e escolhe a origem das
 * opções em dois botões grandes — lista fixa ou categoria inteira. Nada de
 * jargão, alvos de toque generosos, e uma opção só some depois de confirmada.
 */

// Insumo/Produção não são vendáveis — não entram como opção de escolha
// (mesma convenção de CombosView/AdminView).
const CATS_NAO_VENDAVEIS = ["Insumo", "Produção"];

function grupoNovo() {
  return {
    _key: crypto.randomUUID(),
    nome: "",
    minimo: 1,
    maximo: 1,
    origem: "lista",
    categoria: null,
    itens: [],
  };
}

function keyDe(g) {
  return g.id ?? g._key ?? String(g.ordem ?? 0);
}

function fmtBRL(v) {
  return `R$ ${Number(v || 0).toFixed(2)}`;
}

// ── Cartão de um grupo ─────────────────────────────────────────────
function GrupoCard({ grupo, products, onChange, onRemover }) {
  const [busca, setBusca] = useState("");
  const [show, setShow] = useState(false);
  // Painel de cadastrar produto sem sair daqui. Guarda o nome digitado na
  // busca: quem escreveu "Heineken 600ml" e não achou já quer criar ESSE.
  const [criando, setCriando] = useState(null);

  const set = (patch) => onChange({ ...grupo, ...patch });

  const categorias = useMemo(() => {
    const set_ = new Set();
    for (const p of products) {
      if (!CATS_NAO_VENDAVEIS.includes(p.category) && p.category) set_.add(p.category);
    }
    return [...set_].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const prodMap = useMemo(
    () => Object.fromEntries(products.map((p) => [String(p.id), p])),
    [products],
  );

  const filtrados = useMemo(() => {
    const jaAdd = new Set((grupo.itens ?? []).map((i) => String(i.produtoId)));
    const q = busca.toLowerCase();
    return products.filter(
      (p) =>
        !CATS_NAO_VENDAVEIS.includes(p.category) &&
        !jaAdd.has(String(p.id)) &&
        (!q || (p.name ?? "").toLowerCase().includes(q)),
    );
  }, [products, busca, grupo.itens]);

  const addItem = (p) => {
    set({ itens: [...(grupo.itens ?? []), { produtoId: p.id, preco: "" }] });
    setBusca("");
    setShow(false);
  };

  // Produtos recém-cadastrados entram no grupo de uma vez só: uma chamada
  // a `set` por produto perderia as anteriores (todas partiriam do mesmo
  // `grupo` da closure).
  const addVarios = (novos) => {
    set({ itens: [...(grupo.itens ?? []), ...novos.map((p) => ({ produtoId: p.id, preco: "" }))] });
    setBusca("");
    setShow(false);
  };
  const removeItem = (idx) => set({ itens: grupo.itens.filter((_, i) => i !== idx) });
  const setPreco = (idx, v) =>
    set({ itens: grupo.itens.map((it, i) => (i === idx ? { ...it, preco: v } : it)) });

  // mínimo ≥ 0; ao subir o mínimo além do máximo, o máximo o acompanha
  const setMin = (v) => {
    const m = Math.max(0, v);
    set({ minimo: m, maximo: Math.max(grupo.maximo ?? 1, m, 1) });
  };
  // máximo ≥ 1 e nunca abaixo do mínimo
  const setMax = (v) => set({ maximo: Math.max(1, v, grupo.minimo ?? 0) });

  const ehCategoria = grupo.origem === "categoria";

  return (
    <div className="editor-grupos__grupo">
      {/* Topo: nome do grupo + remover */}
      <div className="editor-grupos__grupo-topo">
        <input
          value={grupo.nome ?? ""}
          onChange={(e) => set({ nome: e.target.value })}
          placeholder="Ex: Escolha o hambúrguer"
          maxLength={80}
          className="editor-grupos__nome-input"
        />
        <button
          type="button"
          onClick={onRemover}
          className="editor-grupos__grupo-remover"
          style={{ borderColor: alfa(C.red, "33"), background: alfa(C.red, "0c"), color: varColor(C.red) }}
          title="Remover grupo"
        >
          <LuTrash2 size={15} />
        </button>
      </div>

      {/* Origem das opções */}
      <div className="editor-grupos__origem-grid">
        {[
          { id: "lista", icon: LuList, title: "Lista de opções", desc: "Você escolhe quais produtos entram" },
          { id: "categoria", icon: LuLayoutGrid, title: "Categoria inteira", desc: "Todos os produtos ativos de uma categoria" },
        ].map((o) => {
          const ativo = grupo.origem === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => set({ origem: o.id })}
              className="editor-grupos__origem-card"
              style={{
                borderColor: ativo ? varColor(C.accent) : varColor(C.border),
                background: ativo ? alfa(C.accent, "10") : varColor(C.surface),
              }}
            >
              <o.icon size={18} color={ativo ? varColor(C.accent) : varColor(C.muted)} />
              <div className="editor-grupos__origem-titulo" style={{ color: ativo ? varColor(C.accent) : varColor(C.text) }}>{o.title}</div>
              <div className="editor-grupos__origem-desc">{o.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Corpo conforme a origem */}
      {ehCategoria ? (
        <div>
          <select
            value={grupo.categoria ?? ""}
            onChange={(e) => set({ categoria: e.target.value || null })}
            className="editor-grupos__select"
          >
            <option value="">Selecione a categoria…</option>
            {categorias.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <div className="editor-grupos__ajuda">
            O cliente escolhe entre todos os produtos ativos desta categoria — cada um baixa o próprio estoque.
          </div>
        </div>
      ) : (
        <div>
          {(grupo.itens ?? []).length > 0 && (
            <div className="editor-grupos__itens-lista">
              {grupo.itens.map((it, idx) => {
                const p = prodMap[String(it.produtoId)];
                return (
                  <div key={idx} className="editor-grupos__item-card">
                    <span className="editor-grupos__item-emoji">{p?.emoji ?? "📦"}</span>
                    <div className="editor-grupos__item-nome-wrap">
                      <div className="editor-grupos__item-nome">{p?.name ?? "Produto removido"}</div>
                      <div className="editor-grupos__item-info">Preço base {fmtBRL(p?.price)}</div>
                    </div>
                    <div className="editor-grupos__item-acrescimo">
                      <span className="editor-grupos__item-acrescimo-label">Acréscimo</span>
                      <div className="editor-grupos__acrescimo-campo">
                        <span className="editor-grupos__acrescimo-cifrao">R$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.preco ?? ""}
                          onChange={(e) => setPreco(idx, e.target.value)}
                          placeholder="0,00"
                          className="editor-grupos__acrescimo-input"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="editor-grupos__item-remover"
                      title="Remover opção"
                    >
                      <LuX size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Busca e adiciona opção */}
          <div className="editor-grupos__busca-wrap">
            <LuSearch size={15} className="editor-grupos__busca-icone" />
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setShow(true); }}
              onFocus={() => setShow(true)}
              placeholder="Buscar e adicionar opção…"
              className="editor-grupos__input editor-grupos__input--busca"
            />
            {show && (filtrados.length > 0 || busca.trim()) && (
              <div className="editor-grupos__dropdown">
                {filtrados.slice(0, 20).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addItem(p)}
                    className="editor-grupos__dropdown-item"
                    onMouseEnter={(e) => (e.currentTarget.style.background = varColor(C.surface))}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    <span className="editor-grupos__dropdown-item-emoji">{p.emoji ?? "📦"}</span>
                    <div className="editor-grupos__item-nome-wrap">
                      <div className="editor-grupos__dropdown-item-nome">{p.name}</div>
                      <div className="editor-grupos__dropdown-item-preco">{fmtBRL(p.price)}</div>
                    </div>
                    <LuPlus size={14} color={varColor(C.accent)} />
                  </button>
                ))}

                {/* Não achou porque ainda não existe: cadastrar daqui evita
                    abandonar a montagem do grupo, ir em Produtos e voltar. */}
                {busca.trim() && (
                  <button
                    type="button"
                    onClick={() => { setCriando(busca.trim()); setShow(false); }}
                    className="editor-grupos__dropdown-criar"
                  >
                    <LuPlus size={14} />
                    Cadastrar “{busca.trim()}” como produto novo
                  </button>
                )}
              </div>
            )}
          </div>

          {criando != null && (
            <NovosProdutosInline
              nomeInicial={criando}
              categorias={categorias}
              onCriados={addVarios}
              onCancelar={() => setCriando(null)}
            />
          )}

          <div className="editor-grupos__ajuda">
            O acréscimo é quanto aquela opção soma ao preço — deixe zerado quando não muda nada.
          </div>
        </div>
      )}

      {/* Quantas o cliente escolhe */}
      <div className="editor-grupos__minmax">
        <span className="editor-grupos__minmax-texto">O cliente escolhe de</span>
        <div className="editor-grupos__stepper">
          <button type="button" onClick={() => setMin((grupo.minimo ?? 0) - 1)} className="editor-grupos__stepper-btn"><LuMinus size={12} /></button>
          <span className="editor-grupos__stepper-valor">{grupo.minimo ?? 0}</span>
          <button type="button" onClick={() => setMin((grupo.minimo ?? 0) + 1)} className="editor-grupos__stepper-btn"><LuPlus size={12} /></button>
        </div>
        <span className="editor-grupos__minmax-texto">a</span>
        <div className="editor-grupos__stepper">
          <button type="button" onClick={() => setMax((grupo.maximo ?? 1) - 1)} className="editor-grupos__stepper-btn"><LuMinus size={12} /></button>
          <span className="editor-grupos__stepper-valor">{grupo.maximo ?? 1}</span>
          <button type="button" onClick={() => setMax((grupo.maximo ?? 1) + 1)} className="editor-grupos__stepper-btn"><LuPlus size={12} /></button>
        </div>
        <span className="editor-grupos__minmax-texto">
          {(grupo.maximo ?? 1) === 1 ? "opção" : "opções"}
          {(grupo.minimo ?? 0) === 0 ? " (opcional)" : ""}
        </span>
      </div>
    </div>
  );
}

// ── Editor (lista de grupos) ───────────────────────────────────────
export default function EditorGruposEscolha({ grupos = [], onChange, products = [] }) {
  const atualizar = (idx, novo) => onChange(grupos.map((g, i) => (i === idx ? novo : g)));
  const remover = (idx) => onChange(grupos.filter((_, i) => i !== idx));
  const adicionar = () => onChange([...grupos, grupoNovo()]);

  return (
    <div className="editor-grupos">
      {grupos.length > 0 && (
        <div className="editor-grupos__grupos">
          {grupos.map((g, idx) => (
            <GrupoCard
              key={keyDe(g)}
              grupo={g}
              products={products}
              onChange={(novo) => atualizar(idx, novo)}
              onRemover={() => remover(idx)}
            />
          ))}
        </div>
      )}

      <button type="button" onClick={adicionar} className="editor-grupos__add">
        <LuPlus size={16} /> Adicionar grupo de escolha
      </button>
    </div>
  );
}
