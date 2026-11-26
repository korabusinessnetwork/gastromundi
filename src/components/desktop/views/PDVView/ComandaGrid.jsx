import { useState } from "react";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuUser, LuClock, LuLock, LuTriangleAlert, LuArmchair, LuCircleCheck, LuSearchX } from "react-icons/lu";
import { totalItensAtivos, comandaEsquecida, HORAS_COMANDA_ESQUECIDA, itensNaoCancelados } from "@/lib/comandaItens";
import "./ComandaGrid.css";
import { fmtComanda } from "@/lib/rotuloComanda";

const TOTAL = 1000;
const PAGE  = 50;
// Há quanto tempo a comanda está aberta, e o tom da etiqueta: "agora" (verde),
// "normal" (apagado), "alerta" (âmbar, de 30 a 59 min) e "atraso" (vermelho,
// uma hora ou mais). As cores moram em ComandaGrid.css, por modificador.
function getElapsed(dateStr) {
  if (!dateStr) return { label: "", tom: "normal" };
  const diff = Date.now() - new Date(dateStr).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return { label: "agora",  tom: "agora"  };
  if (m < 30) return { label: `${m}min`, tom: "normal" };
  if (m < 60) return { label: `${m}min`, tom: "alerta" };
  const h = Math.floor(m / 60);
  const r = m % 60;
  return { label: `${h}h${r > 0 ? `${r}min` : ""}`, tom: "atraso" };
}

// Estado de destaque da comanda, na ordem em que um vence o outro.
function estadoDaComanda({ isSelected, isVisitada, hasItems }) {
  return isSelected ? "selecionada" : isVisitada ? "lancada" : hasItems ? "com-itens" : "vazia";
}

