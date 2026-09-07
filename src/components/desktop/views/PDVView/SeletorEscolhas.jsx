import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { resolverOpcoes } from "@/lib/gruposEscolha";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuX, LuCheck, LuMinus } from "react-icons/lu";
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

// Texto de instrução do grupo em português claro. O número conta UNIDADES,
// não opções diferentes: "escolha até 2" aceita dois cheddar, e é assim que
// o cliente pede — "double cheddar", não "dois adicionais distintos".
function instrucaoGrupo(min, max) {
  if (min === 0 && max === 1) return "Opcional — escolha 1 se quiser";
  if (min === 0) return `Opcional — até ${max}`;
  if (min === max) return `Escolha ${min}`;
  return `Escolha de ${min} a ${max}`;
}

const unidades = (qtds) => Object.values(qtds ?? {}).reduce((t, n) => t + n, 0);

export default function SeletorEscolhas({ titulo, emoji, precoBase = 0, grupos = [], products = [], onConfirmar, onClose }) {
  // opções resolvidas por grupo, uma vez
  const gruposResolvidos = useMemo(
    () => grupos.map((g) => ({ ...g, opcoes: resolverOpcoes(g, products) })),
    [grupos, products],
  );

  // Seleção: por grupo, quantas unidades de cada opção. Era uma lista de
  // ids (marcado/desmarcado), o que impedia pedir a MESMA opção duas vezes
  // — o "double cheddar" não tinha como ser lançado. O carrinho e a baixa
  // de estoque já sabiam somar `qtd`; só a escolha não deixava passar de 1.
  const [selecao, setSelecao] = useState(() => grupos.map(() => ({})));

  const alterar = (gi, produtoId, passo) => {
    setSelecao((prev) => {
      const g = gruposResolvidos[gi];
      const max = g.maximo ?? 1;
      const atual = prev[gi] ?? {};
      const chave = String(produtoId);
      const qtd = atual[chave] ?? 0;

      // Escolha única: clicar troca de opção em vez de somar — é o que o
      // operador espera de "qual hambúrguer?".
      if (max === 1) {
        const nova = qtd > 0 ? {} : { [chave]: 1 };
        return prev.map((s, i) => (i === gi ? nova : s));
      }

      const proxima = qtd + passo;
      if (proxima < 0) return prev;
      if (passo > 0 && unidades(atual) >= max) return prev;

      const nova = { ...atual };
      if (proxima === 0) delete nova[chave];
      else nova[chave] = proxima;
      return prev.map((s, i) => (i === gi ? nova : s));
    });
  };

  // escolhas achatadas no formato do carrinho
  const escolhas = useMemo(() => {
    const out = [];
    gruposResolvidos.forEach((g, gi) => {
      for (const [id, qtd] of Object.entries(selecao[gi] ?? {})) {
        const op = g.opcoes.find((o) => String(o.produtoId) === String(id));
        if (op && qtd > 0) out.push({ produtoId: op.produtoId, nome: op.nome, qtd, preco: Number(op.preco) || 0 });
      }
    });
    return out;
  }, [gruposResolvidos, selecao]);

  const total = useMemo(
    () => Number(precoBase || 0) + escolhas.reduce((s, e) => s + e.preco * e.qtd, 0),
    [precoBase, escolhas],
  );

  // todas as escolhas obrigatórias satisfeitas?
  const faltando = gruposResolvidos.filter((g, gi) => unidades(selecao[gi]) < (g.minimo ?? 0));
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
            const sel = selecao[gi] ?? {};
            const usadas = unidades(sel);
            const max = g.maximo ?? 1;
            const noMax = usadas >= max;
            const incompleto = usadas < (g.minimo ?? 0);
            // Só faz sentido repetir a mesma opção quando o grupo aceita
            // mais de uma unidade; com "escolha 1" o clique troca.
            const repetivel = max > 1;
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
                      const qtd = sel[String(op.produtoId)] ?? 0;
                      const escolhida = qtd > 0;
                      // Cheia a cota, o que já foi escolhido continua clicável
                      // (para tirar); só o que ainda não entrou é barrado.
                      const bloqueada = !escolhida && noMax && max > 1;
                      return (
                        <div key={op.produtoId} className="seletor-escolhas__opcao-wrap">
                          <button
                            type="button"
                            disabled={bloqueada || (escolhida && repetivel && noMax)}
                            onClick={() => alterar(gi, op.produtoId, 1)}
                            aria-label={repetivel ? `Somar um ${op.nome}` : op.nome}
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
                              {escolhida && (repetivel ? <b>{qtd}</b> : <LuCheck size={14} color="#fff" />)}
                            </span>
                          </button>

                          {/* Fora do <button> porque botão dentro de botão é
                              marcação inválida — visualmente ele fica no canto
                              do cartão, ver SeletorEscolhas.css. */}
                          {escolhida && repetivel && (
                            <button
                              type="button"
                              onClick={() => alterar(gi, op.produtoId, -1)}
                              aria-label={`Tirar um ${op.nome}`}
                              title="Tirar um"
                              className="seletor-escolhas__menos"
                            >
                              <LuMinus size={14} />
                            </button>
                          )}
                        </div>
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
