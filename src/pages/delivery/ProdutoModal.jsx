// ──────────────────────────────────────────────────────────────────
// ProdutoModal — escolha de complementos + observação + quantidade.
//
// Respeita min/max por grupo (grupoSatisfeito / produtoPodeAdicionar):
// o CTA só libera quando todos os obrigatórios estão ok (prevenção de
// erro > mensagem de erro, Princípio nº 1). Quando o cliente tenta
// adicionar sem completar, GUIAMOS: rola e destaca o 1º grupo pendente.
//
// A escolha é por QUANTIDADE, não por marcado/desmarcado: "2 de
// calabresa e 1 de portuguesa" é um pedido de três fatias, e o mínimo e
// o máximo do grupo contam fatias. É o que o PDV já fazia; era só a
// vitrine que contava opções distintas e não deixava repetir.
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
  rotuloProgressoGrupo,
  primeiroGrupoPendente,
  achatarGrupos,
  precoDosComplementos,
  unidadesDoGrupo,
  combinaComBusca,
} from "@/lib/delivery";
import { useSairDoModal } from "./useSairDoModal";
import "./ProdutoModal.css";

// A partir de quantas opções o grupo ganha campo de busca. Abaixo disso a
// lista inteira cabe na rolagem e um campo a mais só atrapalharia; acima,
// achar "coxinha da asa" no meio de vinte cortes vira trabalho.
const MUITAS_OPCOES = 8;

