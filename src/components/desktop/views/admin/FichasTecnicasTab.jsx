import { useState, useMemo, useRef } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { useResponsive } from "@/utils/hooks";
import {
  LuPlus, LuPencil, LuTrash2, LuX, LuClipboardList, LuCheck, LuChevronDown, LuSearch, LuLink, LuPackage, LuSlidersHorizontal
} from "react-icons/lu";
import {
  consumoParaEstoque, labelEstoque, labelConsumo, temConversaoConsumo, fmtQtd
} from "@/utils/conversaoUnidades";
import { novoUid, comUid, listaSemUid } from "@/lib/uidLista";
import Field from "./Field";
import Inp from "./Inp";
import Txta from "./Txta";
import ModalBase from "./ModalBase";
import DeleteConfirm from "./DeleteConfirm";
import CardBtn from "./CardBtn";
import EmptyMsg from "./EmptyMsg";
import AddBtn from "./AddBtn";
import { uid, fmtR, FICHA_VAZIA, ING_VAZIO } from "./apoio";
import { nomeBateComBusca } from "@/lib/busca";
import "./FichasTecnicasTab.css";

export default function FichasTecnicasTab({ fichas, products, estoque, onSave, onDelete }) {
  const { width: vw } = useResponsive();
  const isNarrow = vw < 640;
  const [form,        setForm]        = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [deleteId,    setDeleteId]    = useState(null);
  const [busca,          setBusca]          = useState("");
  const [buscaPrato,     setBuscaPrato]     = useState("");
  const [showPratoDD,    setShowPratoDD]    = useState(false);
  const [catFiltroIng,   setCatFiltroIng]   = useState("Todos");
  const [showFiltroIng,  setShowFiltroIng]  = useState(false);
  const buscaRef     = useRef(null);
  const buscaPratoRef = useRef(null);

  const abrirNova   = () => { setForm({ ...FICHA_VAZIA, id: uid() }); setBusca(""); setBuscaPrato(""); setShowPratoDD(false); setCatFiltroIng("Todos"); setShowFiltroIng(false); };
  const abrirEditar = (f) => { setForm({ ...f, ingredientes: comUid(f.ingredientes ?? []) }); setBusca(""); setBuscaPrato(""); setShowPratoDD(false); setCatFiltroIng("Todos"); setShowFiltroIng(false); };
  const fechar      = () => { setForm(null); setBusca(""); setBuscaPrato(""); setShowPratoDD(false); setCatFiltroIng("Todos"); setShowFiltroIng(false); };
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Atualiza um campo de um ingrediente
  const setIng = (i, k, v) => setForm(f => ({
    ...f,
    ingredientes: f.ingredientes.map((ing, idx) => idx === i ? { ...ing, [k]: v } : ing),
  }));

  // Adiciona produto do estoque como ingrediente
  const adicionarDoProduto = (produto) => {
    const unidadePadrao = produto.unidade_consumo ?? produto.unidade_estoque ?? produto.unidade ?? "un";
    setForm(f => ({
      ...f,
      ingredientes: [
        ...f.ingredientes,
        { ...ING_VAZIO, uid: novoUid(), produtoId: produto.id, nome: produto.name, emoji: produto.emoji || "", unidade: unidadePadrao },
      ],
    }));
    if (buscaRef.current) buscaRef.current.focus();
  };

  // Adicionar ingrediente manual
  const adicionarManual = () => setForm(f => ({
    ...f,
    ingredientes: [...f.ingredientes, { ...ING_VAZIO, uid: novoUid() }],
  }));

  const removeIng = (i) => setForm(f => ({ ...f, ingredientes: f.ingredientes.filter((_, idx) => idx !== i) }));

  // Produtos filtrados pela busca (excluindo os já adicionados por produtoId)
  const adicionados = useMemo(() => new Set((form?.ingredientes ?? []).map(i => i.produtoId).filter(Boolean)), [form?.ingredientes]);

  const categoriasIng = useMemo(() => {
    const cats = [...new Set(products.filter(p => p.active !== false).map(p => p.category).filter(Boolean))].sort();
    return ["Todos", ...cats];
  }, [products]);

  const produtosFiltrados = useMemo(() => {
    let ativos = products.filter(p => p.active !== false);
    if (catFiltroIng !== "Todos") ativos = ativos.filter(p => p.category === catFiltroIng);
    if (!busca.trim()) return ativos;
    const q = busca.toLowerCase();
    return ativos.filter(p => nomeBateComBusca(p.name, q) || p.category?.toLowerCase().includes(q));
  }, [products, busca, catFiltroIng]);

  // Produtos elegíveis para ser o "prato" da ficha (excluindo Insumo)
  const pratoElegiveis = useMemo(() => {
    const ativos = products.filter(p => p.active !== false && p.category !== "Insumo");
    if (!buscaPrato.trim()) return ativos;
    const q = buscaPrato.toLowerCase();
    return ativos.filter(p => nomeBateComBusca(p.name, q) || p.category?.toLowerCase().includes(q));
  }, [products, buscaPrato]);

  const produtoVinculado = useMemo(() =>
    form?.produtoId ? products.find(p => p.id === form.produtoId) ?? null : null
  , [form?.produtoId, products]);

  // Custo total calculado
  const custoTotal  = (form?.ingredientes ?? []).reduce((s, ing) => s + (parseFloat(ing.qtd) || 0) * (parseFloat(ing.custoUnit) || 0), 0);
  const custoPorcao = custoTotal / (parseFloat(form?.rendimento) || 1);

  const salvar = async () => {
    if (!form?.produtoId) return;
    setSaving(true);
    // O `uid` das linhas é chave de renderização: o destino aqui é um jsonb livre,
    // que aceitaria o campo calado e o devolveria como se fosse dado da ficha.
    const nova = [...fichas.filter(f => f.id !== form.id), { ...form, ingredientes: listaSemUid(form.ingredientes ?? []) }];
    // Fecha só quando gravou. Antes o modal fechava mesmo com o banco
    // recusando, e a ficha inteira que o usuário digitou ia embora com ele.
    const { error } = await onSave("fichas_tecnicas", nova);
    setSaving(false);
    if (error) return;
    fechar();
  };

  const excluir = async () => {
    const { error } = await onDelete("fichas_tecnicas", fichas.filter(f => f.id !== deleteId));
    if (error) return;
    setDeleteId(null);
  };

  return (
    <div>
      <div className="admin__aba-header">
        <div className="admin__aba-contagem">
          {fichas.length} ficha{fichas.length !== 1 ? "s" : ""} cadastrada{fichas.length !== 1 ? "s" : ""}
        </div>
        <AddBtn onClick={abrirNova} label="Nova Ficha" />
      </div>

      {fichas.length === 0 ? (
        <EmptyMsg icon={LuClipboardList} msg="Nenhuma ficha técnica cadastrada" />
      ) : (
        <div className="fichas-tab__grid">
          {fichas.map(f => {
            const ings          = f.ingredientes ?? [];
            const ct            = ings.reduce((s, ing) => s + (parseFloat(ing.qtd) || 0) * (parseFloat(ing.custoUnit) || 0), 0);
            const cp            = ct / (parseFloat(f.rendimento) || 1);
            const prodCard      = f.produtoId ? products.find(p => p.id === f.produtoId) : null;
            const nomeCard      = prodCard?.name ?? f.nome ?? "Sem produto";
            const emojiCard     = prodCard?.emoji;
            return (
              <div key={f.id} className="fichas-tab__card">

                {/* Cabeçalho */}
                <div className="fichas-tab__card-topo">
                  <div className="fichas-tab__card-identidade">
                    {emojiCard && <span className="fichas-tab__card-emoji">{emojiCard}</span>}
                    <div>
                      <div className="fichas-tab__card-nome">{nomeCard}</div>
                      {f.categoria && <div className="fichas-tab__card-categoria">{f.categoria}</div>}
                    </div>
                  </div>
                  <div className="fichas-tab__card-acoes">
                    <CardBtn onClick={() => abrirEditar(f)}><LuPencil size={12} /></CardBtn>
                    <CardBtn onClick={() => setDeleteId(f.id)}><LuTrash2 size={12} /></CardBtn>
                  </div>
                </div>

                {/* KPIs */}
                <div className="fichas-tab__kpis">
                  <div className="fichas-tab__kpi">
                    <div className="fichas-tab__kpi-label">Rendimento</div>
                    <div className="fichas-tab__kpi-valor">{f.rendimento || "—"} porç.</div>
                  </div>
                  <div className="fichas-tab__kpi fichas-tab__kpi--custo">
                    <div className="fichas-tab__kpi-label">Custo/porção</div>
                    <div className="fichas-tab__kpi-valor fichas-tab__kpi-valor--custo">{fmtR(cp)}</div>
                  </div>
                </div>

                {/* Lista de ingredientes */}
                {ings.length > 0 && (
                  <div className="fichas-tab__ing-tabela">
                    {/* Cabeçalho da tabela */}
                    <div className="fichas-tab__ing-tabela-header">
                      <div className="fichas-tab__ing-th">Ingrediente</div>
                      <div className="fichas-tab__ing-th fichas-tab__ing-th--centro">Necessário</div>
                      <div className="fichas-tab__ing-th fichas-tab__ing-th--direita">Em estoque</div>
                    </div>

                    {ings.map((ing, i) => {
                      // Sempre deriva nome/emoji do produto atual se vinculado
                      const produto    = ing.produtoId ? products.find(p => p.id === ing.produtoId) : null;
                      const nomeShow   = produto?.name  ?? ing.nome;
                      const emojiShow  = produto?.emoji ?? ing.emoji;
                      const qtdNec     = parseFloat(ing.qtd) || 0;
                      // Converte qtd necessária (em unidade_consumo) para unidade_estoque para comparar
                      const qtdNecEst  = produto ? consumoParaEstoque(qtdNec, produto) : qtdNec;
                      const qtdEstq    = produto ? (estoque[produto.id] ?? 0) : null;
                      const suficiente = qtdEstq === null ? null : qtdEstq >= qtdNecEst;
                      const situacaoEstq = qtdEstq === 0 ? "zerado" : suficiente ? "suficiente" : "insuficiente";
                      const ueLabel    = produto ? labelEstoque(produto) : "";
                      const ucLabel    = produto ? labelConsumo(produto) : (ing.unidade || "");
                      const temConv    = produto ? temConversaoConsumo(produto) : false;
                      return (
                        // TD015: lista só de leitura de uma ficha já salva, e sem chave de domínio possível: o ingrediente manual nasce sem `produtoId` e o nome repete dentro da mesma ficha.
                        <div
                          key={i}
                          className="fichas-tab__ing-linha"
                        >
                          {/* Nome */}
                          <div className="fichas-tab__ing-nome">
                            {emojiShow
                              ? <span className="fichas-tab__ing-emoji">{emojiShow}</span>
                              : <LuPackage size={13} color={varColor(C.muted)} className="fichas-tab__icone-fixo" />}
                            <span className="fichas-tab__ing-nome-texto">
                              {nomeShow || <span className="fichas-tab__sem-nome">sem nome</span>}
                            </span>
                            {produto && (
                              <LuLink size={10} color={varColor(C.accent)} className="fichas-tab__icone-fixo" title="Vinculado ao estoque" />
                            )}
                          </div>

                          {/* Qtd necessária */}
                          <div className="fichas-tab__ing-qtd">
                            {qtdNec > 0 ? (
                              <div className="fichas-tab__ing-qtd-pilha">
                                <span>{fmtQtd(qtdNec)} {ucLabel}</span>
                                {temConv && (
                                  <span className="fichas-tab__ing-qtd-conv">
                                    ={fmtQtd(qtdNecEst)} {ueLabel}
                                  </span>
                                )}
                              </div>
                            ) : <span className="fichas-tab__traco">—</span>}
                          </div>

                          {/* Qtd em estoque */}
                          <div className="fichas-tab__ing-estoque">
                            {qtdEstq === null ? (
                              <span className="fichas-tab__ing-estoque-vazio">—</span>
                            ) : (
                              <div className="fichas-tab__ing-estoque-pilha">
                                <span className={`fichas-tab__ing-estoque-valor fichas-tab__ing-estoque-valor--${situacaoEstq}`}>
                                  {fmtQtd(qtdEstq)} {ueLabel}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {ings.length === 0 && (
                  <div className="fichas-tab__vazio-ing">
                    Nenhum ingrediente cadastrado
                  </div>
                )}

                {/* Custo total */}
                {ct > 0 && (
                  <div className="fichas-tab__custo-total">
                    Custo total dos ingredientes: <strong className="fichas-tab__valor-forte">{fmtR(ct)}</strong>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal da Ficha */}
      {form && (
        <ModalBase
          title={fichas.find(f => f.id === form.id) ? "Editar Ficha Técnica" : "Nova Ficha Técnica"}
          onClose={fechar}
          onSave={salvar}
          saving={saving}
          width={860}
        >
          {/* Cabeçalho da ficha */}
          <div className={`fichas-tab__form-cabecalho${isNarrow ? " fichas-tab__form-cabecalho--estreito" : ""}`}>
            <Field label="Produto vinculado *">
              <div className="fichas-tab__ancora">
                {produtoVinculado ? (
                  <div className="fichas-tab__produto-vinculado">
                    <span className="fichas-tab__vinculado-emoji">{produtoVinculado.emoji || "📦"}</span>
                    <span className="fichas-tab__vinculado-nome">{produtoVinculado.name}</span>
                    <button type="button" onClick={() => { setF("produtoId", null); setF("nome", ""); setF("categoria", ""); setBuscaPrato(""); setShowPratoDD(false); }} className="fichas-tab__btn-limpar"><LuX size={13} /></button>
                  </div>
                ) : (
                  <div className="fichas-tab__ancora">
                    <LuSearch size={13} color={varColor(C.muted)} className="fichas-tab__icone-busca fichas-tab__icone-busca--sobre" />
                    <input
                      ref={buscaPratoRef}
                      value={buscaPrato}
                      onChange={e => { setBuscaPrato(e.target.value); setShowPratoDD(true); }}
                      onFocus={() => setShowPratoDD(true)}
                      onBlur={() => setTimeout(() => setShowPratoDD(false), 150)}
                      placeholder="Buscar produto..."
                      className="fichas-tab__input-busca fichas-tab__input-busca-prato"
                    />
                    {showPratoDD && (
                      <div className="fichas-tab__dropdown">
                        {pratoElegiveis.length === 0 ? (
                          <div className="fichas-tab__dropdown-vazio">Nenhum produto encontrado</div>
                        ) : pratoElegiveis.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => { setF("produtoId", p.id); setF("nome", p.name); setF("categoria", p.category ?? ""); setBuscaPrato(""); setShowPratoDD(false); }}
                            className="fichas-tab__dropdown-item"
                          >
                            <span className="fichas-tab__dropdown-emoji">{p.emoji || "📦"}</span>
                            <div className="fichas-tab__texto-flex">
                              <div className="fichas-tab__dropdown-nome">{p.name}</div>
                              {p.category && <div className="fichas-tab__dropdown-categoria">{p.category}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Categoria">
              <div className={`fichas-tab__categoria-preenchida${form.categoria ? " fichas-tab__categoria-preenchida--com-valor" : ""}`}>
                {form.categoria || "Preenchida ao vincular produto"}
              </div>
            </Field>
            <Field label="Rendimento">
              <div className="fichas-tab__rendimento">
                <Inp type="number" value={form.rendimento} onChange={v => setF("rendimento", v)} placeholder="1" />
                <span className={`fichas-tab__rendimento-unidade${produtoVinculado ? " fichas-tab__rendimento-unidade--vinculado" : ""}`}>
                  {produtoVinculado ? (labelConsumo(produtoVinculado) || labelEstoque(produtoVinculado)) : "un"}
                </span>
              </div>
            </Field>
          </div>

          {/* Painel de ingredientes — 2 colunas */}
          <div className={`fichas-tab__form-corpo${isNarrow ? " fichas-tab__form-corpo--estreito" : ""}`}>

            {/* Esquerda: lista de ingredientes adicionados */}
            <div className="fichas-tab__coluna-ingredientes">
              <div className="admin__secao-label">
                Ingredientes da receita
              </div>

              <div className="fichas-tab__ingredientes">
                {/* Cabeçalho das colunas */}
                {form.ingredientes.length > 0 && (
                  <div className={`fichas-tab__ing-grade fichas-tab__ing-grade--cabecalho${isNarrow ? " fichas-tab__ing-grade--estreito" : ""}`}>
                    {(isNarrow ? ["Ingrediente", "Qtd", "Un", ""] : ["Ingrediente", "Qtd", "Un", "R$/un", ""]).map((h, i) => (
                      // TD015: cabeçalho literal, escrito na linha acima, tamanho fixo.
                      <div key={i} className="fichas-tab__ing-col-header">{h}</div>
                    ))}
                  </div>
                )}

                {form.ingredientes.map((ing, i) => {
                  // Sempre usa dados atuais do produto vinculado
                  const prodVinc   = ing.produtoId ? products.find(p => p.id === ing.produtoId) : null;
                  const nomeChip   = prodVinc?.name  ?? ing.nome;
                  const emojiChip  = prodVinc?.emoji ?? ing.emoji;
                  return (
                  <div key={ing.uid} className={`fichas-tab__ing-grade fichas-tab__ing-grade--item${isNarrow ? " fichas-tab__ing-grade--estreito" : ""}`}>
                    {/* Nome — chip se vinculado, input se manual */}
                    {prodVinc ? (
                      <div className="fichas-tab__ing-chip">
                        {emojiChip && <span className="fichas-tab__ing-chip-emoji">{emojiChip}</span>}
                        <span className="fichas-tab__ing-chip-nome">{nomeChip}</span>
                        <LuLink size={11} color={varColor(C.accent)} className="fichas-tab__icone-fixo" />
                      </div>
                    ) : (
                      <input
                        value={ing.nome}
                        onChange={e => setIng(i, "nome", e.target.value)}
                        placeholder="Nome do ingrediente"
                        className="fichas-tab__ing-input"
                      />
                    )}
                    <input
                      type="number" value={ing.qtd} onChange={e => setIng(i, "qtd", e.target.value)}
                      placeholder="0"
                      className="fichas-tab__ing-input fichas-tab__ing-input--centro"
                    />
                    <input
                      value={ing.unidade} onChange={e => setIng(i, "unidade", e.target.value)}
                      placeholder="un"
                      className="fichas-tab__ing-input fichas-tab__ing-input--centro"
                    />
                    {!isNarrow && (
                      <input
                        type="number" value={ing.custoUnit} onChange={e => setIng(i, "custoUnit", e.target.value)}
                        placeholder="0,00"
                        className="fichas-tab__ing-input fichas-tab__ing-input--direita"
                      />
                    )}
                    <button onClick={() => removeIng(i)} className="fichas-tab__btn-remover-ing">
                      <LuX size={12} />
                    </button>
                  </div>
                  );
                })}

                {form.ingredientes.length === 0 && (
                  <div className="fichas-tab__ing-vazio-msg">
                    Selecione itens do estoque ao lado<br />
                    <span className="fichas-tab__ing-vazio-linha2">ou adicione manualmente</span>
                  </div>
                )}

                {/* Botão manual */}
                <button
                  onClick={adicionarManual}
                  className="fichas-tab__btn-manual"
                >
                  <LuPlus size={12} /> Adicionar manualmente
                </button>
              </div>

              {/* Resumo de custo */}
              {form.ingredientes.length > 0 && (
                <div className="fichas-tab__resumo-custo">
                  <div className="fichas-tab__resumo-linha">
                    Custo total: <strong className="fichas-tab__valor-forte">{fmtR(custoTotal)}</strong>
                  </div>
                  <div className="fichas-tab__resumo-linha">
                    Por porção: <strong className="fichas-tab__valor-porcao">{fmtR(custoPorcao)}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Direita: painel de busca no estoque */}
            <div className={`fichas-tab__painel-estoque${isNarrow ? " fichas-tab__painel-estoque--estreito" : ""}`}>
              <div className="admin__secao-label">
                Itens do Estoque
              </div>

              {/* Campo de busca */}
              <div className="fichas-tab__ancora">
                <LuSearch size={13} color={varColor(C.muted)} className="fichas-tab__icone-busca" />
                <input
                  ref={buscaRef}
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar produto..."
                  className="fichas-tab__input-busca fichas-tab__input-busca-estoque"
                />
                {busca && (
                  <button onClick={() => setBusca("")} className="fichas-tab__btn-limpar fichas-tab__btn-limpar--no-campo">
                    <LuX size={12} />
                  </button>
                )}
              </div>

              {/* Filtro de categorias */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowFiltroIng(v => !v)}
                  className={`fichas-tab__filtro-toggle${catFiltroIng !== "Todos" ? " fichas-tab__filtro-toggle--ativo" : ""}`}
                >
                  <LuSlidersHorizontal size={13} />
                  Filtro{catFiltroIng !== "Todos" ? `: ${catFiltroIng}` : ""}
                  <LuChevronDown size={13} className={`fichas-tab__seta${showFiltroIng ? " fichas-tab__seta--aberta" : ""}`} />
                </button>

                {showFiltroIng && (
                  <div className="fichas-tab__filtro-dropdown">
                    {categoriasIng.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => { setCatFiltroIng(cat); if (cat !== "Todos") setShowFiltroIng(false); }}
                        className={`fichas-tab__filtro-chip${catFiltroIng === cat ? " fichas-tab__filtro-chip--ativo" : ""}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista de produtos */}
              <div className={`fichas-tab__lista-produtos${isNarrow ? " fichas-tab__lista-produtos--estreito" : ""}`}>
                {produtosFiltrados.length === 0 ? (
                  <div className="fichas-tab__lista-vazia">
                    Nenhum produto encontrado
                  </div>
                ) : (
                  produtosFiltrados.map(p => {
                    const jaAdicionado = adicionados.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => !jaAdicionado && adicionarDoProduto(p)}
                        className={`fichas-tab__produto-item${jaAdicionado ? " fichas-tab__produto-item--adicionado" : ""}`}
                      >
                        <span className="fichas-tab__produto-item-emoji">{p.emoji || "📦"}</span>
                        <div className="fichas-tab__texto-flex">
                          <div className="fichas-tab__produto-item-nome">{p.name}</div>
                          <div className="fichas-tab__produto-item-categoria">{p.category}</div>
                        </div>
                        {jaAdicionado ? (
                          <LuCheck size={13} color={varColor(C.accent)} className="fichas-tab__icone-fixo" />
                        ) : (
                          <LuPlus size={13} color={varColor(C.muted)} className="fichas-tab__icone-fixo" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="fichas-tab__contador-produtos">
                {produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? "s" : ""} encontrado{produtosFiltrados.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Modo de preparo */}
          <Field label="Modo de preparo">
            <Txta value={form.preparo} onChange={v => setF("preparo", v)} placeholder="Descreva o preparo..." rows={3} />
          </Field>
        </ModalBase>
      )}

      {deleteId && (
        <DeleteConfirm
          msg={<><strong>{fichas.find(f => f.id === deleteId)?.nome}</strong> será removida permanentemente.</>}
          onCancel={() => setDeleteId(null)}
          onConfirm={excluir}
        />
      )}
    </div>
  );
}

// ── Aba: Notas ────────────────────────────────────────────────────

// ── Aba: Fornecedores ─────────────────────────────────────────────
