import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { chaveCategoria, ehCategoriaFixa } from "@/lib/categoriasProduto";
import { fmtQtd } from "@/utils/conversaoUnidades";
import { LuPencil, LuX as LuXIcon, LuRuler, LuTriangleAlert } from "react-icons/lu";
import { FEATURE_BARCODE_SCANNER } from "@/constants/features";
import Label from "./Label";
import Input from "./Input";

// Janela de cadastro e edição do produto, do insumo e do item de produção.
export default function ModalCadastroProduto({ tela }) {
  const {
    modal, form, salvando, erro, editingCompra, setEditingCompra, isInsumo, isProducao, categoriasProduto, fecharModal, setField, addCompra, setCompra, removeCompra, salvar, unidadesEstoque, unidadesCompra, unidadesConsumo,
  } = tela;
  return (
        <div {...fecharAoClicarFora(fecharModal)} className="produtos-view__modal-overlay">
          <div className="produtos-view__modal">
            <div className="produtos-view__modal-topo">
              <div className="produtos-view__modal-titulo">
                {modal === "novo"
                  ? isInsumo ? "Novo Insumo" : isProducao ? "Novo Item de Produção" : "Novo Produto"
                  : isInsumo ? "Editar Insumo" : isProducao ? "Editar Item de Produção" : "Editar Produto"}
              </div>
              <button onClick={fecharModal} className="produtos-view__modal-fechar"><LuXIcon size={16} /></button>
            </div>

            {/* Nome — exemplo adequado ao tipo: insumo = matéria-prima,
                item de produção = preparo da casa, produto = item vendido */}
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={v => setField("name", v)}
                placeholder={isInsumo ? "Ex: Farinha de trigo" : isProducao ? "Ex: Molho da casa" : "Ex: Cerveja 600ml"}
                maxLength={60}
              />
            </div>

            {/* Código de barras — visível apenas quando FEATURE_BARCODE_SCANNER estiver ativo */}
            {FEATURE_BARCODE_SCANNER && (
              <div>
                <Label>Código de barras (EAN/QR)</Label>
                <Input value={form.codigo_barras} onChange={v => setField("codigo_barras", v)} placeholder="Ex: 7891234567890" maxLength={64} />
              </div>
            )}

            {/* Categoria — oculta para insumos e itens de produção (categoria fixa) */}
            {!isInsumo && !isProducao && (
              <div>
                <Label>Categoria *</Label>
                <div className="produtos-view__categorias-form">
                  {categoriasProduto.map(cat => (
                    <button key={cat} onClick={() => setField("category", cat)} className={`produtos-view__categoria-chip${form.category === cat ? " produtos-view__categoria-chip--ativa" : ""}`}>
                      {cat}
                    </button>
                  ))}
                </div>
                <Input value={form.category} onChange={v => setField("category", v)} placeholder="Ou digite uma nova categoria" maxLength={40} />
                {/* Prevenção de erro > mensagem de erro: se o usuário digitar
                    "insumo"/"produção" à mão, o aviso já aparece enquanto ele
                    digita e diz qual botão usar — não espera o Salvar falhar. */}
                {ehCategoriaFixa(form.category) && (
                  <div className="produtos-view__cat-aviso-existe">
                    "{form.category.trim()}" é uma categoria do sistema. Para cadastrar um item
                    assim, feche esta janela e use o botão
                    "{chaveCategoria(form.category) === "insumo" ? "+ Novo Insumo" : "+ Item de Produção"}".
                  </div>
                )}
              </div>
            )}

            {/* Preço — oculto para insumos */}
            {!isInsumo && (
              <div>
                <Label>Preço (R$) *</Label>
                <div className="produtos-view__preco-wrap">
                  <span className="produtos-view__preco-prefixo">R$</span>
                  <input type="number" min="0" step="0.01" value={form.price} onChange={e => setField("price", e.target.value)} placeholder="0,00" className="produtos-view__preco-input" />
                </div>
              </div>
            )}

            {/* ── Seção: Unidades de medida ── */}
            <div className="produtos-view__secao-unidades">
              <div className="produtos-view__secao-titulo">
                <LuRuler size={15} className="produtos-view__secao-icone" />
                <span>Unidades de medida</span>
              </div>

              {/* Bloco 1: Unidade de estoque */}
              <div className="produtos-view__bloco">
                <div className="produtos-view__bloco-label">
                  Eu estoco esse produto em
                </div>
                {unidadesEstoque.length === 0 ? (
                  <div className="produtos-view__bloco-vazio">Nenhuma unidade de estoque cadastrada.</div>
                ) : (
                  <div className="produtos-view__unidades-lista">
                    {unidadesEstoque.map(u => {
                      const sel = form.unidade_estoque === u.abreviacao;
                      return (
                        <button key={u.id} onClick={() => setField("unidade_estoque", u.abreviacao)} className={`produtos-view__unidade-btn produtos-view__unidade-btn--estoque${sel ? " produtos-view__unidade-btn--ativa" : ""}`}>
                          {u.abreviacao}
                          <span className="produtos-view__unidade-nome">{u.nome !== u.abreviacao ? u.nome : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="produtos-view__divisor" />

              {/* Bloco 2: Unidades de compra (multi-fornecedor) */}
              <div className="produtos-view__bloco">
                <div className="produtos-view__bloco-label">Unidade de compra</div>

                {form.compras.length === 0 && (
                  <div className="produtos-view__bloco-vazio">Nenhum fornecedor adicionado.</div>
                )}

                {form.compras.map((c, idx) => {
                  const fator = parseFloat(c.fator) || 0;
                  const isEditing = editingCompra === idx;
                  return (
                    <div key={c.uid ?? idx} className="produtos-view__fornecedor-card">
                      {/* Cabeçalho com nome do fornecedor */}
                      <div className="produtos-view__fornecedor-cabecalho">
                        {isEditing ? (
                          <input
                            autoFocus
                            value={c.nome}
                            onChange={e => setCompra(idx, "nome", e.target.value)}
                            onBlur={() => setEditingCompra(null)}
                            onKeyDown={e => e.key === "Enter" && setEditingCompra(null)}
                            maxLength={40}
                            className="produtos-view__fornecedor-input"
                          />
                        ) : (
                          <span className={`produtos-view__fornecedor-nome${c.nome ? "" : " produtos-view__fornecedor-nome--vazio"}`}>
                            {c.nome || "Fornecedor"}
                          </span>
                        )}
                        <button onClick={() => setEditingCompra(isEditing ? null : idx)} title="Renomear" className={`produtos-view__fornecedor-btn-icone${isEditing ? " produtos-view__fornecedor-btn-icone--ativo" : ""}`}>
                          <LuPencil size={12} />
                        </button>
                        <button onClick={() => removeCompra(idx)} className="produtos-view__fornecedor-btn-icone">
                          <LuXIcon size={13} />
                        </button>
                      </div>

                      {/* Frase de conversão */}
                      <div className="produtos-view__conversao-frase">
                        Uma{" "}
                        <span className="produtos-view__frase-unidade produtos-view__frase-unidade--compra">{c.unidade || "…"}</span>
                        {" "}equivale a{" "}
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={c.fator}
                          onChange={e => setCompra(idx, "fator", e.target.value)}
                          placeholder="0"
                          className={`produtos-view__conversao-fator produtos-view__conversao-fator--compra${c.fator ? " produtos-view__conversao-fator--preenchido" : ""}`}
                        />
                        {" "}<span className="produtos-view__frase-unidade produtos-view__frase-unidade--estoque">{form.unidade_estoque || "…"}</span>{" "}de estoque
                      </div>

                      {/* Botões de unidade */}
                      {unidadesCompra.length === 0 ? (
                        <div className="produtos-view__bloco-vazio">Nenhuma unidade de compra cadastrada.</div>
                      ) : (
                        <div className="produtos-view__unidades-compra">
                          {unidadesCompra.map(u => {
                            const sel = c.unidade === u.abreviacao;
                            return (
                              <button key={u.id} onClick={() => setCompra(idx, "unidade", sel ? "" : u.abreviacao)} className={`produtos-view__unidade-btn produtos-view__unidade-btn--compra${sel ? " produtos-view__unidade-btn--ativa" : ""}`}>
                                {u.abreviacao}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Preview */}
                      {c.unidade && fator > 0 && form.unidade_estoque && (
                        <div className="produtos-view__conversao-preview produtos-view__conversao-preview--compra">
                          ✓ 1 {c.unidade} → +{fmtQtd(fator)} {form.unidade_estoque} no estoque
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={addCompra}
                  className="produtos-view__btn-add-fornecedor"
                >
                  <LuPencil size={13} /> + Adicionar fornecedor
                </button>
              </div>

              <div className="produtos-view__divisor" />

              {/* Bloco 3: Unidade de consumo */}
              <div className="produtos-view__bloco">
                <div className="produtos-view__bloco-label">
                  Eu consumo/vendo em
                </div>
                {unidadesConsumo.length === 0 ? (
                  <div className="produtos-view__bloco-vazio">Nenhuma unidade de consumo cadastrada.</div>
                ) : (
                  <div className="produtos-view__unidades-lista">
                    {unidadesConsumo.map(u => {
                      const sel = form.unidade_consumo === u.abreviacao;
                      return (
                        <button key={u.id} onClick={() => setField("unidade_consumo", sel ? "" : u.abreviacao)} className={`produtos-view__unidade-btn produtos-view__unidade-btn--consumo${sel ? " produtos-view__unidade-btn--ativa" : ""}`}>
                          {u.abreviacao}
                          <span className="produtos-view__unidade-nome">{u.nome !== u.abreviacao ? u.nome : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* crítico 7 — fator consumo→estoque: só aparece quando a
                    unidade de consumo difere da de estoque (senão é 1:1) */}
                {form.unidade_consumo && form.unidade_estoque && form.unidade_consumo !== form.unidade_estoque && (
                  <>
                    <div className="produtos-view__conversao-frase">
                      Uma{" "}
                      <span className="produtos-view__frase-unidade produtos-view__frase-unidade--consumo">{form.unidade_consumo}</span>
                      {" "}vendida gasta{" "}
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={form.fator_consumo}
                        onChange={e => setField("fator_consumo", e.target.value)}
                        placeholder="1"
                        className={`produtos-view__conversao-fator produtos-view__conversao-fator--consumo${form.fator_consumo ? " produtos-view__conversao-fator--preenchido" : ""}`}
                      />
                      {" "}<span className="produtos-view__frase-unidade produtos-view__frase-unidade--estoque">{form.unidade_estoque}</span>{" "}do estoque
                    </div>
                    {(() => {
                      const f = parseFloat(String(form.fator_consumo).replace(",", "."));
                      if (!(f > 0)) return null;
                      return (
                        <div className="produtos-view__conversao-preview produtos-view__conversao-preview--consumo">
                          ✓ 1 {form.unidade_consumo} vendida → −{fmtQtd(f)} {form.unidade_estoque} no estoque
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>

            {/* Erro */}
            {erro && (
              <div className="produtos-view__erro produtos-view__erro--caixa">
                <LuTriangleAlert size={14} className="gm-icone-texto" aria-hidden="true" /> {erro}
              </div>
            )}

            {/* Botões */}
            <div className="produtos-view__modal-botoes">
              <button onClick={fecharModal} className="produtos-view__btn-cancelar">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="produtos-view__btn-salvar">
                {salvando ? "Salvando..." : modal === "novo"
                  ? isInsumo ? "Cadastrar Insumo" : isProducao ? "Cadastrar Item" : "Cadastrar Produto"
                  : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </div>
  );
}