// ──────────────────────────────────────────────────────────────────
// GrupoBloco — renderiza UM grupo (cabeçalho + opções) e, recursivamente,
// os subgrupos aninhados abaixo dele (estilo iFood). Cada subgrupo é um
// grupo normal com id próprio, então a seleção continua um mapa plano
// (selecoes[grupo.id]); o aninhamento só muda o DESENHO (indentação) e a
// caminhada de validação. Intuitivo: o cliente vê "grupo > subgrupos"
// como uma lista recuada, sem precisar entender que é reciclável.
// ──────────────────────────────────────────────────────────────────
function GrupoBloco({
  grupo,
  nivel,
  selecoes,
  destaque,
  passo,
  totalPassos,
  onAjustar,
  registrarRef,
}) {
  const [busca, setBusca] = useState("");
  const escolhido = selecoes[grupo.id] ?? {};
  const unidades = unidadesDoGrupo(escolhido);
  const obrigatorio = Number(grupo.min) > 0;
  const max = Number(grupo.max) > 0 ? Number(grupo.max) : 0; // 0 = sem limite
  const escolhaUnica = max === 1;
  const ok = grupoSatisfeito(grupo, unidades);
  const pendente = destaque === grupo.id;
  const subgrupos = grupo.subgrupos ?? [];
  // Chegou ao teto do grupo. Escolha única não conta: ali tocar em outra
  // opção troca a escolha, que é o comportamento esperado de um rádio.
  const noLimite = max > 1 && unidades >= max;
  // 'soma' é acréscimo ("+ R$ 4 de bacon"); 'maior' e 'media' são frações
  // de um produto só, e ali o número é o preço do sabor.
  const acrescimo = (grupo.regra ?? "soma") === "soma";

  const todas = grupo.itens ?? [];
  const temBusca = todas.length >= MUITAS_OPCOES;
  // O que já foi escolhido nunca some da lista, mesmo fora da busca: ver o
  // próprio pedido desaparecer ao digitar é o tipo de susto que faz o
  // cliente escolher de novo e sair com o dobro.
  const itens = temBusca
    ? todas.filter(
        (c) => (escolhido[String(c.id)] ?? 0) > 0 || combinaComBusca(c.nome, busca)
      )
    : todas;

  return (
    <div
      className={
        `grupo${nivel > 0 ? " grupo--sub" : ""}${pendente ? " grupo--pendente" : ""}`
      }
      ref={(node) => registrarRef(grupo.id, node)}
    >
      <div className="grupo__cabecalho">
        <div className="grupo__titulo">
          <h3 className="grupo__nome">{grupo.nome}</h3>
          <div className="grupo__selos">
            {obrigatorio && <span className="grupo__obrigatorio">Obrigatório</span>}
            <span
              className={
                "grupo__regra" +
                (obrigatorio && ok ? " grupo__regra--ok" : "") +
                (obrigatorio && !ok ? " grupo__regra--obrig" : "")
              }
            >
              {rotuloProgressoGrupo(grupo, unidades)}
            </span>
          </div>
        </div>
        {/* Quantas perguntas o produto faz, e em qual delas a pessoa está.
            Sem isso, um produto com quatro grupos parece um formulário sem
            fim: rolar não diz se falta muito. */}
        {totalPassos > 1 && (
          <span className="grupo__passo">
            Passo {passo} de {totalPassos}
          </span>
        )}
      </div>

      {temBusca && (
        <input
          type="search"
          className="grupo__busca"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Digite para buscar"
          aria-label={`Buscar em ${grupo.nome}`}
        />
      )}

      {temBusca && itens.length === 0 ? (
        <p className="grupo__vazio">Nada com esse nome por aqui.</p>
      ) : (
        itens.map((c) => {
          const qtd = escolhido[String(c.id)] ?? 0;
          const ativa = qtd > 0;
          // No teto, o que ainda não entrou sai de alcance; o que já entrou
          // continua inteiro na tela, e sai pelo "−".
          const foraDeAlcance = noLimite && !ativa;
          return (
            <div className="opcao-linha" key={c.id}>
              <button
                type="button"
                className={`opcao${ativa ? " opcao--ativa" : ""}${foraDeAlcance ? " opcao--bloqueada" : ""}`}
                onClick={() => onAjustar(grupo, c, 1)}
                aria-pressed={ativa}
                aria-label={c.nome}
                disabled={noLimite}
              >
                {escolhaUnica && (
                  <span className="opcao__marca opcao__marca--radio">
                    {ativa ? "✓" : ""}
                  </span>
                )}
                <span className="opcao__nome">{c.nome}</span>
                {Number(c.preco) > 0 && (
                  // Em grupo de sabores o número é o PREÇO daquele sabor, não
                  // um acréscimo: escrever "+ R$ 60" numa pizza de R$ 60 faria
                  // o cliente somar duas vezes de cabeça. O "+" só aparece
                  // onde ele é verdade.
                  <span className="opcao__preco">
                    {acrescimo ? `+ ${formatarPreco(c.preco)}` : formatarPreco(c.preco)}
                  </span>
                )}
              </button>

              {/* Fora do <button> porque botão dentro de botão é marcação
                  inválida. Só onde repetir faz sentido: com "escolha 1" o
                  toque troca a opção, e um contador ali só confundiria. */}
              {!escolhaUnica && (
                <div className="opcao-qtd">
                  <button
                    type="button"
                    className="opcao-qtd__botao"
                    onClick={() => onAjustar(grupo, c, -1)}
                    disabled={qtd === 0}
                    aria-label={`Tirar um ${c.nome}`}
                  >
                    −
                  </button>
                  <span
                    className={`opcao-qtd__valor${ativa ? " opcao-qtd__valor--ativa" : ""}`}
                  >
                    {qtd}
                  </span>
                  <button
                    type="button"
                    className="opcao-qtd__botao"
                    onClick={() => onAjustar(grupo, c, 1)}
                    disabled={noLimite}
                    aria-label={`Somar um ${c.nome}`}
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      {subgrupos.length > 0 && (
        <div className="grupo__subgrupos">
          {subgrupos.map((sub) => (
            <GrupoBloco
              key={sub.id}
              grupo={sub}
              nivel={nivel + 1}
              selecoes={selecoes}
              destaque={destaque}
              passo={passo}
              totalPassos={totalPassos}
              onAjustar={onAjustar}
              registrarRef={registrarRef}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProdutoModal({ produto, lojaAberta = true, onFechar, onAdicionar }) {
  // selecoesPorGrupo: grupoId → { complementoId: quantas }
  const [selecoes, setSelecoes] = useState({});
  const [obs, setObs] = useState("");
  const [mostrarObs, setMostrarObs] = useState(false);
  const [qtd, setQtd] = useState(1);
  const [destaque, setDestaque] = useState(null); // id do grupo a destacar
  // Sair daqui: tocar fora ou apertar Esc. Arrastar para selecionar
  // texto dentro do painel NÃO fecha — era esse o defeito.
  const fundo = useSairDoModal(onFechar);
  const gruposRef = useRef({}); // grupoId → nó, para rolar até o pendente

  const grupos = produto?.grupos ?? [];

  // Ordem de exibição (pai antes dos filhos) é a ordem dos passos: o
  // número no cabeçalho tem de bater com o que a pessoa vê descendo.
  const passos = useMemo(() => {
    const ordem = new Map();
    achatarGrupos(grupos).forEach((g, i) => ordem.set(g.id, i + 1));
    return ordem;
  }, [grupos]);

  function ajustar(grupo, comp, passo) {
    setDestaque(null); // qualquer escolha limpa o destaque de erro
    setSelecoes((prev) => {
      const atual = prev[grupo.id] ?? {};
      const max = Number(grupo.max) > 0 ? Number(grupo.max) : Infinity;
      const chave = String(comp.id);
      const qtdAtual = atual[chave] ?? 0;

      // Grupo de escolha única (max 1): tocar troca a opção, tocar de novo
      // na mesma tira. É o que se espera de um rádio.
      if (max === 1) {
        return { ...prev, [grupo.id]: qtdAtual > 0 ? {} : { [chave]: 1 } };
      }

      const proxima = qtdAtual + passo;
      if (proxima < 0) return prev;
      // Respeita o máximo do grupo em UNIDADES (0 = sem limite).
      if (passo > 0 && unidadesDoGrupo(atual) >= max) return prev;

      const nova = { ...atual };
      if (proxima === 0) delete nova[chave];
      else nova[chave] = proxima;
      return { ...prev, [grupo.id]: nova };
    });
  }

  // Complementos escolhidos (com preço e quantidade) — para exibir e montar
  // o item. Achata a árvore (raiz + subgrupos) para não perder escolhas
  // aninhadas.
  const complementosEscolhidos = useMemo(() => {
    const escolhidos = [];
    for (const g of achatarGrupos(grupos)) {
      const doGrupo = selecoes[g.id] ?? {};
      for (const c of g.itens ?? []) {
        // O grupo e a REGRA dele viajam junto com a escolha: é o que faz
        // "escolha 4 sabores" cobrar uma pizza em vez de quatro. Grupo de
        // complemento comum não manda regra e cai em 'soma', que é o que
        // ele sempre fez. Gravada na escolha, a regra também não muda o
        // preço de um pedido de ontem quando o dono mexe no grupo hoje.
        const quantas = doGrupo[String(c.id)] ?? 0;
        if (quantas > 0) {
          escolhidos.push({
            id: c.id,
            nome: c.nome,
            preco: c.preco,
            qtd: quantas,
            grupoId: g.id,
            regra: g.regra ?? "soma",
          });
        }
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

  // A MESMA conta da sacola e do servidor (precoDosComplementos). Somar
  // por fora aqui era como o modal mostrava um preço e o carrinho outro.
  const precoUnit = useMemo(
    () => (Number(produto?.preco) || 0) + precoDosComplementos(complementosEscolhidos),
    [produto, complementosEscolhidos]
  );

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
    <div className="modal-fundo" {...fundo}>
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
              passo={passos.get(g.id)}
              totalPassos={passos.size}
              onAjustar={ajustar}
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
