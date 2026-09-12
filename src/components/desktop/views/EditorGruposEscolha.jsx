import { useState, useMemo } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuPlus, LuX, LuSearch, LuMinus, LuTrash2, LuList, LuLayoutGrid, LuEye, LuEyeOff } from "react-icons/lu";
import { instrucaoGrupo } from "@/lib/gruposEscolha";
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
    set({ itens: [...(grupo.itens ?? []), { produtoId: p.id, preco: "", ativo: true }] });
    setBusca("");
    setShow(false);
  };

  // Produtos recém-cadastrados entram no grupo de uma vez só: uma chamada
  // a `set` por produto perderia as anteriores (todas partiriam do mesmo
  // `grupo` da closure).
  const addVarios = (novos) => {
    set({ itens: [...(grupo.itens ?? []), ...novos.map((p) => ({ produtoId: p.id, preco: "", ativo: true }))] });
    setBusca("");
    setShow(false);
  };
  const removeItem = (idx) => set({ itens: grupo.itens.filter((_, i) => i !== idx) });
  const setPreco = (idx, v) =>
    set({ itens: grupo.itens.map((it, i) => (i === idx ? { ...it, preco: v } : it)) });

  // Desligar não apaga: a opção continua cadastrada, com o acréscimo dela,
  // e só deixa de ser oferecida no PDV. É o "acabou hoje" sem o dono ter de
  // recadastrar amanhã.
  const setAtivo = (idx, ativo) =>
    set({ itens: grupo.itens.map((it, i) => (i === idx ? { ...it, ativo } : it)) });

  // mínimo ≥ 0; ao subir o mínimo além do máximo, o máximo o acompanha —
  // exceto quando o máximo é 0 (sem limite), que já cabe qualquer mínimo.
  const setMin = (v) => {
    const m = Math.max(0, v);
    const tetoAtual = Math.max(0, grupo.maximo ?? 1);
    set({ minimo: m, maximo: tetoAtual === 0 ? 0 : Math.max(tetoAtual, m, 1) });
  };
  // Máximo 0 = SEM LIMITE. Descer abaixo de 1 não é erro a barrar: é como
  // se diz "quantas o cliente quiser" (pizza de quantos sabores der).
  // Subir de lá volta para 1, e daí para cima o teto nunca fica abaixo do
  // mínimo — uma faixa que se contradiz travaria o pedido para sempre.
  const setMax = (v) =>
    set({ maximo: v <= 0 ? 0 : Math.max(v, grupo.minimo ?? 0, 1) });

  const ehCategoria = grupo.origem === "categoria";

  // Produtos que a categoria escolhida traria hoje. É a prévia do que o
  // botão abaixo transforma em lista.
  const daCategoria = useMemo(
    () => (grupo.categoria
      ? products.filter((p) => p.active !== false && p.category === grupo.categoria)
      : []),
    [products, grupo.categoria],
  );

  // "Categoria inteira" é uma REGRA: produto novo na categoria entra
  // sozinho, e por isso não dá para tirar um item específico dela. Quem
  // quer escolher quais entram está pedindo uma LISTA — então o botão
  // traz os produtos da categoria já preenchidos e muda a origem. A troca
  // é explícita porque tem um preço: a partir dali, produto novo na
  // categoria não entra mais sozinho.
  const virarLista = () => {
    set({
      origem: "lista",
      categoria: null,
      itens: daCategoria.map((p) => ({ produtoId: p.id, preco: "", ativo: true })),
    });
  };

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
            O cliente escolhe entre todos os produtos ativos desta categoria — cada um baixa o próprio
            estoque. Produto novo nesta categoria passa a aparecer sozinho, sem você mexer aqui.
          </div>

          {grupo.categoria && (
            <button type="button" onClick={virarLista} className="editor-grupos__virar-lista">
              <LuList size={15} />
              <span>
                Escolher quais entram
                <span className="editor-grupos__virar-lista-ajuda">
                  Traz {daCategoria.length === 1 ? "o produto" : `os ${daCategoria.length} produtos`} de
                  “{grupo.categoria}” para uma lista, onde você tira o que não quer e põe acréscimo em
                  cada um. Aí produto novo na categoria não entra mais sozinho.
                </span>
              </span>
            </button>
          )}
        </div>
      ) : (
        <div>
          {(grupo.itens ?? []).length > 0 && (
            <div className="editor-grupos__itens-lista">
              {grupo.itens.map((it, idx) => {
                const p = prodMap[String(it.produtoId)];
                const ligada = it.ativo !== false;
                return (
                  <div key={idx} className={`editor-grupos__item-card${ligada ? "" : " editor-grupos__item-card--desligada"}`}>
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
                      role="switch"
                      aria-checked={ligada}
                      aria-label={`Oferecer ${p?.name ?? "esta opção"}`}
                      title={ligada ? "Sendo oferecida — clique para desligar (o acréscimo fica salvo)" : "Não está sendo oferecida — clique para ligar"}
                      onClick={() => setAtivo(idx, !ligada)}
                      className="editor-grupos__item-ligar"
                    >
                      {ligada ? <LuEye size={16} /> : <LuEyeOff size={16} />}
                    </button>
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

      {/* Quantas o cliente escolhe. Os dois contadores são só controles —
          quem diz em português o que a combinação significa é a frase
          abaixo, a MESMA que o operador lê no PDV na hora de vender. Sem
          ela, "de 0 a sem limite" viraria charada. */}
      <div className="editor-grupos__minmax">
        <span className="editor-grupos__minmax-texto">Mínimo</span>
        <div className="editor-grupos__stepper">
          <button type="button" aria-label="Diminuir o mínimo" onClick={() => setMin((grupo.minimo ?? 0) - 1)} className="editor-grupos__stepper-btn"><LuMinus size={12} /></button>
          <span className="editor-grupos__stepper-valor">{grupo.minimo ?? 0}</span>
          <button type="button" aria-label="Aumentar o mínimo" onClick={() => setMin((grupo.minimo ?? 0) + 1)} className="editor-grupos__stepper-btn"><LuPlus size={12} /></button>
        </div>
        <span className="editor-grupos__minmax-texto">Máximo</span>
        <div className="editor-grupos__stepper">
          <button type="button" aria-label="Diminuir o máximo" onClick={() => setMax((grupo.maximo ?? 1) - 1)} className="editor-grupos__stepper-btn"><LuMinus size={12} /></button>
          <span className="editor-grupos__stepper-valor editor-grupos__stepper-valor--max">
            {(grupo.maximo ?? 1) === 0 ? "sem limite" : (grupo.maximo ?? 1)}
          </span>
          <button type="button" aria-label="Aumentar o máximo" onClick={() => setMax((grupo.maximo ?? 1) + 1)} className="editor-grupos__stepper-btn"><LuPlus size={12} /></button>
        </div>
      </div>
      <div className="editor-grupos__ajuda">
        {instrucaoGrupo(grupo.minimo ?? 0, grupo.maximo ?? 1)}. Baixe o máximo até
        “sem limite” quando o cliente puder repetir à vontade — pizza de quantos
        sabores quiser, por exemplo.
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
