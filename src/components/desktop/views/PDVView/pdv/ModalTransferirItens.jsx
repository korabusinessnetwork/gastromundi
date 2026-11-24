import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import { LuArrowLeftRight } from "react-icons/lu";
import { fmtComanda } from "./apoio";

// Janela de transferir itens para outra comanda.
export default function ModalTransferirItens({ tela }) {
  const {
    selected, setShowTransferir, transQtds, setTransQtds, transDestino, setTransDestino,
    transMode, setTransMode, transNumero, setTransNumero, transNomeNova, setTransNomeNova,
    transNumeroErro, setTransNumeroErro, transferindo, handleTransferir, abertas,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setShowTransferir(false))}
          className="pdv__transfer-overlay"
        >
          <div className="pdv__transfer-card">
            {/* Header */}
            <div className="pdv__transfer-header">
              <div>
                <div className="pdv__modal-titulo pdv__transfer-titulo">
                  <LuArrowLeftRight size={18} /> Transferir itens
                </div>
                <div className="pdv__transfer-info pdv__transfer-de">
                  De: {/^\d+$/.test(String(selected?.comanda ?? "").trim()) ? `Comanda ${selected?.comanda}` : selected?.comanda}
                </div>
              </div>
              <button
                onClick={() => setShowTransferir(false)}
                className="pdv__modal-close-btn pdv__modal-icone-btn pdv__transfer-close-btn"
              >
                ✕
              </button>
            </div>

            <div className="pdv__transfer-body">
              {/* Seção: itens a transferir */}
              <div className="pdv__transfer-secao-itens">
                <div className="pdv__modal-label pdv__transfer-label">
                  Selecione os itens e quantidades
                </div>
                {/* Item cancelado não pode ser transferido: no destino ele se
                    funde com a linha ativa do mesmo produto (mesmoItemDeVenda)
                    e volta a ser cobrável. O `idx` original é preservado porque
                    `transQtds` é indexado por posição na lista de `selected`. */}
                {(Array.isArray(selected?.items) ? selected.items : [])
                  .map((item, idx) => ({ item, idx }))
                  .filter(({ item }) => !item?.cancelado)
                  .map(({ item, idx }) => {
                  const qty    = item.qty ?? 1;
                  const qSel   = transQtds[idx] ?? 0;
                  const ativo  = qSel > 0;
                  return (
                    <div key={item.uid ?? idx} className={`pdv__transfer-item${ativo ? " pdv__transfer-item--ativo" : ""}`}>
                      {item.emoji && <span className="pdv__transfer-item-emoji">{item.emoji}</span>}
                      <div className="pdv__transfer-item-info">
                        <div className="pdv__transfer-item-nome">
                          {item.name}
                        </div>
                        <div className="pdv__transfer-item-disponivel">Disponível: {qty}</div>
                      </div>
                      {/* Qty selector */}
                      <div className="pdv__transfer-stepper">
                        <button
                          onClick={() => setTransQtds(prev => ({ ...prev, [idx]: Math.max(0, (prev[idx] ?? 0) - 1) }))}
                          className="pdv__transfer-qty-btn"
                        >
                          <span className="pdv__transfer-qty-symbol">−</span>
                        </button>
                        <span className={`pdv__transfer-qty-valor${ativo ? " pdv__transfer-qty-valor--ativo" : ""}`}>
                          {qSel}
                        </span>
                        <button
                          onClick={() => setTransQtds(prev => ({ ...prev, [idx]: Math.min(qty, (prev[idx] ?? 0) + 1) }))}
                          className="pdv__transfer-qty-btn"
                        >
                          <span className="pdv__transfer-qty-symbol">+</span>
                        </button>
                        <button
                          onClick={() => setTransQtds(prev => ({ ...prev, [idx]: prev[idx] === qty ? 0 : qty }))}
                          className={`pdv__transfer-todos-btn${ativo ? " pdv__transfer-todos-btn--ativo" : ""}`}
                        >
                          {ativo && qSel === qty ? "Todos ✓" : "Todos"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Seção: comanda destino */}
              <div className="pdv__transfer-secao-destino">
                <div className="pdv__modal-label pdv__transfer-label">
                  Transferir para
                </div>

                {/* Abas de modo */}
                <div className="pdv__transfer-tabs">
                  {[
                    { id: "lista",  label: "Comandas abertas" },
                    { id: "numero", label: "Buscar por número" },
                    { id: "nova",   label: "+ Nova comanda" },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setTransMode(tab.id); setTransDestino(null); setTransNumeroErro(""); }}
                      className={`pdv__transfer-tab-btn${transMode === tab.id ? " pdv__transfer-tab-btn--ativa" : ""}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Modo: lista de comandas abertas */}
                {transMode === "lista" && (
                  abertas.filter(o => o.id !== selected?.id).length === 0 ? (
                    <div className="pdv__transfer-info pdv__transfer-vazio">
                      Nenhuma outra comanda aberta.
                    </div>
                  ) : (
                    <div className="pdv__transfer-lista">
                      {abertas.filter(o => o.id !== selected?.id).map(o => {
                        const nome = fmtComanda(o.comanda) || `#${String(o.id).slice(-4).toUpperCase()}`;
                        const sel  = transDestino === o.id;
                        return (
                          <button
                            key={o.id}
                            onClick={() => setTransDestino(o.id)}
                            className={`pdv__transfer-destino-btn${sel ? " pdv__transfer-destino-btn--selecionado" : ""}`}
                          >
                            <div className={`pdv__transfer-avatar${sel ? " pdv__transfer-avatar--selecionado" : ""}`}>
                              {sel ? "✓" : "#"}
                            </div>
                            <div className="pdv__transfer-destino-info">
                              <div className="pdv__transfer-card-nome">{nome}</div>
                              {o.garcom && <div className="pdv__transfer-card-meta">{o.garcom}</div>}
                            </div>
                            {o.total > 0 && (
                              <div className="pdv__transfer-card-valor pdv__transfer-lista-valor">
                                R$ {Number(o.total).toFixed(2)}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )
                )}

                {/* Modo: buscar por número */}
                {transMode === "numero" && (
                  <div className="pdv__transfer-busca">
                    <div className="pdv__transfer-input-wrap">
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        value={transNumero}
                        onChange={e => { setTransNumero(e.target.value.replace(/\D/g, "")); setTransNumeroErro(""); setTransDestino(null); }}
                        placeholder="Ex: 42"
                        aria-invalid={!!transNumeroErro}
                        className="pdv__modal-input pdv__transfer-input"
                      />
                    </div>
                    {transNumeroErro && (
                      <div className="pdv__modal-erro">{transNumeroErro}</div>
                    )}
                    {/* Preview da comanda encontrada */}
                    {(() => {
                      if (!transNumero.trim()) return null;
                      const encontrada = abertas.find(o => String(o.comanda).trim() === transNumero.trim() && o.id !== selected?.id);
                      if (!encontrada) return (
                        <div className="pdv__transfer-info pdv__transfer-sem-resultado">
                          Nenhuma comanda aberta com esse número.
                        </div>
                      );
                      return (
                        <div className="pdv__transfer-preview">
                          <div className="pdv__transfer-preview-check">✓</div>
                          <div>
                            <div className="pdv__transfer-card-nome pdv__transfer-preview-nome">{fmtComanda(encontrada.comanda)}</div>
                            {encontrada.garcom && <div className="pdv__transfer-card-meta">{encontrada.garcom}</div>}
                          </div>
                          {encontrada.total > 0 && (
                            <div className="pdv__transfer-card-valor pdv__transfer-preview-valor">
                              R$ {Number(encontrada.total).toFixed(2)}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Modo: nova comanda */}
                {transMode === "nova" && (
                  <div className="pdv__transfer-busca">
                    <div className="pdv__transfer-info pdv__transfer-nova-info">
                      Uma nova comanda será criada com os itens selecionados.
                    </div>
                    <input
                      autoFocus
                      type="text"
                      value={transNomeNova}
                      onChange={e => { setTransNomeNova(e.target.value); setTransNumeroErro(""); }}
                      placeholder="Nome ou número da nova comanda (ex: 99)"
                      aria-invalid={!!transNumeroErro}
                      className="pdv__modal-input pdv__transfer-input"
                    />
                    {transNumeroErro && (
                      <div className="pdv__modal-erro">{transNumeroErro}</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            {(() => {
              const algumSelecionado = Object.values(transQtds).some(q => q > 0);

              let pode = false;
              let nomeDestino = "";
              if (transMode === "lista") {
                pode = algumSelecionado && !!transDestino;
                const d = abertas.find(o => o.id === transDestino);
                nomeDestino = d ? fmtComanda(d.comanda) : "";
              } else if (transMode === "numero") {
                const encontrada = abertas.find(o => String(o.comanda).trim() === transNumero.trim() && o.id !== selected?.id);
                pode = algumSelecionado && !!encontrada;
                nomeDestino = encontrada ? fmtComanda(encontrada.comanda) : "";
              } else if (transMode === "nova") {
                pode = algumSelecionado && !!transNomeNova.trim();
                nomeDestino = transNomeNova.trim() ? fmtComanda(transNomeNova.trim()) : "nova comanda";
              }

              return (
                <div className="pdv__transfer-footer">
                  <button
                    onClick={() => setShowTransferir(false)}
                    className="pdv__modal-btn pdv__modal-btn--secundario pdv__transfer-btn-cancelar"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleTransferir}
                    disabled={!pode || transferindo}
                    className={`pdv__modal-btn pdv__modal-btn--primario pdv__transfer-btn-confirmar${pode ? " pdv__transfer-btn-confirmar--pode" : ""}`}
                  >
                    {transferindo
                      ? "Transferindo..."
                      : pode
                        ? <><LuArrowLeftRight size={16} /> Transferindo para {nomeDestino}</>
                        : "Selecione itens e destino"}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>,
        document.body
  );
}
