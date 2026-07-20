// ──────────────────────────────────────────────────────────────────
// ProdutoModal — escolha de complementos + observação + quantidade.
//
// Respeita min/max por grupo (grupoSatisfeito / produtoPodeAdicionar):
// o botão "adicionar" só libera quando todos os obrigatórios estão ok
// (prevenção de erro > mensagem de erro, Princípio nº 1). Só calcula
// preço para EXIBIR — o servidor recalcula ao gravar.
// ──────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import {
  formatarPreco,
  grupoSatisfeito,
  produtoPodeAdicionar,
} from "@/lib/delivery";

export default function ProdutoModal({ produto, onFechar, onAdicionar }) {
  // selecoesPorGrupo: grupoId → [complementoId]
  const [selecoes, setSelecoes] = useState({});
  const [obs, setObs] = useState("");
  const [qtd, setQtd] = useState(1);

  const grupos = produto?.grupos ?? [];

  function alternar(grupo, comp) {
    setSelecoes((prev) => {
      const atual = prev[grupo.id] ?? [];
      const jaTem = atual.includes(comp.id);
      const max = Number(grupo.max);
      // Grupo de escolha única (max 1): troca a seleção.
      if (max === 1) {
        return { ...prev, [grupo.id]: jaTem ? [] : [comp.id] };
      }
      if (jaTem) {
        return { ...prev, [grupo.id]: atual.filter((id) => id !== comp.id) };
      }
      // Respeita o máximo do grupo (0 = sem limite).
      if (max > 0 && atual.length >= max) return prev;
      return { ...prev, [grupo.id]: [...atual, comp.id] };
    });
  }

  // Complementos escolhidos (com preço) — para exibir e montar o item.
  const complementosEscolhidos = useMemo(() => {
    const escolhidos = [];
    for (const g of grupos) {
      const ids = selecoes[g.id] ?? [];
      for (const c of g.itens ?? []) {
        if (ids.includes(c.id)) escolhidos.push({ id: c.id, nome: c.nome, preco: c.preco });
      }
    }
    return escolhidos;
  }, [grupos, selecoes]);

  const podeAdicionar = produtoPodeAdicionar(produto, selecoes);

  const precoUnit = useMemo(() => {
    const base = Number(produto?.preco) || 0;
    const extras = complementosEscolhidos.reduce((a, c) => a + (Number(c.preco) || 0), 0);
    return base + extras;
  }, [produto, complementosEscolhidos]);

  function adicionar() {
    if (!podeAdicionar) return;
    onAdicionar({
      produto_id: produto.produto_id,
      combo_id: produto.combo_id ?? null,
      nome: produto.nome,
      preco: Number(produto.preco) || 0,
      qtd,
      complementosEscolhidos,
      obs: obs.trim(),
    });
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-topo">
          <h2 className="modal-titulo">{produto?.nome}</h2>
          <button className="modal-fechar" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="modal-corpo">
          {produto?.descricao && (
            <p className="card-produto__desc" style={{ marginBottom: 20 }}>
              {produto.descricao}
            </p>
          )}

          {grupos.map((g) => {
            const ids = selecoes[g.id] ?? [];
            const obrigatorio = Number(g.min) > 0;
            const escolhaUnica = Number(g.max) === 1;
            const ok = grupoSatisfeito(g, ids.length);
            return (
              <div className="grupo" key={g.id}>
                <div className="grupo__cabecalho">
                  <h3 className="grupo__nome">{g.nome}</h3>
                  <span
                    className={`grupo__regra${obrigatorio && !ok ? " grupo__regra--obrig" : ""}`}
                  >
                    {obrigatorio ? "Obrigatório" : "Opcional"}
                    {Number(g.max) > 1 ? ` · até ${g.max}` : ""}
                  </span>
                </div>
                {(g.itens ?? []).map((c) => {
                  const ativa = ids.includes(c.id);
                  return (
                    <div
                      className={`opcao${ativa ? " opcao--ativa" : ""}`}
                      key={c.id}
                      onClick={() => alternar(g, c)}
                    >
                      <span
                        className={`opcao__marca${escolhaUnica ? " opcao__marca--radio" : ""}`}
                      >
                        {ativa ? "✓" : ""}
                      </span>
                      <span className="opcao__nome">{c.nome}</span>
                      {Number(c.preco) > 0 && (
                        <span className="opcao__preco">+ {formatarPreco(c.preco)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="campo">
            <label className="campo__label" htmlFor="obs-produto">
              Alguma observação?
            </label>
            <textarea
              id="obs-produto"
              className="campo__textarea"
              placeholder="Ex.: sem cebola, ponto da carne bem passado…"
              value={obs}
              maxLength={200}
              onChange={(e) => setObs(e.target.value)}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <span className="campo__label" style={{ marginBottom: 0 }}>
              Quantidade
            </span>
            <div className="qtd">
              <button
                className="qtd__botao"
                onClick={() => setQtd((q) => Math.max(1, q - 1))}
                disabled={qtd <= 1}
                aria-label="Diminuir"
              >
                −
              </button>
              <span className="qtd__valor">{qtd}</span>
              <button
                className="qtd__botao"
                onClick={() => setQtd((q) => Math.min(99, q + 1))}
                aria-label="Aumentar"
              >
                +
              </button>
            </div>
          </div>

          <button className="btn btn--primario" onClick={adicionar} disabled={!podeAdicionar}>
            <span>{podeAdicionar ? "Adicionar" : "Escolha os obrigatórios"}</span>
            <span className="btn__preco">{formatarPreco(precoUnit * qtd)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
