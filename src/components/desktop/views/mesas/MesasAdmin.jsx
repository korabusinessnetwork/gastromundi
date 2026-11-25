import { LuArmchair, LuPlus, LuSave, LuTriangleAlert } from "react-icons/lu";
import CardMesaAdmin from "./CardMesaAdmin";
import { CARD_W, CARD_H, CARD_GAP } from "@/features/mesas/regras/mapa";
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
      <div className="mesas-admin__loading">Carregando…</div>
    );
  }

  return (
    <div
      className="mesas-admin"
      style={{ "--mesas-pad": `${sz.pad}px`, "--mesas-card-w": `${CARD_W}px`, "--mesas-card-h": `${CARD_H}px` }}
    >

      {/* Header */}
      <div className="mesas-admin__cabecalho">
        <div>
          <div className="mesas-admin__titulo">Mesas</div>
          <div className="mesas-admin__subtitulo">
            {mesas.length} mesa{mesas.length !== 1 ? "s" : ""} cadastrada{mesas.length !== 1 ? "s" : ""}
            {mesas.length > 0 && " · arraste os cards para reposicionar"}
            {ghostCount > 0 && ` · ${ghostCount} em pré-visualização, clique num card tracejado para criar`}
          </div>
        </div>
        <div className="mesas-admin__acoes">
          {posicoesDirty && (
            <button
              onClick={salvarLayout}
              disabled={salvandoLayout}
              className="mesas-admin__botao-cabecalho mesas-admin__botao-salvar"
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
            className="mesas-admin__botao-cabecalho mesas-admin__botao-nova"
          >
            <LuPlus size={15} /> Nova Mesa
          </button>
        </div>
      </div>

      {/* Banner de erro */}
      {erro && (
        <div className="mesas-admin__erro-texto mesas-admin__erro" role="alert">
          <LuTriangleAlert size={15} className="mesas-admin__erro-icone" /> {erro}
        </div>
      )}

      {/* Mapa de mesas */}
      <div className="mesas-admin__mapa">
        {mesas.length === 0 && ghostCount === 0 ? (
          <div className="mesas-admin__vazio">
            <LuArmchair className="mesas-admin__vazio-icone" aria-hidden="true" />
            <div className="mesas-admin__vazio-titulo">
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
            className="mesas-admin__area"
            style={{ "--mesas-area-w": `${containerW}px`, "--mesas-area-h": `${containerH}px` }}
          >
            {/* Grade de encaixe: um contorno por célula, do tamanho exato do
                card. Antes era só um ponto no centro da célula — não dava para
                ver onde uma mesa termina e a outra começa, e arrastar virava
                adivinhação. Com o slot desenhado, o operador vê o alvo antes de
                soltar (princípio nº 1: o próximo passo tem que ser óbvio). */}
            {Array.from({ length: gridRows }).map((_, linha) =>
              Array.from({ length: gridCols }).map((_, coluna) => {
                const cx = coluna + 1, cy = linha + 1;
                const x = coluna * (CARD_W + CARD_GAP);
                const y = linha  * (CARD_H + CARD_GAP);
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
                      style={{ "--mesas-x": `${x}px`, "--mesas-y": `${y}px` }}
                    />
                  );
                }
                return (
                  <button
                    key={`slot-${coluna}-${linha}`}
                    type="button"
                    className="mesas-admin__slot mesas-admin__slot--livre"
                    style={{ "--mesas-x": `${x}px`, "--mesas-y": `${y}px` }}
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
                  style={{ "--mesas-x": `${gx}px`, "--mesas-y": `${gy}px` }}
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
                  className={`mesas-admin__posicao${dragging === m.numero ? " mesas-admin__posicao--arrastando" : ""}`}
                  style={{ "--mesas-x": `${x}px`, "--mesas-y": `${y}px` }}
                >
                  <CardMesaAdmin
                    mesa={m}
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
