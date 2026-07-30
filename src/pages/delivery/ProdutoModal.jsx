// ──────────────────────────────────────────────────────────────────
// ProdutoModal — escolha de complementos + observação + quantidade.
//
// Respeita min/max por grupo (grupoSatisfeito / produtoPodeAdicionar):
// o CTA só libera quando todos os obrigatórios estão ok (prevenção de
// erro > mensagem de erro, Princípio nº 1). Quando o cliente tenta
// adicionar sem completar, GUIAMOS: rola e destaca o 1º grupo pendente.
//
// Layout intuitivo: hero do produto no topo, corpo rolável, e o CTA
// (quantidade + adicionar/preço) fixo no rodapé — a próxima ação nunca
// some no scroll. Observação fica colapsada até o cliente querer (menos
// poluição). Só calcula preço para EXIBIR — o servidor recalcula ao gravar.
// ──────────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from "react";
import {
  formatarPreco,
  grupoSatisfeito,
  produtoPodeAdicionar,
  produtoImpossivel,
  rotuloRegraGrupo,
  primeiroGrupoPendente,
  achatarGrupos,
} from "@/lib/delivery";

// ──────────────────────────────────────────────────────────────────
// GrupoBloco — renderiza UM grupo (cabeçalho + opções) e, recursivamente,
// os subgrupos aninhados abaixo dele (estilo iFood). Cada subgrupo é um
// grupo normal com id próprio, então a seleção continua um mapa plano
// (selecoes[grupo.id]); o aninhamento só muda o DESENHO (indentação) e a
// caminhada de validação. Intuitivo: o cliente vê "grupo > subgrupos"
// como uma lista recuada, sem precisar entender que é reciclável.
// ──────────────────────────────────────────────────────────────────
function GrupoBloco({ grupo, nivel, selecoes, destaque, onAlternar, registrarRef }) {
  const ids = selecoes[grupo.id] ?? [];
  const obrigatorio = Number(grupo.min) > 0;
  const max = Number(grupo.max) > 0 ? Number(grupo.max) : 0; // 0 = sem limite
  const escolhaUnica = max === 1;
  const ok = grupoSatisfeito(grupo, ids.length);
  const pendente = destaque === grupo.id;
  const subgrupos = grupo.subgrupos ?? [];
  // Chegou ao teto do grupo. Escolha única não conta: ali tocar em outra
  // opção troca a escolha, que é o comportamento esperado de um rádio.
  const noLimite = max > 1 && ids.length >= max;

  return (
    <div
      className={
        `grupo${nivel > 0 ? " grupo--sub" : ""}${pendente ? " grupo--pendente" : ""}`
      }
      ref={(node) => registrarRef(grupo.id, node)}
    >
      <div className="grupo__cabecalho">
        <h3 className="grupo__nome">{grupo.nome}</h3>
        <span
          className={
            "grupo__regra" +
            (obrigatorio && ok ? " grupo__regra--ok" : "") +
            (obrigatorio && !ok ? " grupo__regra--obrig" : "")
          }
        >
          {noLimite
            ? `Máximo ${max} — desmarque para trocar`
            : obrigatorio && ok
              ? "✓ pronto"
              : rotuloRegraGrupo(grupo)}
        </span>
      </div>
      {(grupo.itens ?? []).map((c) => {
        const ativa = ids.includes(c.id);
        const bloqueada = noLimite && !ativa;
        return (
          <button
            type="button"
            className={`opcao${ativa ? " opcao--ativa" : ""}${bloqueada ? " opcao--bloqueada" : ""}`}
            key={c.id}
            onClick={() => onAlternar(grupo, c)}
            aria-pressed={ativa}
            disabled={bloqueada}
          >
            <span className={`opcao__marca${escolhaUnica ? " opcao__marca--radio" : ""}`}>
              {ativa ? "✓" : ""}
            </span>
            <span className="opcao__nome">{c.nome}</span>
            {Number(c.preco) > 0 && (
              <span className="opcao__preco">+ {formatarPreco(c.preco)}</span>
            )}
          </button>
        );
      })}
      {subgrupos.length > 0 && (
        <div className="grupo__subgrupos">
          {subgrupos.map((sub) => (
            <GrupoBloco
              key={sub.id}
              grupo={sub}
              nivel={nivel + 1}
              selecoes={selecoes}
              destaque={destaque}
              onAlternar={onAlternar}
              registrarRef={registrarRef}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProdutoModal({ produto, lojaAberta = true, onFechar, onAdicionar }) {
  // selecoesPorGrupo: grupoId → [complementoId]
  const [selecoes, setSelecoes] = useState({});
  const [obs, setObs] = useState("");
  const [mostrarObs, setMostrarObs] = useState(false);
  const [qtd, setQtd] = useState(1);
  const [destaque, setDestaque] = useState(null); // id do grupo a destacar
  const gruposRef = useRef({}); // grupoId → nó, para rolar até o pendente

  const grupos = produto?.grupos ?? [];

  function alternar(grupo, comp) {
    setDestaque(null); // qualquer escolha limpa o destaque de erro
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
  // Achata a árvore (raiz + subgrupos) para não perder escolhas aninhadas.
  const complementosEscolhidos = useMemo(() => {
    const escolhidos = [];
    for (const g of achatarGrupos(grupos)) {
      const ids = selecoes[g.id] ?? [];
      for (const c of g.itens ?? []) {
        if (ids.includes(c.id)) escolhidos.push({ id: c.id, nome: c.nome, preco: c.preco });
      }
    }
    return escolhidos;
  }, [grupos, selecoes]);

  const podeAdicionar = produtoPodeAdicionar(produto, selecoes);
  // Grupo obrigatório sem nenhuma opção disponível (o dono marcou "acabou")
  // deixa o produto impedido de sair: não existe escolha que o libere. Sem
  // dizer isso, o CTA fica pedindo "Escolha os obrigatórios" para sempre e
  // manda o cliente procurar o que não existe.
  const indisponivel = produtoImpossivel(produto);
  // Fora do horário a barra da sacola não existe (ela só aparece com a loja
  // aberta). O "Adicionar" continuava clicável: o item entrava na sacola
  // invisível, o modal fechava e a tela ficava EXATAMENTE igual. O cliente
  // tocava de novo, e de novo — e reencontrava a pilha de repetidos quando
  // a loja abrisse. O CTA agora diz por que não dá.
  const fechada = !lojaAberta;

  const precoUnit = useMemo(() => {
    const base = Number(produto?.preco) || 0;
    const extras = complementosEscolhidos.reduce((a, c) => a + (Number(c.preco) || 0), 0);
    return base + extras;
  }, [produto, complementosEscolhidos]);

  function adicionar() {
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

  // Clique no CTA: adiciona, ou conduz o cliente ao primeiro grupo pendente.
  function tentarAdicionar() {
    if (fechada) return;
    if (podeAdicionar) {
      adicionar();
      return;
    }
    const pendente = primeiroGrupoPendente(produto, selecoes);
    if (pendente) {
      setDestaque(pendente);
      gruposRef.current[pendente]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-painel modal-painel--produto" onClick={(e) => e.stopPropagation()}>
        <div className="modal-topo">
          <h2 className="modal-titulo">{produto?.nome}</h2>
          <button className="modal-fechar" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="modal-corpo">
          {/* Hero — confirma visualmente o que o cliente clicou */}
          <div className="produto-hero">
            {produto?.foto_url ? (
              <img className="produto-hero__foto" src={produto.foto_url} alt={produto.nome} />
            ) : (
              <div className="produto-hero__foto produto-hero__foto--emoji" aria-hidden="true">
                {produto?.emoji || "🍽️"}
              </div>
            )}
            {produto?.descricao && <p className="produto-hero__desc">{produto.descricao}</p>}
          </div>

          {grupos.map((g) => (
            <GrupoBloco
              key={g.id}
              grupo={g}
              nivel={0}
              selecoes={selecoes}
              destaque={destaque}
              onAlternar={alternar}
              registrarRef={(id, node) => {
                gruposRef.current[id] = node;
              }}
            />
          ))}

          {/* Observação colapsável — só ocupa espaço quando o cliente quer */}
          {mostrarObs || obs ? (
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
                autoFocus={mostrarObs && !obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </div>
          ) : (
            <button
              type="button"
              className="obs-toggle"
              onClick={() => setMostrarObs(true)}
            >
              + Adicionar observação
            </button>
          )}
        </div>

        {/* Rodapé fixo — a próxima ação nunca some no scroll */}
        <div className="modal-rodape">
          <div className="qtd" role="group" aria-label="Quantidade">
            <button
              className="qtd__botao"
              onClick={() => setQtd((q) => Math.max(1, q - 1))}
              disabled={qtd <= 1}
              aria-label="Diminuir quantidade"
            >
              −
            </button>
            <span className="qtd__valor" aria-live="polite">
              {qtd}
            </span>
            <button
              className="qtd__botao"
              onClick={() => setQtd((q) => Math.min(99, q + 1))}
              aria-label="Aumentar quantidade"
            >
              +
            </button>
          </div>

          <button
            className={`btn btn--primario${podeAdicionar && !fechada ? "" : " btn--bloqueado"}`}
            onClick={tentarAdicionar}
            aria-disabled={!podeAdicionar || fechada}
          >
            <span>
              {fechada
                ? "Fechado no momento"
                : indisponivel
                  ? "Indisponível no momento"
                  : podeAdicionar
                    ? "Adicionar"
                    : "Escolha os obrigatórios"}
            </span>
            <span className="btn__preco">{formatarPreco(precoUnit * qtd)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
