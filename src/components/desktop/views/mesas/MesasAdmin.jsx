import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { LuPlus, LuSave, LuTriangleAlert } from "react-icons/lu";
import CardMesaAdmin from "./CardMesaAdmin";
import { CARD_W, CARD_H, CARD_GAP } from "./apoio";
import { useMesasAdmin } from "@/features/mesas/hooks/useMesasAdmin";
import ModalMesa from "./ModalMesa";
import ConfirmarExclusaoMesa from "./ConfirmarExclusaoMesa";
import "./MesasAdmin.css";

export default function MesasAdmin({ sz }) {
  const tela = useMesasAdmin({ sz });
  const {
    mesas, loading, erro, posicoesDirty, salvandoLayout, previewTotal, setPreviewTotal, confirmDelete, setConfirmDelete, dragging, modal, containerRef, ghostCount, ocupadas, ghosts, gridCols, gridRows, containerW, containerH, abrirNovo, abrirNovoEm, abrirEditar, handleDragStart, handleDragEnd, handleDragOver, handleDrop, salvarLayout,
  } = tela;

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mesas-admin__loading" style={{ color: varColor(C.muted), padding: "40px 0", textAlign: "center" }}>
        Carregando…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sz.pad }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="mesas-admin__titulo" style={{ fontWeight: 700 }}>Mesas</div>
          <div className="mesas-admin__subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>
            {mesas.length} mesa{mesas.length !== 1 ? "s" : ""} cadastrada{mesas.length !== 1 ? "s" : ""}
            {mesas.length > 0 && " · arraste os cards para reposicionar"}
            {ghostCount > 0 && ` · ${ghostCount} em pré-visualização, clique num card tracejado para criar`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {posicoesDirty && (
            <button
              onClick={salvarLayout}
              disabled={salvandoLayout}
              className="mesas-admin__botao-cabecalho"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 18px", borderRadius: 10, border: "none",
                background: salvandoLayout ? varColor(C.faint) : varColor(C.green),
                color: "#fff", cursor: salvandoLayout ? "not-allowed" : "pointer",
                fontWeight: 700, fontFamily: "inherit",
                boxShadow: salvandoLayout ? "none" : `0 2px 10px ${alfa(C.green, "44")}`,
                transition: "background 0.15s",
              }}
            >
              <LuSave size={14} /> {salvandoLayout ? "Salvando…" : "Salvar layout"}
            </button>
          )}
          {/* Planejar N mesas: gera cards-fantasma no mapa para visualizar o
              salão antes de criar. Só visual — nada é gravado. (Princípio nº 1:
              o operador vê o layout que quer antes de cadastrar cada mesa.) */}
          <div className="mesas-admin__preview" title="Mostra no mapa quantas mesas você planeja ter, nada é gravado até você criar cada uma">
            <label htmlFor="mesas-preview-total" className="mesas-admin__preview-label">Planejar</label>
            <input
              id="mesas-preview-total"
              type="text"
              inputMode="numeric"
              value={previewTotal}
              onChange={e => setPreviewTotal(e.target.value.replace(/\D/g, ""))}
              placeholder={String(mesas.length)}
              maxLength={3}
              className="mesas-admin__preview-input"
            />
            <span className="mesas-admin__preview-sufixo">mesas</span>
          </div>
          <button
            onClick={abrirNovo}
            className="mesas-admin__botao-cabecalho"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: varColor(C.accent), border: "none", borderRadius: 10,
              color: "#fff", cursor: "pointer", fontWeight: 700,
              padding: "10px 16px", fontFamily: "inherit",
              boxShadow: `0 2px 10px ${alfa(C.accent, "44")}`,
            }}
          >
            <LuPlus size={15} /> Nova Mesa
          </button>
        </div>
      </div>

      {/* Banner de erro */}
      {erro && (
        <div className="mesas-admin__erro-texto" style={{
          padding: "10px 14px", borderRadius: 8,
          background: `${alfa(C.red, "12")}`, border: `1px solid ${alfa(C.red, "33")}`,
          color: varColor(C.red),
          display: "flex", gap: 8, alignItems: "center",
        }}>
          <LuTriangleAlert size={15} style={{ flexShrink: 0 }} /> {erro}
        </div>
      )}

      {/* Mapa de mesas */}
      <div style={{
        background: varColor(C.card), border: `1px solid var(${C.border})`,
        borderRadius: 16, padding: sz.pad,
        overflowX: "auto", overflowY: "auto",
        maxHeight: "calc(100vh - 280px)",
      }}>
        {mesas.length === 0 && ghostCount === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center", color: varColor(C.muted) }}>
            <div className="mesas-admin__vazio-emoji" style={{ marginBottom: 12 }}>🪑</div>
            <div className="mesas-admin__vazio-titulo" style={{ fontWeight: 700, color: varColor(C.text), marginBottom: 4 }}>
              Nenhuma mesa cadastrada
            </div>
            <div className="mesas-admin__vazio-texto">
              Clique em "+ Nova Mesa" para cadastrar a primeira mesa.
            </div>
          </div>
        ) : (
          <div
            ref={containerRef}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
              position: "relative",
              width: containerW,
              height: containerH,
              borderRadius: 8,
            }}
          >
            {/* Grade de encaixe: um contorno por célula, do tamanho exato do
                card. Antes era só um ponto no centro da célula — não dava para
                ver onde uma mesa termina e a outra começa, e arrastar virava
                adivinhação. Com o slot desenhado, o operador vê o alvo antes de
                soltar (princípio nº 1: o próximo passo tem que ser óbvio). */}
            {Array.from({ length: gridRows }).map((_, linha) =>
              Array.from({ length: gridCols }).map((_, coluna) => {
                const cx = coluna + 1, cy = linha + 1;
                const estiloSlot = {
                  left:  coluna * (CARD_W + CARD_GAP),
                  top:   linha  * (CARD_H + CARD_GAP),
                  width: CARD_W,
                  height: CARD_H,
                };
                // Célula ocupada (mesa real ou fantasma da pré-visualização):
                // slot só decorativo, sem clique. Célula livre — inclusive a
                // coluna/linha-buffer do drop, que antes só exibia um card
                // "morto" que não pegava mesa: vira um alvo clicável "criar
                // mesa aqui" (princípio nº 1: todo card vazio no mapa deve
                // permitir criar uma mesa naquela posição). onDragOver mantido
                // para o reposicionamento por arrasto continuar caindo aqui.
                if (ocupadas.has(`${cx},${cy}`)) {
                  return (
                    <div
                      key={`slot-${coluna}-${linha}`}
                      className="mesas-admin__slot"
                      style={estiloSlot}
                    />
                  );
                }
                return (
                  <button
                    key={`slot-${coluna}-${linha}`}
                    type="button"
                    className="mesas-admin__slot mesas-admin__slot--livre"
                    style={estiloSlot}
                    onClick={() => abrirNovoEm({ posicao_x: cx, posicao_y: cy })}
                    onDragOver={handleDragOver}
                    title="Criar mesa aqui"
                    aria-label={`Criar mesa na posição ${cx}, ${cy}`}
                  >
                    <LuPlus size={18} />
                  </button>
                );
              })
            )}

            {/* Cards-fantasma da pré-visualização: mostram o total planejado
                sem gravar nada. Clicar abre "Nova Mesa" já naquela célula. */}
            {ghosts.map(g => {
              const gx = (g.posicao_x - 1) * (CARD_W + CARD_GAP);
              const gy = (g.posicao_y - 1) * (CARD_H + CARD_GAP);
              return (
                <button
                  key={`ghost-${g.posicao_x}-${g.posicao_y}`}
                  type="button"
                  onClick={() => abrirNovoEm(g)}
                  className="mesas-admin__ghost"
                  style={{ left: gx, top: gy, width: CARD_W, height: CARD_H }}
                >
                  <LuPlus size={22} />
                  <span className="mesas-admin__ghost-texto">criar mesa</span>
                </button>
              );
            })}

            {mesas.map(m => {
              const x = ((m.posicao_x ?? 1) - 1) * (CARD_W + CARD_GAP);
              const y = ((m.posicao_y ?? 1) - 1) * (CARD_H + CARD_GAP);
              return (
                <div
                  key={m.numero}
                  style={{
                    position: "absolute", left: x, top: y,
                    opacity: dragging === m.numero ? 0.35 : 1,
                    transition: dragging === m.numero ? "none" : "opacity 0.15s",
                  }}
                >
                  <CardMesaAdmin
                    mesa={m}
                    w={CARD_W} h={CARD_H} sz={sz}
                    onEdit={() => abrirEditar(m)}
                    onDelete={() => setConfirmDelete(m)}
                    onDragStart={e => handleDragStart(e, m.numero)}
                    onDragEnd={handleDragEnd}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal Criar/Editar ─────────────────────────────────────── */}
      {modal && <ModalMesa tela={tela} />}

      {/* ── Modal Confirmar Exclusão ────────────────────────────────── */}
      {confirmDelete && <ConfirmarExclusaoMesa tela={tela} />}
    </div>
  );
}

// ── Card admin (sem status dinâmico) ───────────────────────────────
