// ──────────────────────────────────────────────────────────────────
// ListaArrastavel — reordenar segurando e arrastando (cima/baixo).
//
// Sem dependência: usa Pointer Events, então funciona igual no mouse e
// no toque (PDV/celular). Cada linha tem uma "alça" (⠿) que o dono pega
// para arrastar — o resto da linha continua clicável normalmente
// (Princípio nº 1: a ação de arrastar é óbvia e não atrapalha o toque).
//
// Controlado por id: o pai passa `itens` + `idDe(item)` e recebe, ao
// soltar, a NOVA ORDEM de ids em onReordenar — quem persiste é o pai.
// Durante o arrasto mantemos uma ordem de PRÉVIA local para o reflow ser
// imediato; ao soltar, devolvemos essa ordem e limpamos a prévia.
// ──────────────────────────────────────────────────────────────────
import { useRef, useState } from "react";
import "./ListaArrastavel.css";

function moverPara(arr, id, destino) {
  const de = arr.indexOf(id);
  if (de === -1) return arr;
  const copia = arr.slice();
  copia.splice(de, 1);
  copia.splice(destino, 0, id);
  return copia;
}

export default function ListaArrastavel({
  itens,
  idDe,
  onReordenar,
  renderItem,
  className = "",
}) {
  // ordem: array de ids em prévia enquanto arrasta; null quando parado.
  const [ordem, setOrdem] = useState(null);
  const [arrastandoId, setArrastandoId] = useState(null);
  const linhasRef = useRef({}); // id → nó da linha (para medir posições)

  const lista = Array.isArray(itens) ? itens : [];
  const idsReais = lista.map((it) => String(idDe(it)));

  // Lista exibida: durante o arrasto segue a prévia; senão os itens reais.
  const exibidos = ordem
    ? ordem.map((id) => lista.find((it) => String(idDe(it)) === id)).filter(Boolean)
    : lista;

  function iniciar(e, id) {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setOrdem(idsReais);
    setArrastandoId(id);
  }

  function mover(e, id) {
    if (arrastandoId !== id) return;
    const y = e.clientY;
    setOrdem((prev) => {
      if (!prev) return prev;
      let destino = prev.length - 1;
      for (let i = 0; i < prev.length; i++) {
        const no = linhasRef.current[prev[i]];
        if (!no) continue;
        const r = no.getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          destino = i;
          break;
        }
      }
      return moverPara(prev, id, destino);
    });
  }

  function soltar(e, id) {
    if (arrastandoId !== id) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    const finalOrdem = ordem;
    setArrastandoId(null);
    setOrdem(null);
    // Só avisa o pai se a ordem realmente mudou.
    if (finalOrdem && finalOrdem.join("|") !== idsReais.join("|")) {
      onReordenar?.(finalOrdem);
    }
  }

  return (
    <div className={`lista-arrastavel ${className}`.trim()}>
      {exibidos.map((item) => {
        const id = String(idDe(item));
        const arrastando = arrastandoId === id;
        const alca = {
          className: "arrastar-alca",
          "aria-label": "Arrastar para reordenar",
          title: "Arrastar para reordenar",
          onPointerDown: (e) => iniciar(e, id),
          onPointerMove: (e) => mover(e, id),
          onPointerUp: (e) => soltar(e, id),
          onPointerCancel: (e) => soltar(e, id),
        };
        return (
          <div
            key={id}
            className={`arrastar-linha${arrastando ? " arrastar-linha--ativa" : ""}`}
            ref={(no) => {
              if (no) linhasRef.current[id] = no;
              else delete linhasRef.current[id];
            }}
          >
            {renderItem(item, { alca, arrastando })}
          </div>
        );
      })}
    </div>
  );
}
