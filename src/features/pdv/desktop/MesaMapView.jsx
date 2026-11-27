import { LuArmchair } from "react-icons/lu";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { totalItensAtivos } from "@/features/comandas/regras/comandaItens";
import { formatarReais } from "@/lib/dinheiro";
import "./MesaMapView.css";

/**
 * A comanda aberta desta mesa, ou null.
 *
 * Não exige item lançado. `MobilePage.persistirLancamento` e a sincronização
 * offline da Ponte criam a comanda com `items: []` ANTES de lançar os itens, e
 * cancelar item por item zera a lista sem fechar a conta. Exigir item fazia a
 * mesa com conta aberta voltar a aparecer "Livre" — e o clique nela abria uma
 * SEGUNDA comanda na mesma mesa.
 *
 * A comparação ignora comanda sem mesa (delivery, balcão): sem isso
 * `String(null) === String(undefined)` casava qualquer uma delas com mesa sem
 * número.
 */
export function comandaAbertaDaMesa(mesa, abertas) {
  const numero = mesa?.numero;
  if (numero == null) return null;
  return (
    (Array.isArray(abertas) ? abertas : []).find(
      (o) => o?.mesa != null && String(o.mesa) === String(numero) && o.status !== "closed"
    ) ?? null
  );
}

export function statusMesa(mesa, abertas) {
  // Conta aberta vence manutenção: a mesa marcada para manutenção com conta em
  // aberto perdia o clique, e não havia caminho no mapa para cobrar essa conta.
  if (comandaAbertaDaMesa(mesa, abertas)) return "aberta";
  if (mesa?.status_manual === "manutencao") return "manutencao";
  if (mesa?.status_manual === "reservada") return "reservada";
  return "livre";
}

// Os quatro status da mesa. As cores ficam no CSS, na classe `mesa-tom--<status>`
// (MesaMapView.css), que define --mesa-cor, --mesa-bg e --mesa-borda; a aba de
// Reservas usa as mesmas classes.
export const STATUS = {
  livre:      { label: "Livre" },
  aberta:     { label: "Aberta" },
  reservada:  { label: "Reservada" },
  manutencao: { label: "Manutenção" },
};

export default function MesaMapView({ mesas, loading, abertas, onSelectComanda, onOpenEmpty }) {
  const { width } = useResponsive();
  const sz = getSizes(width);

  if (loading) {
    return <div className="mesa-map__loading">Carregando mesas...</div>;
  }

  if (mesas.length === 0) {
    return (
      <div className="mesa-map__vazio">
        <LuArmchair className="mesa-map__vazio-icone" aria-hidden="true" />
        <div className="mesa-map__vazio-titulo">Nenhuma mesa cadastrada</div>
        <div className="mesa-map__vazio-texto">
          Cadastre mesas em Configurações para visualizá-las no mapa.
          As vendas funcionam normalmente pelo modo Lista.
        </div>
      </div>
    );
  }

  const cardW = width >= 1024 ? 110 : 90;
  const cardH = width >= 1024 ? 96  : 78;
  const gap   = 12;

  const handleClick = (mesa) => {
    // Conta aberta primeiro: a mesa em manutenção com conta em aberto precisa
    // continuar clicável, senão a conta fica sem como ser cobrada pelo mapa.
    const pedido = comandaAbertaDaMesa(mesa, abertas);
    if (pedido) { onSelectComanda(pedido); return; }
    if (statusMesa(mesa, abertas) === "manutencao") return;
    onOpenEmpty(mesa.numero, { mesa: mesa.numero });
  };

  const temPosicao = mesas.some((m) => m.posicao_x != null && m.posicao_y != null);

  return (
    <div
      className="mesa-map"
      style={{ "--mesa-pad": `${sz.pad}px`, "--mesa-w": `${cardW}px`, "--mesa-h": `${cardH}px` }}
    >
      {/* Legenda de status */}
      <div className="mesa-map__legendas">
        {Object.entries(STATUS).map(([key, s]) => (
          <span key={key} className={`mesa-map__legenda mesa-tom--${key}`}>
            <span className="mesa-map__legenda-ponto" />
            {s.label}
          </span>
        ))}
      </div>

      {temPosicao ? (
        <LayoutAbsoluto
          mesas={mesas} abertas={abertas}
          cardW={cardW} cardH={cardH} gap={gap}
          onClickMesa={handleClick}
        />
      ) : (
        <LayoutGrid
          mesas={mesas} abertas={abertas}
          cardW={cardW} gap={gap}
          totalWidth={width - (sz.pad + 4) * 2}
          onClickMesa={handleClick}
        />
      )}
    </div>
  );
}