export default function ComandaGrid({ abertas, visitadas = new Set(), selected, onSelect, onOpenEmpty, busca = "", somenteAbertas = false, emUsoPor = () => null }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const [limite, setLimite] = useState(PAGE);

  const mapa = {};
  (abertas ?? []).forEach(o => { mapa[String(o.comanda)] = o; });

  // Um só instante por render: todos os cards medem "há quanto tempo" contra
  // a mesma referência (senão dois cards abertos no mesmo minuto podem cair
  // em faixas diferentes) e não recalculamos Date.now() 50 vezes.
  const agora = Date.now();

  // Espaçamento por largura de tela (sz), passado como variável para o CSS.
  const gradePad = `${sz.pad}px ${sz.pad + 4}px ${sz.pad}px ${sz.pad + 20}px`;

  // ── Modo busca / somente abertas ──────────────────────────────
  // `somenteAbertas` (aba "Comandas abertas"): mesma lista compacta da
  // busca, mas SEM slots vazios — só o que existe e ainda não foi pago,
  // da mais antiga pra mais nova (quem espera há mais tempo primeiro).
  if (busca.trim() || somenteAbertas) {
    const q = busca.trim().toLowerCase();
    const aberasFiltradas = (abertas ?? [])
      .filter(o =>
        !q ||
        String(o.comanda ?? "").toLowerCase().includes(q) ||
        fmtComanda(o.comanda).toLowerCase().includes(q) ||
        (o.garcom ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => somenteAbertas
        ? new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0)
        : 0);
    const numBusca      = !somenteAbertas && /^\d+$/.test(busca.trim()) ? parseInt(busca.trim(), 10) : null;
    const slotDisponivel = numBusca && !mapa[String(numBusca)] ? numBusca : null;
    const vazio          = aberasFiltradas.length === 0 && !slotDisponivel;
    const esquecidas     = aberasFiltradas.filter(o => comandaEsquecida(o, agora).esquecida);

    return (
      <div className="comanda-grid comanda-grid--lista" style={{ "--grade-pad": gradePad }}>
        {vazio ? (
          <div className="comanda-grid__vazio">
            <div className="comanda-grid__vazio-icone">{somenteAbertas && !q ? <LuCircleCheck aria-hidden="true" /> : <LuSearchX aria-hidden="true" />}</div>
            <div className="comanda-grid__vazio-titulo">
              {somenteAbertas && !q ? "Nenhuma comanda em aberto" : "Nenhuma comanda encontrada"}
            </div>
            <div className="comanda-grid__vazio-texto">
              {somenteAbertas && !q
                ? "Todas as comandas foram pagas"
                : `"${busca}" não corresponde a nenhuma comanda em aberto`}
            </div>
          </div>
        ) : (
          <div className="comanda-grid__lista-busca" style={{ "--lista-max": `${Math.min(580, width - sz.pad * 2)}px` }}>
            {/* Comanda aberta há horas e sem nenhum consumo não aparece como
                problema em lugar nenhum: some no meio da lista mostrando
                "Vazio". O aviso junta as duas informações e diz o que fazer —
                a lista já está ordenada da mais antiga pra mais nova, então
                elas estão logo abaixo. */}
            {esquecidas.length > 0 && (
              <div className="comanda-grid__aviso-esquecidas">
                <LuTriangleAlert size={16} className="comanda-grid__aviso-esquecidas-icone" />
                <div>
                  <strong>
                    {esquecidas.length === 1
                      ? "1 comanda aberta sem nenhum consumo"
                      : `${esquecidas.length} comandas abertas sem nenhum consumo`}
                  </strong>
                  <div className="comanda-grid__aviso-esquecidas-texto">
                    Aberta{esquecidas.length === 1 ? "" : "s"} há mais de {HORAS_COMANDA_ESQUECIDA}h e sem itens ativos,
                    ocupa{esquecidas.length === 1 ? "" : "m"} a mesa e distorce{esquecidas.length === 1 ? "" : "m"} o
                    salão. Abra e cancele para liberar.
                  </div>
                </div>
              </div>
            )}

            {slotDisponivel && (
              <button
                onClick={() => onOpenEmpty(String(slotDisponivel))}
                className="comanda-grid__slot-disponivel"
              >
                <div className="comanda-grid__slot-icone">+</div>
                <div>
                  <div className="comanda-grid__slot-titulo">Abrir Comanda {slotDisponivel}</div>
                  <div className="comanda-grid__slot-subtexto">Disponível · clique para abrir</div>
                </div>
              </button>
            )}

            {aberasFiltradas.map(order => {
              const items      = Array.isArray(order.items) ? order.items : [];
              const ativos     = itensNaoCancelados(items);
              const qtdTotal   = ativos.reduce((s, i) => s + (i.qty || 1), 0);
              // Mesma conta do resto do sistema (itens ativos, arredondada).
              // A soma reescrita aqui não protegia `price` ausente: um item sem
              // preço fazia o card mostrar "R$ NaN".
              const total      = totalItensAtivos(items);
              const hasItems   = qtdTotal > 0;
              const isVisitada = visitadas.has(order.id);
              const isSelected = selected?.id === order.id;
              const elapsed    = getElapsed(order.created_at);
              const emUso      = emUsoPor(order);
              const esquecida  = comandaEsquecida(order, agora);
              const estado     = estadoDaComanda({ isSelected, isVisitada, hasItems });

              return (
                <button
                  key={order.id}
                  onClick={() => onSelect(order)}
                  className={`comanda-grid__item-busca comanda-grid__item-busca--${estado}`}
                >
                  {/* Badge número */}
                  <div className="comanda-grid__badge">
                    {/^\d+$/.test(String(order.comanda ?? "").trim()) ? order.comanda : "C"}
                  </div>

                  <div className="comanda-grid__item-corpo">
                    <div className="comanda-grid__item-nome">
                      {fmtComanda(order.comanda) || `#${String(order.id).slice(-4).toUpperCase()}`}
                    </div>
                    <div className="comanda-grid__item-meta">
                      {emUso && (
                        <span className="comanda-grid__item-emuso">
                          <LuLock size={10} /> Em uso · {emUso}
                        </span>
                      )}
                      {order.mesa && (
                        <span className="comanda-grid__tag-mesa">
                          <LuArmchair size={12} className="gm-icone-texto" aria-hidden="true" /> {order.mesa}{order.apelido ? ` · ${order.apelido}` : ""}
                        </span>
                      )}
                      {!order.mesa && order.apelido && (
                        <span className="comanda-grid__tag-mesa">
                          {order.apelido}
                        </span>
                      )}
                      {order.garcom && (
                        <span className="comanda-grid__garcom">
                          <LuUser size={10} /> {order.garcom}
                        </span>
                      )}
                      {esquecida.esquecida && (
                        <span className="comanda-grid__tag-esquecida">
                          Sem consumo há {esquecida.horas}h
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="comanda-grid__item-lado">
                    <div className={`comanda-grid__item-valor${hasItems ? "" : " comanda-grid__item-valor--vazio"}`}>
                      {hasItems ? `R$ ${total.toFixed(2)}` : "Vazio"}
                    </div>
                    <div className={`comanda-grid__item-tempo comanda-tempo--${elapsed.tom}`}>
                      <LuClock size={10} /> {elapsed.label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Modo normal: grid numerado ────────────────────────────────
  return (
    <div className="comanda-grid" style={{
      "--grade-pad": gradePad,
      "--grade-pad-base": `${sz.pad}px`,
      "--card-min": `${sz.comandaCardMin}px`,
      "--grade-gap": `${sz.gap}px`,
      "--card-pad": `${sz.padSm + 2}px`,
      "--card-gap": `${Math.max(4, sz.gap - 5)}px`,
      "--card-msg-min": `${sz.fontSm + 4}px`,
      "--card-rodape-pt": `${sz.padSm - 2}px`,
    }}>
      <div className="comanda-grid__grade">
        {Array.from({ length: limite }, (_, i) => i + 1).map(num => {
          const order = mapa[String(num)];
          return (
            <ComandaCard
              key={num}
              num={num}
              order={order}
              isSelected={selected?.id === order?.id}
              isVisitada={order ? visitadas.has(order.id) : false}
              emUso={order ? emUsoPor(order) : null}
              esquecida={order ? comandaEsquecida(order, agora) : null}
              onClick={() => order ? onSelect(order) : onOpenEmpty(String(num))}
            />
          );
        })}
      </div>

      {limite < TOTAL && (
        <div className="comanda-grid__paginacao">
          <button
            onClick={() => setLimite(l => Math.min(l + PAGE, TOTAL))}
            className="comanda-grid__ver-mais"
          >
            Ver mais · {limite}/{TOTAL}
          </button>
        </div>
      )}
    </div>
  );
}

function ComandaCard({ num, order, isSelected, isVisitada, emUso = null, esquecida = null, onClick }) {
  const [hovered, setHovered] = useState(false);

  if (!order) {
    return (
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`comanda-card comanda-card--livre${hovered ? " comanda-card--hover" : ""}`}
      >
        {/* Header: número + tempo placeholder */}
        <div className="comanda-card__topo">
          <div className="comanda-card__numero">
            {num}
          </div>
          <span className="comanda-card__tempo comanda-card__tempo--oculto">
            <LuClock size={10} /> —
          </span>
        </div>

        {/* Mesa/garçom placeholder — ocupa mesmo espaço */}
        <div className="comanda-card__mensagem">
          {hovered ? "Clique para abrir" : "Disponível"}
        </div>

        {/* Rodapé placeholder */}
        <div className="comanda-card__rodape">
          <span className="comanda-card__rodape-tag comanda-card__rodape-tag--vazio">—</span>
          <span className="comanda-card__rodape-total comanda-card__rodape-total--vazio">—</span>
        </div>
      </button>
    );
  }

  const items    = Array.isArray(order.items) ? order.items : [];
  const ativos   = itensNaoCancelados(items);
  const qtdTotal = ativos.reduce((s, i) => s + (i.qty || 1), 0);
  // Mesma conta do resto do sistema (itens ativos, arredondada). A soma
  // reescrita aqui não protegia `price` ausente: item sem preço fazia o card
  // do grid mostrar "R$ NaN".
  const total    = totalItensAtivos(items);
  const hasItems = qtdTotal > 0;
  const elapsed  = getElapsed(order.created_at);

  const estado   = estadoDaComanda({ isSelected, isVisitada, hasItems });

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`comanda-card comanda-card--ocupada comanda-card--${estado}${hovered ? " comanda-card--hover" : ""}`}
    >
      {/* Header: número + tempo */}
      <div className="comanda-card__topo">
        <div className="comanda-card__numero">
          {num}
        </div>
        <span className={`comanda-card__tempo comanda-tempo--${elapsed.tom}`}>
          <LuClock size={10} /> {elapsed.label}
        </span>
      </div>

      {/* Nome da comanda (se diferente do número) */}
      {!/^\d+$/.test(String(order.comanda ?? "").trim()) && (
        <div className="comanda-card__nome">
          {order.comanda}
        </div>
      )}

      {/* Em uso por outra pessoa (trava de edição) */}
      {emUso && (
        <div className="comanda-card__emuso">
          <LuLock size={10} /> Em uso · {emUso}
        </div>
      )}

      {/* Aberta há horas e sem nada lançado — o card mostrava só "Vazio" e o
          tempo em cantos opostos, e ninguém somava as duas coisas. */}
      {esquecida?.esquecida && (
        <div className="comanda-card__esquecida">
          <LuTriangleAlert size={10} /> Sem consumo há {esquecida.horas}h
        </div>
      )}

      {/* Mesa + apelido + garçom */}
      {(order.mesa || order.apelido || order.garcom) && (
        <div className="comanda-card__meta">
          {order.mesa && (
            <span className="comanda-card__tag-mesa">
              <LuArmchair size={12} className="gm-icone-texto" aria-hidden="true" /> {order.mesa}{order.apelido ? ` · ${order.apelido}` : ""}
            </span>
          )}
          {!order.mesa && order.apelido && (
            <span className="comanda-card__tag-mesa">
              {order.apelido}
            </span>
          )}
          {order.garcom && (
            <span className="comanda-card__garcom">
              <LuUser size={10} /> {order.garcom}
            </span>
          )}
        </div>
      )}

      {/* Rodapé: itens + total */}
      <div className="comanda-card__rodape">
        <span className={`comanda-card__rodape-tag${hasItems ? "" : " comanda-card__rodape-tag--vazio"}`}>
          {hasItems ? `${qtdTotal} ${qtdTotal === 1 ? "item" : "itens"}` : "Vazio"}
        </span>
        <span className={`comanda-card__rodape-total${hasItems ? "" : " comanda-card__rodape-total--vazio"}`}>
          {hasItems ? `R$ ${total.toFixed(2)}` : "—"}
        </span>
      </div>
    </button>
  );
}
