import { Fragment, useRef, useEffect, useCallback } from "react";
import { COLUNAS_ITENS, MIN_LARGURA_COLUNA } from "@/lib/impressao/layoutComanda";
import "./LarguraColunas.css";

/**
 * Largura das colunas da lista de itens — o dono arrasta a divisória e
 * decide quanto do papel vai para o nome do produto e quanto vai para os
 * números.
 *
 * É a régua do papel, não uma tabela de exemplo: cada faixa tem a
 * proporção exata que a coluna vai ter impressa, e é a mesma proporção
 * que a térmica converte em contagem de caracteres. Por isso a prévia ao
 * lado muda junto — arrastar aqui e o papel não mudar seria a tela
 * mentindo, que é o defeito que esta aba mais precisa evitar.
 *
 * Arrastar não passa por estado do React: durante o gesto só as custom
 * properties da barra mudam (o valor vai num ref), e o layout inteiro só
 * é recalculado quando se solta. Sem isso a comanda seria remontada a
 * cada pixel de movimento e o arrasto engasgaria.
 */

const ROTULO = { nome: "Item", qtd: "Qtd", unitario: "Unit.", total: "Total" };

// Teclado move de 2 em 2 pontos percentuais: fino o bastante para
// ajustar, grosso o bastante para não exigir vinte toques.
const PASSO_TECLADO = 2;

const arred = (n) => Math.round(n * 10) / 10;

/**
 * Move `delta` pontos percentuais da coluna seguinte para a da esquerda
 * da divisória (ou o contrário, se `delta` for negativo). O que uma
 * perde a outra ganha, então a soma continua 100 — e nenhuma das duas
 * passa do próprio piso. Pura.
 */
function ajustarDe(base, chaves, indice, delta) {
  const a = chaves[indice];
  const b = chaves[indice + 1];
  const soma = base[a] + base[b];
  const limiteMax = soma - MIN_LARGURA_COLUNA[b];
  const novoA = Math.min(limiteMax, Math.max(MIN_LARGURA_COLUNA[a], base[a] + delta));
  return { ...base, [a]: arred(novoA), [b]: arred(soma - novoA) };
}

export default function LarguraColunas({ larguras, mostrarUnitario, onAlterar }) {
  const barraRef = useRef(null);
  const valores = useRef(larguras);
  const arrasto = useRef(null);

  const chaves = COLUNAS_ITENS.filter((c) => c !== "unitario" || mostrarUnitario);

  const pintar = useCallback((atuais) => {
    const barra = barraRef.current;
    if (!barra) return;
    for (const coluna of COLUNAS_ITENS) {
      barra.style.setProperty(`--l-${coluna}`, `${atuais[coluna] ?? 0}%`);
    }
  }, []);

  useEffect(() => {
    valores.current = { ...larguras };
    pintar(larguras);
  }, [larguras, pintar]);

  const aoPegar = (indice) => (e) => {
    const barra = barraRef.current;
    if (!barra) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    arrasto.current = {
      indice,
      inicioX: e.clientX,
      inicio: { ...valores.current },
      largura: barra.getBoundingClientRect().width || 1,
    };
  };

  const aoMover = (e) => {
    const gesto = arrasto.current;
    if (!gesto) return;
    // Sempre a partir de onde o gesto COMEÇOU: aplicar delta sobre delta
    // acumularia o arredondamento e a divisória fugiria do cursor.
    const delta = ((e.clientX - gesto.inicioX) / gesto.largura) * 100;
    valores.current = ajustarDe(gesto.inicio, chaves, gesto.indice, delta);
    pintar(valores.current);
  };

  const aoSoltar = () => {
    if (!arrasto.current) return;
    arrasto.current = null;
    onAlterar(valores.current);
  };

  const aoTeclar = (indice) => (e) => {
    const passo = e.key === "ArrowLeft" ? -PASSO_TECLADO : e.key === "ArrowRight" ? PASSO_TECLADO : 0;
    if (!passo) return;
    e.preventDefault();
    valores.current = ajustarDe(valores.current, chaves, indice, passo);
    pintar(valores.current);
    onAlterar(valores.current);
  };

  return (
    <div className="bloco-comanda__campo">
      <span className="bloco-comanda__rotulo">Largura das colunas</span>

      <div
        ref={barraRef}
        className="larguras"
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
      >
        {chaves.map((coluna, i) => (
          <Fragment key={coluna}>
            <div className={`larguras__col larguras__col--${coluna}`}>
              <span className="larguras__rotulo">{ROTULO[coluna]}</span>
            </div>
            {i < chaves.length - 1 && (
              <button
                type="button"
                className="larguras__divisoria"
                aria-label={`Largura entre ${ROTULO[coluna]} e ${ROTULO[chaves[i + 1]]} — arraste ou use as setas`}
                title="Arraste para mudar a largura"
                onPointerDown={aoPegar(i)}
                onKeyDown={aoTeclar(i)}
              />
            )}
          </Fragment>
        ))}
      </div>

      <span className="bloco-comanda__ajuda">
        Arraste as divisórias para dar mais espaço ao nome do produto ou aos valores. O papel ao
        lado muda junto.
      </span>
    </div>
  );
}