function LayoutGrid({ mesas, abertas, cardW, gap, totalWidth, onClickMesa }) {
  const cols = Math.max(2, Math.min(10, Math.floor((totalWidth + gap) / (cardW + gap))));
  return (
    <div className="mesa-map__grid" style={{ "--mesa-cols": cols }}>
      {mesas.map((m) => (
        <CardMesa key={m.numero} mesa={m} abertas={abertas} onClick={onClickMesa} />
      ))}
    </div>
  );
}

function LayoutAbsoluto({ mesas, abertas, cardW, cardH, gap, onClickMesa }) {
  // Mesa sem as duas coordenadas não entra no mapa posicionado: o fallback
  // `?? 1` jogava todas elas em (1,1), empilhadas uma sobre a outra — mesa com
  // conta aberta desaparecia atrás de outra e ficava sem como ser cobrada.
  // Elas vão para uma faixa própria abaixo do mapa, com o que fazer para
  // posicioná-las.
  const posicionadas = mesas.filter((m) => m.posicao_x != null && m.posicao_y != null);
  const semPosicao   = mesas.filter((m) => m.posicao_x == null || m.posicao_y == null);
  const maxX = Math.max(...posicionadas.map((m) => m.posicao_x));
  const maxY = Math.max(...posicionadas.map((m) => m.posicao_y));
  const containerW = maxX * (cardW + gap) - gap;
  const containerH = maxY * (cardH + gap) - gap;
  return (
    <>
      <div
        className="mesa-map__area"
        style={{ "--mesa-area-w": `${containerW}px`, "--mesa-area-h": `${containerH}px` }}
      >
        {posicionadas.map((m) => {
          const x = (m.posicao_x - 1) * (cardW + gap);
          const y = (m.posicao_y - 1) * (cardH + gap);
          return (
            <div key={m.numero} className="mesa-map__posicao" style={{ "--mesa-x": `${x}px`, "--mesa-y": `${y}px` }}>
              <CardMesa mesa={m} abertas={abertas} onClick={onClickMesa} />
            </div>
          );
        })}
      </div>
      {semPosicao.length > 0 && (
        <div className="mesa-map__sem-posicao">
          <div className="mesa-map__sem-posicao-titulo">
            Sem posição no mapa, defina a posição destas mesas em Configurações
          </div>
          <div className="mesa-map__sem-posicao-grid">
            {semPosicao.map((m) => (
              <CardMesa key={m.numero} mesa={m} abertas={abertas} onClick={onClickMesa} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CardMesa({ mesa, abertas, onClick }) {
  const st     = statusMesa(mesa, abertas);
  const s      = STATUS[st];
  const pedido = comandaAbertaDaMesa(mesa, abertas);
  // Mesma conta do resto do sistema (itens ativos, arredondada). A soma
  // reescrita aqui podia divergir por centavos do valor cobrado no checkout.
  const total  = totalItensAtivos(pedido?.items);

  return (
    <div
      className={`card-mesa mesa-tom--${st}`}
      onClick={() => onClick(mesa)}
      title={`Mesa ${mesa.numero}, ${s.label}${pedido?.garcom ? ` · ${pedido.garcom}` : ""}`}
    >
      <div className="card-mesa__numero">{mesa.numero}</div>
      <div className="card-mesa__status">{s.label}</div>
      {total > 0 && (
        <div className="card-mesa__valor">{formatarReais(total)}</div>
      )}
      {pedido?.garcom && (
        <div className="card-mesa__garcom">{pedido.garcom}</div>
      )}
      {st === "livre" && mesa.capacidade != null && (
        <div className="card-mesa__capacidade">{mesa.capacidade}p</div>
      )}
    </div>
  );
}
