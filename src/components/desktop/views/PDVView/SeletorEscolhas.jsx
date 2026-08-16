import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { resolverOpcoes } from "@/lib/gruposEscolha";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuX, LuCheck } from "react-icons/lu";
import "./SeletorEscolhas.css";

/**
 * SeletorEscolhas — modal do PDV onde o operador monta um item que tem
 * grupos de escolha: combo flexível ("qual hambúrguer? qual refri?") ou
 * produto com seleção ("qual refrigerante?"). A MESMA peça serve os dois.
 *
 * Recebe os grupos (shape do app), resolve as opções reais contra o
 * catálogo (resolverOpcoes) e devolve `escolhas` no formato do carrinho:
 * [{ produtoId, nome, qtd, preco }] — `preco` é o acréscimo da opção.
 *
 * Por que é intuitivo (princípio nº 1): uma pergunta por vez, opções em
 * cartões grandes de tocar, o que já foi escolhido aparece marcado, o
 * total muda na hora, e o botão de confirmar só habilita quando todas as
 * escolhas obrigatórias foram feitas — o operador não consegue errar.
 */

function fmtBRL(v) {
  return `R$ ${Number(v || 0).toFixed(2)}`;
}

// Texto de instrução do grupo em português claro.
function instrucaoGrupo(min, max) {
  if (min === 0 && max === 1) return "Opcional — escolha 1 se quiser";
  if (min === 0) return `Opcional — até ${max}`;
  if (min === max) return `Escolha ${min}`;
  return `Escolha de ${min} a ${max}`;
}

export default function SeletorEscolhas({ titulo, emoji, precoBase = 0, grupos = [], products = [], onConfirmar, onClose }) {
  // opções resolvidas por grupo, uma vez
  const gruposResolvidos = useMemo(
    () => grupos.map((g) => ({ ...g, opcoes: resolverOpcoes(g, products) })),
    [grupos, products],
  );

  // seleção: para cada grupo (índice), lista de produtoId escolhidos
  const [selecao, setSelecao] = useState(() => grupos.map(() => []));

  const toggle = (gi, produtoId) => {
    setSelecao((prev) => {
      const g = gruposResolvidos[gi];
      const atual = prev[gi] ?? [];
      const jaTem = atual.some((id) => String(id) === String(produtoId));
      let nova;
      if (jaTem) {
        nova = atual.filter((id) => String(id) !== String(produtoId));
      } else if ((g.maximo ?? 1) === 1) {
        nova = [produtoId]; // seleção única: substitui
      } else if (atual.length >= (g.maximo ?? 1)) {
        return prev; // já no máximo — ignora (o cartão fica desabilitado)
      } else {
        nova = [...atual, produtoId];
      }
      return prev.map((s, i) => (i === gi ? nova : s));
    });
  };

  // escolhas achatadas no formato do carrinho
  const escolhas = useMemo(() => {
    const out = [];
    gruposResolvidos.forEach((g, gi) => {
      for (const id of selecao[gi] ?? []) {
        const op = g.opcoes.find((o) => String(o.produtoId) === String(id));
        if (op) out.push({ produtoId: op.produtoId, nome: op.nome, qtd: 1, preco: Number(op.preco) || 0 });
      }
    });
    return out;
  }, [gruposResolvidos, selecao]);

  const total = useMemo(
    () => Number(precoBase || 0) + escolhas.reduce((s, e) => s + e.preco * e.qtd, 0),
    [precoBase, escolhas],
  );

  // todas as escolhas obrigatórias satisfeitas?
  const faltando = gruposResolvidos.filter((g, gi) => (selecao[gi]?.length ?? 0) < (g.minimo ?? 0));
  const podeConfirmar = faltando.length === 0;

  const confirmar = () => {
    if (!podeConfirmar) return;
    onConfirmar(escolhas);
  };

  return createPortal(
    <div {...fecharAoClicarFora(onClose)} className="seletor-escolhas__overlay">
      <div className="seletor-escolhas__modal">
        {/* Título */}
        <div className="seletor-escolhas__topo">
          <div className="seletor-escolhas__titulo-wrap">
            <span className="seletor-escolhas__titulo-emoji">{emoji ?? "🍽️"}</span>
            <div className="seletor-escolhas__titulo">{titulo}</div>
          </div>
          <button onClick={onClose} className="seletor-escolhas__fechar"><LuX size={20} /></button>
        </div>

        {/* Grupos */}
        <div className="seletor-escolhas__grupos">
          {gruposResolvidos.map((g, gi) => {
            const sel = selecao[gi] ?? [];
            const noMax = sel.length >= (g.maximo ?? 1);
            const incompleto = sel.length < (g.minimo ?? 0);
            return (
              <div key={g.id ?? gi} className="seletor-escolhas__grupo">
                <div className="seletor-escolhas__grupo-topo">
                  <div className="seletor-escolhas__grupo-nome">{g.nome}</div>
                  <span
                    className="seletor-escolhas__grupo-instrucao"
                    style={{
                      background: incompleto ? alfa(C.accent, "18") : alfa(C.green, "18"),
                      color: incompleto ? varColor(C.accent) : varColor(C.green),
                    }}
                  >
                    {instrucaoGrupo(g.minimo ?? 0, g.maximo ?? 1)}
                  </span>
                </div>

                {g.opcoes.length === 0 ? (
                  <div className="seletor-escolhas__vazio">Nenhuma opção disponível.</div>
                ) : (
                  <div className="seletor-escolhas__opcoes">
                    {g.opcoes.map((op) => {
                      const escolhida = sel.some((id) => String(id) === String(op.produtoId));
                      const bloqueada = !escolhida && noMax && (g.maximo ?? 1) > 1;
                      return (
                        <button
                          key={op.produtoId}
                          type="button"
                          disabled={bloqueada}
                          onClick={() => toggle(gi, op.produtoId)}
                          className="seletor-escolhas__opcao"
                          style={{
                            borderColor: escolhida ? varColor(C.accent) : varColor(C.border),
                            background: escolhida ? alfa(C.accent, "12") : varColor(C.surface),
                            opacity: bloqueada ? 0.45 : 1,
                            cursor: bloqueada ? "not-allowed" : "pointer",
                          }}
                        >
                          <span className="seletor-escolhas__opcao-emoji">{op.emoji ?? "📦"}</span>
                          <span className="seletor-escolhas__opcao-nome">{op.nome}</span>
                          {op.preco > 0 && (
                            <span className="seletor-escolhas__opcao-acrescimo">+{fmtBRL(op.preco)}</span>
                          )}
                          <span
                            className="seletor-escolhas__opcao-check"
                            style={{
                              borderColor: escolhida ? varColor(C.accent) : varColor(C.border),
                              background: escolhida ? varColor(C.accent) : "transparent",
                            }}
                          >
                            {escolhida && <LuCheck size={14} color="#fff" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rodapé: total + confirmar */}
        <div className="seletor-escolhas__rodape">
          <div className="seletor-escolhas__total">
            <span className="seletor-escolhas__total-label">Total</span>
            <span className="seletor-escolhas__total-valor">{fmtBRL(total)}</span>
          </div>
          <button
            type="button"
            onClick={confirmar}
            disabled={!podeConfirmar}
            className="seletor-escolhas__confirmar"
            style={{
              background: podeConfirmar ? varColor(C.accent) : varColor(C.faint),
              cursor: podeConfirmar ? "pointer" : "not-allowed",
            }}
          >
            {podeConfirmar ? "Adicionar ao pedido" : "Faça as escolhas obrigatórias"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
