import { LuArrowLeft, LuArrowLeftRight, LuPlus, LuX, LuChartBar, LuPencil, LuScanBarcode, LuUser } from "react-icons/lu";
import { FEATURE_BARCODE_SCANNER } from "@/constants/features";
import { fmtComanda } from "./apoio";

// Cabeçalho da Frente de Caixa: título, saldo do dia, nova comanda, alertas e abas.
export default function CabecalhoPdv({ tela }) {
  const {
    mode, selected, cartItems, toast, barcodeInputOpen, setBarcodeInputOpen, barcodeValue, setBarcodeValue, barcodeFeedback, setBarcodeFeedback, caixaAberto, setShowNova, setNomeComanda, setConfirmCancelar, setConfirmCancelarMotivo, setShowSaldo, setSaldoSenha, setSaldoSenhaErro, setSaldoAutorizado, setSaldoSenhaVis, setShowCancelarComanda, setCancelarSenha, setCancelarSenhaErro, setCancelarAutorizado, setCancelarMotivo, abrirTransferir, sz, isCel, emPainel, abertas, abrirEditarMesa, abrirClienteComanda, handleBack, handleBarcodeScan,
  } = tela;
  return (
        <div className="pdv__header" style={{
          // Faixa de topo compacta: header + alerta + abas + busca empilhados
          // comiam ~240px antes do primeiro card. Cada bloco perdeu altura sem
          // perder alvo de toque (ver comentários abaixo).
          padding: `${sz.padSm - 3}px ${sz.pad}px`,
          ...(isCel
            ? { display: "flex", flexDirection: "column", alignItems: "stretch" }
            : { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }),
          gap: sz.gap,
        }}>
          {/* Esquerda: título / voltar */}
          <div className="pdv__header-esq">
            {mode === "pedido" && (
              <button
                onClick={handleBack}
                className="pdv__voltar-btn"
                style={{ padding: `${sz.padSm - 2}px ${sz.padSm + 2}px` }}
              >
                <LuArrowLeft size={16} /> Voltar
              </button>
            )}
            <div className="pdv__header-info" style={isCel ? { flex: 1, justifyContent: "space-between" } : undefined}>
              <div className="pdv__header-titulos">
                <div className="pdv__titulo">
                  {mode === "pedido" ? fmtComanda(selected?.comanda) : "Frente de Caixa"}
                </div>
                <div className="pdv__subtitulo">
                  {mode === "pedido"
                    ? <>
                        {selected?.mesa && <span className="pdv__subtitulo-mesa">🪑 Mesa {selected.mesa}{selected?.apelido ? ` · ${selected.apelido}` : ""} ·</span>}
                        {cartItems.length} {cartItems.length === 1 ? "tipo de item" : "tipos de item"} no carrinho
                      </>
                    : `${abertas.length} comanda${abertas.length !== 1 ? "s" : ""} em aberto`}
                </div>
              </div>
              {emPainel && (
                <button
                  onClick={() => { setShowSaldo(true); setSaldoSenha(""); setSaldoSenhaErro(""); setSaldoAutorizado(false); setSaldoSenhaVis(false); }}
                  title="Saldo do dia"
                  className="pdv__saldo-btn"
                  style={{ padding: `${sz.padSm - 5}px ${sz.pad - 6}px` }}
                >
                  <LuChartBar size={15} /> Saldo do Dia
                </button>
              )}
            </div>
          </div>

          {/* Centro: vazio (só no grid do desktop; no celular não vira linha em branco) */}
          {!isCel && <div />}

          {/* Direita: ações */}
          <div className="pdv__header-acoes" style={{ justifyContent: isCel ? "flex-start" : "flex-end", gap: sz.gap }}>
          {/* Toast inline — visível no mapa/lista após lançar */}
          {emPainel && (
            <div className={`pdv__toast${toast ? " pdv__toast--visivel" : ""}`}>
              ✓ Pedido lançado!
            </div>
          )}
          {emPainel && (
            <button
              onClick={() => { setShowNova(true); setNomeComanda(""); }}
              disabled={!caixaAberto}
              className="pdv__nova-comanda-btn"
              style={{
                padding: `${sz.padSm - 5}px ${sz.pad - 2}px`,
                ...(isCel ? { width: "100%", justifyContent: "center" } : {}),
              }}
            >
              <LuPlus size={sz.fontBase} /> Nova Comanda
            </button>
          )}

          {mode === "pedido" && (() => {
            const itensLancados = Array.isArray(selected?.items) ? selected.items : [];
            return (
              <div className="pdv__acoes-pedido">

                {/* ── Barcode scanner UI (FEATURE_BARCODE_SCANNER) ── */}
                {FEATURE_BARCODE_SCANNER && (
                  <div className="pdv__barcode-bloco">
                    <div className="pdv__barcode-linha">
                      {/* Feedback inline */}
                      {barcodeFeedback && (
                        <span className={`pdv__barcode-feedback pdv__barcode-feedback--${barcodeFeedback === "ok" ? "ok" : "erro"}`}>
                          {barcodeFeedback === "ok" ? "✓ Item adicionado" : "Código não encontrado"}
                        </span>
                      )}
                      {/* Botão toggle scanner */}
                      <button
                        type="button"
                        onClick={() => { setBarcodeInputOpen(v => !v); setBarcodeValue(""); setBarcodeFeedback(null); }}
                        title="Scanner de código de barras"
                        className={`pdv__scanner-btn${barcodeInputOpen ? " pdv__scanner-btn--aberto" : ""}`}
                      >
                        <LuScanBarcode size={16} />
                        Scanner
                      </button>
                    </div>
                    {/* Campo de input manual — colapsável */}
                    {barcodeInputOpen && (
                      <div className="pdv__barcode-campo">
                        <input
                          autoFocus
                          type="text"
                          value={barcodeValue}
                          onChange={e => setBarcodeValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { handleBarcodeScan(barcodeValue.trim()); } }}
                          placeholder="Digite ou escaneie o código..."
                          maxLength={64}
                          className="pdv__barcode-input"
                        />
                        <button
                          type="button"
                          onClick={() => handleBarcodeScan(barcodeValue.trim())}
                          className={`pdv__barcode-ok-btn${barcodeValue.trim() ? " pdv__barcode-ok-btn--ativo" : ""}`}
                        >
                          OK
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Botão Editar Mesa — sempre visível no modo pedido */}
                <button
                  onClick={abrirEditarMesa}
                  title="Editar mesa e apelido"
                  className="pdv__acao-btn pdv__acao-btn--neutro"
                  style={{ padding: `${sz.padSm - 2}px ${sz.padSm}px` }}
                >
                  <LuPencil size={sz.fontBase - 2} />
                  {selected?.mesa ? `Mesa ${selected.mesa}` : "Mesa"}
                </button>

                {/* Botão Cliente — vincula um cliente cadastrado à comanda */}
                <button
                  onClick={abrirClienteComanda}
                  title="Vincular cliente à comanda"
                  className={`pdv__acao-btn pdv__acao-btn--cliente${selected?.cliente_id ? " pdv__acao-btn--cliente-vinculado" : ""}`}
                  style={{ padding: `${sz.padSm - 2}px ${sz.padSm}px` }}
                >
                  <LuUser size={sz.fontBase - 2} />
                  <span className="pdv__acao-btn-texto">
                    {selected?.cliente_nome ? selected.cliente_nome : "Cliente"}
                  </span>
                </button>

                {itensLancados.length > 0 ? (
                  <>
                  <button
                    onClick={abrirTransferir}
                    className="pdv__acao-btn pdv__acao-btn--neutro"
                    style={{ padding: `${sz.padSm - 2}px ${sz.padSm}px` }}
                  >
                    <LuArrowLeftRight size={sz.fontBase - 1} /> Transferir
                  </button>
                  <button
                    onClick={() => { setShowCancelarComanda(true); setCancelarSenha(""); setCancelarSenhaErro(""); setCancelarAutorizado(false); setCancelarMotivo(""); }}
                    className="pdv__acao-btn pdv__acao-btn--cancelar-comanda"
                    style={{ padding: `${sz.padSm - 2}px ${sz.padSm}px` }}
                  >
                    <LuX size={sz.fontBase - 1} /> Cancelar Comanda
                  </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setConfirmCancelar(true); setConfirmCancelarMotivo(""); }}
                    className="pdv__acao-btn pdv__acao-btn--cancelar-pedido"
                    style={{ padding: `${sz.padSm - 2}px ${sz.padSm}px` }}
                  >
                    Cancelar Pedido
                  </button>
                )}
              </div>
            );
          })()}
          </div>
        </div>
  );
}
