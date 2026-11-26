import { useState, useMemo } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { salvarConfigImpressao } from "@/features/impressao/dados/impressao";
import {
  normalizarPontos, destinoDaCategoria, definirRotaCategoria, categoriasOrfas
} from "@/features/impressao/regras/pontos";
import {
  LuCircleCheck, LuCircleAlert, LuPlus, LuTrash2, LuChevronDown
} from "react-icons/lu";

export default function SecaoRoteamento({ pontos, roteamento, setRoteamento, categorias, products, configCompleta, onSalvo }) {
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(null); // null | "sucesso" | "erro"
  // Exceções por produto recolhidas por padrão — não é o caminho feliz
  // (a maioria dos itens já cai certo pela categoria), então fica fora
  // do caminho de leitura principal até o dono pedir por ela.
  const [exibirExcecoes, setExibirExcecoes] = useState(false);
  const [produtoEscolhido, setProdutoEscolhido] = useState("");
  const [pontoExcecao, setPontoExcecao] = useState("");

  const nomePonto = (id) => pontos.find((p) => p.id === id)?.nome || "";

  // Cada seção tem seu próprio Salvar (foi o que o dono pediu), então dá
  // pra criar um ponto aqui em cima, NÃO salvar, e já mandar uma categoria
  // pra ele aqui embaixo. Salvo só o roteamento, o ponto não existe no
  // banco e o item cairia no padrão — calado, que é o pior jeito de errar.
  // Compara contra a MESMA normalização que a leitura usa: o ponto padrão
  // sintetizado ("Cozinha") resolve de volta mesmo sem estar gravado, então
  // ele não entra na lista e o aviso não dá alarme falso.
  const pontosNaoSalvos = useMemo(() => {
    const salvos = new Set(
      normalizarPontos(configCompleta?.pontosImpressao, configCompleta?.perfilImpressora).map((p) => p.id)
    );
    return pontos.filter((p) => !salvos.has(p.id));
  }, [pontos, configCompleta]);

  // Escreve pela lib para converger a grafia: "Bebida" renomeada para
  // "Bebidas" no cardápio deixaria as duas chaves no mapa, e a antiga
  // ficaria órfã pra sempre porque a tela não a lista mais.
  const definirCategoria = (categoria, pontoId) => {
    setRoteamento((prev) => ({
      ...prev,
      categorias: definirRotaCategoria(prev.categorias, categoria, pontoId),
    }));
  };

  // Rota gravada para categoria que não existe mais no cardápio: o item
  // voltou calado pro ponto padrão. A tabela não a mostra (não há linha),
  // então o único jeito de o dono saber é este aviso.
  const orfas = useMemo(
    () => categoriasOrfas(roteamento.categorias, categorias),
    [roteamento.categorias, categorias]
  );

  const limparOrfas = () => {
    setRoteamento((prev) => {
      let categoriasLimpas = prev.categorias;
      for (const orfa of orfas) categoriasLimpas = definirRotaCategoria(categoriasLimpas, orfa, "");
      return { ...prev, categorias: categoriasLimpas };
    });
  };

  const adicionarExcecao = () => {
    if (!produtoEscolhido || !pontoExcecao) return;
    setRoteamento((prev) => ({
      ...prev,
      produtos: { ...prev.produtos, [produtoEscolhido]: pontoExcecao },
    }));
    setProdutoEscolhido("");
    setPontoExcecao("");
  };

  const removerExcecao = (produtoId) => {
    setRoteamento((prev) => {
      const proximosProdutos = { ...prev.produtos };
      delete proximosProdutos[produtoId];
      return { ...prev, produtos: proximosProdutos };
    });
  };

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    setStatus(null);
    try {
      const config = { ...(configCompleta ?? {}), roteamento };
      const { error } = await salvarConfigImpressao(config);
      setStatus(error ? "erro" : "sucesso");
      if (!error) onSalvo(config);
    } finally {
      setSalvando(false);
      setTimeout(() => setStatus((s) => (s === "sucesso" ? null : s)), 2500);
    }
  };

  // Com um ponto só, roteamento não existe de fato — mostrar uma tabela
  // vazia/inútil quebraria o Princípio nº1. Um texto explica a situação e
  // aponta o caminho (adicionar o segundo ponto acima).
  if (pontos.length <= 1) {
    return (
      <section className="pontos-impressao__secao">
        <h3 className="pontos-impressao__titulo-secao">Para onde vai cada item</h3>
        <div className="pontos-impressao__vazio">
          Com um ponto só, tudo imprime nele. Adicione um segundo ponto acima para separar o que vai para cada impressora.
        </div>
      </section>
    );
  }

  const excecoesLista = Object.entries(roteamento.produtos ?? {});

  return (
    <section className="pontos-impressao__secao">
      <h3 className="pontos-impressao__titulo-secao">Para onde vai cada item</h3>
      <p className="pontos-impressao__intro">
        Escolha o ponto de cada categoria do cardápio. Categoria sem escolha vai pro ponto padrão.
      </p>

      {pontosNaoSalvos.length > 0 && (
        <div className="pontos-impressao__aviso">
          <LuCircleAlert size={14} color={varColor(C.warn)} className="pontos-impressao__aviso-icone" />
          <span>
            {pontosNaoSalvos.length === 1
              ? `O ponto "${pontosNaoSalvos[0].nome || "sem nome"}" ainda não foi salvo.`
              : `Estes pontos ainda não foram salvos: ${pontosNaoSalvos.map((p) => p.nome || "sem nome").join(", ")}.`}{" "}
            Use o <strong>Salvar</strong> da seção de cima primeiro, até lá, o que você mandar
            {pontosNaoSalvos.length === 1 ? " para ele" : " para eles"} sai no ponto padrão.
          </span>
        </div>
      )}

      {orfas.length > 0 && (
        <div className="pontos-impressao__aviso">
          <LuCircleAlert size={14} color={varColor(C.warn)} className="pontos-impressao__aviso-icone" />
          <span>
            {orfas.length === 1
              ? `A categoria "${orfas[0]}" tinha um ponto escolhido, mas não existe mais no cardápio.`
              : `Estas categorias tinham ponto escolhido e não existem mais no cardápio: ${orfas.join(", ")}.`}{" "}
            {orfas.length === 1 ? "O que era dela sai" : "O que era delas sai"} no ponto padrão.
            <button type="button" onClick={limparOrfas} className="pontos-impressao__btn-limpar-orfas">
              Remover {orfas.length === 1 ? "essa escolha" : "essas escolhas"}
            </button>
          </span>
        </div>
      )}

      {categorias.length === 0 ? (
        <div className="pontos-impressao__vazio">Nenhuma categoria cadastrada no cardápio ainda.</div>
      ) : (
        <div className="pontos-impressao__tabela-categorias">
          {categorias.map((categoria) => (
            <div key={categoria} className="pontos-impressao__linha-categoria">
              <span className="pontos-impressao__nome-categoria">{categoria}</span>
              <select
                value={destinoDaCategoria(roteamento.categorias, categoria) ?? ""}
                onChange={(e) => definirCategoria(categoria, e.target.value)}
                className="pontos-impressao__select"
              >
                <option value="">, vai pro ponto padrão, </option>
                {pontos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome || "(sem nome)"}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setExibirExcecoes((v) => !v)} className="pontos-impressao__btn-expandir">
        <LuChevronDown size={14} className={`pontos-impressao__chevron${exibirExcecoes ? " pontos-impressao__chevron--aberto" : ""}`} />
        Exceções por produto {excecoesLista.length > 0 ? `(${excecoesLista.length})` : ""}
      </button>

      {exibirExcecoes && (
        <div className="pontos-impressao__excecoes">
          <p className="pontos-impressao__ajuda">
            Uma exceção por produto vence a categoria, use quando um item específico precisa sair num ponto
            diferente do resto da categoria dele.
          </p>

          <div className="pontos-impressao__nova-excecao">
            <select
              value={produtoEscolhido}
              onChange={(e) => setProdutoEscolhido(e.target.value)}
              className="pontos-impressao__select"
            >
              <option value="">Escolha um produto…</option>
              {products.map((p) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
            <select
              value={pontoExcecao}
              onChange={(e) => setPontoExcecao(e.target.value)}
              className="pontos-impressao__select"
            >
              <option value="">Escolha o ponto…</option>
              {pontos.map((p) => (
                <option key={p.id} value={p.id}>{p.nome || "(sem nome)"}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={adicionarExcecao}
              disabled={!produtoEscolhido || !pontoExcecao}
              className="pontos-impressao__btn-adicionar-excecao"
            >
              <LuPlus size={14} /> Adicionar exceção
            </button>
          </div>

          {excecoesLista.length > 0 && (
            <div className="pontos-impressao__lista-excecoes">
              {excecoesLista.map(([produtoId, pontoId]) => {
                const produto = products.find((p) => String(p.id) === produtoId);
                return (
                  <div key={produtoId} className="pontos-impressao__linha-excecao">
                    <span className="pontos-impressao__nome-produto-excecao">{produto?.name ?? `Produto #${produtoId}`}</span>
                    <span className="pontos-impressao__seta">→</span>
                    <span>{nomePonto(pontoId) || "(ponto removido)"}</span>
                    <button type="button" onClick={() => removerExcecao(produtoId)} className="pontos-impressao__btn-remover-excecao">
                      <LuTrash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="pontos-impressao__acoes">
        <button type="button" onClick={salvar} disabled={salvando} className="pontos-impressao__btn-salvar">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        {status === "sucesso" && (
          <span className="pontos-impressao__status pontos-impressao__status--sucesso"><LuCircleCheck size={13} /> Salvo</span>
        )}
        {status === "erro" && (
          <span className="pontos-impressao__status pontos-impressao__status--erro"><LuCircleAlert size={13} /> Falha ao salvar</span>
        )}
      </div>
    </section>
  );
}
