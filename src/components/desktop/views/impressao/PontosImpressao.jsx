import { useState, useEffect, useCallback, useMemo } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { useApp } from "@/context/AppContext";
import { buscarConfigImpressao, salvarConfigImpressao } from "@/lib/impressao";
import { normalizarPontos, novoPonto, removerPonto, definirPadrao } from "@/lib/impressao/pontos";
import { listarImpressorasPonte } from "@/lib/ponte";
import {
  LuCircleCheck, LuCircleAlert, LuLoader, LuRefreshCw, LuPrinter,
  LuPlus, LuTrash2, LuChevronDown,
} from "react-icons/lu";
import "./PontosImpressao.css";

// Leva "Pontos de impressão" (2026-07-28): antes existia só UM destino de
// impressão (a impressora do caixa, configurada em "Layout da comanda").
// Agora o dono pode ter vários — cozinha, bar, chapa — cada item do
// cardápio saindo na impressora certa. Esta tela cobre as duas perguntas
// que o dono fez, em duas seções (cada uma com seu próprio Salvar,
// Princípio nº1 — nunca some com o que não foi confirmado):
//   1. "Pontos de impressão"      → quais impressoras existem.
//   2. "Para onde vai cada item"  → o que sai em cada uma.

// Resume o destino de impressão da Ponte em uma linha legível — mesmo
// formato { tipo, nome } | { tipo, host, porta } usado em PerfilImpressora.
function resumoImpressora(impressora) {
  if (!impressora) return "";
  if (impressora.tipo === "rede") return `${impressora.host}:${impressora.porta} (impressora de rede)`;
  return impressora.nome ?? "";
}

export default function PontosImpressao({ sz }) {
  const { products } = useApp();
  const [configCompleta, setConfigCompleta] = useState(null);
  const [pontos, setPontos] = useState([]);
  const [roteamento, setRoteamento] = useState({ categorias: {}, produtos: {} });
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    buscarConfigImpressao().then(({ data }) => {
      setConfigCompleta(data);
      setPontos(normalizarPontos(data.pontosImpressao, data.perfilImpressora));
      setRoteamento({
        categorias: data.roteamento?.categorias ?? {},
        produtos: data.roteamento?.produtos ?? {},
      });
      setCarregando(false);
    });
  }, []);

  const adicionarPonto = () => {
    setPontos((prev) => [...prev, novoPonto(prev)]);
  };

  const atualizarPonto = useCallback((id, patch) => {
    setPontos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const marcarPadrao = useCallback((id) => {
    setPontos((prev) => definirPadrao(prev, id));
  }, []);

  // Sem useCallback aqui de propósito: removerPonto precisa do valor atual
  // de `pontos` E `roteamento` juntos (não é update funcional isolado),
  // então a função é recriada a cada render — barato, e evita fechar
  // sobre estado velho.
  const excluirPonto = (id) => {
    const resultado = removerPonto(pontos, roteamento, id);
    setPontos(resultado.pontos);
    setRoteamento(resultado.roteamento);
  };

  // Categorias do cardápio de verdade (mesmo padrão do PDV — category
  // é texto livre de products.category) — não existe cadastro à parte
  // de categorias, então a lista vem direto dos produtos existentes.
  const categorias = useMemo(
    () => [...new Set((products ?? []).map((p) => p.category).filter(Boolean))],
    [products]
  );

  if (carregando) {
    return <div className="pontos-impressao__carregando">Carregando…</div>;
  }

  return (
    <div className="pontos-impressao">
      <SecaoPontos
        pontos={pontos}
        onAdicionar={adicionarPonto}
        onAtualizar={atualizarPonto}
        onMarcarPadrao={marcarPadrao}
        onExcluir={excluirPonto}
        configCompleta={configCompleta}
        onSalvo={setConfigCompleta}
      />
      <SecaoRoteamento
        pontos={pontos}
        roteamento={roteamento}
        setRoteamento={setRoteamento}
        categorias={categorias}
        products={products ?? []}
        configCompleta={configCompleta}
        onSalvo={setConfigCompleta}
      />
    </div>
  );
}

// ── Seção 1 — Pontos de impressão ──────────────────────────────────────

function SecaoPontos({ pontos, onAdicionar, onAtualizar, onMarcarPadrao, onExcluir, configCompleta, onSalvo }) {
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(null); // null | "sucesso" | "erro"
  // Confirmação de exclusão (ação destrutiva, Princípio nº1): guarda o id
  // do ponto que está pedindo confirmação, não um booleano solto.
  const [confirmandoId, setConfirmandoId] = useState(null);

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    setStatus(null);
    try {
      const config = { ...(configCompleta ?? {}), pontosImpressao: pontos };
      const { error } = await salvarConfigImpressao(config);
      setStatus(error ? "erro" : "sucesso");
      if (!error) onSalvo(config);
    } finally {
      setSalvando(false);
      setTimeout(() => setStatus((s) => (s === "sucesso" ? null : s)), 2500);
    }
  };

  return (
    <section className="pontos-impressao__secao">
      <h3 className="pontos-impressao__titulo-secao">Pontos de impressão</h3>
      <p className="pontos-impressao__intro">
        Cada ponto é uma impressora ligada a um setor da produção — cozinha, bar, chapa.
        Dê um nome e escolha a impressora dele; na seção abaixo você diz o que sai em cada um.
      </p>

      <div className="pontos-impressao__lista-cards">
        {pontos.map((ponto) => (
          <CardPonto
            key={ponto.id}
            ponto={ponto}
            somenteUm={pontos.length <= 1}
            confirmando={confirmandoId === ponto.id}
            onAtualizar={(patch) => onAtualizar(ponto.id, patch)}
            onMarcarPadrao={() => onMarcarPadrao(ponto.id)}
            onPedirExclusao={() => setConfirmandoId(ponto.id)}
            onCancelarExclusao={() => setConfirmandoId(null)}
            onConfirmarExclusao={() => {
              onExcluir(ponto.id);
              setConfirmandoId(null);
            }}
          />
        ))}
      </div>

      <button type="button" onClick={onAdicionar} className="pontos-impressao__btn-adicionar">
        <LuPlus size={16} /> Adicionar ponto de impressão
      </button>

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

function CardPonto({ ponto, somenteUm, confirmando, onAtualizar, onMarcarPadrao, onPedirExclusao, onCancelarExclusao, onConfirmarExclusao }) {
  // Detecção de impressoras via Ponte KORA — mesmo mecanismo e mesma
  // distinção "ausente" (Ponte fechada) vs "erro" de PerfilImpressora.jsx,
  // só que por card: cada ponto escolhe sua própria impressora do Windows.
  const [statusPonte, setStatusPonte] = useState("idle"); // idle | buscando | ok | ausente | erro
  const [impressorasPonte, setImpressorasPonte] = useState([]);
  const [erroPonte, setErroPonte] = useState("");

  const [redeHost, setRedeHost] = useState(ponto.impressora?.tipo === "rede" ? (ponto.impressora.host ?? "") : "");
  const [redePorta, setRedePorta] = useState(String(ponto.impressora?.tipo === "rede" ? (ponto.impressora.porta ?? 9100) : 9100));

  const buscarImpressoras = useCallback(async () => {
    setStatusPonte("buscando");
    setErroPonte("");
    const { data, error } = await listarImpressorasPonte();
    if (error) {
      const semConexao = error.name === "AbortError" || /failed to fetch|network|fetch/i.test(error.message || "");
      setImpressorasPonte([]);
      if (semConexao) {
        setStatusPonte("ausente");
      } else {
        setStatusPonte("erro");
        setErroPonte(error.message || "A Ponte respondeu algo inesperado.");
      }
      return;
    }
    setImpressorasPonte(data?.impressoras ?? []);
    setStatusPonte("ok");
  }, []);

  const escolherWindows = (nome) => onAtualizar({ impressora: { tipo: "windows", nome } });
  const usarRede = () => {
    const host = redeHost.trim();
    if (!host) return;
    const porta = Number(redePorta) || 9100;
    onAtualizar({ impressora: { tipo: "rede", host, porta } });
  };

  return (
    <div className="pontos-impressao__card">
      <div className="pontos-impressao__card-topo">
        <input
          type="text"
          value={ponto.nome}
          onChange={(e) => onAtualizar({ nome: e.target.value.slice(0, 40) })}
          placeholder="Ex.: Cozinha, Bar, Chapa, Sobremesas"
          className="pontos-impressao__input-nome"
        />
        {ponto.padrao ? (
          <span className="pontos-impressao__tag-padrao">
            <LuCircleCheck size={13} /> Ponto padrão
          </span>
        ) : (
          <button type="button" onClick={onMarcarPadrao} className="pontos-impressao__btn-tornar-padrao">
            Tornar padrão
          </button>
        )}
      </div>

      {ponto.padrao && (
        <p className="pontos-impressao__ajuda-padrao">
          Tudo que não estiver configurado na seção "Para onde vai cada item" sai neste ponto.
        </p>
      )}

      <div className="pontos-impressao__impressora">
        {ponto.impressora && (
          <div className="pontos-impressao__status pontos-impressao__status--sucesso">
            <LuCircleCheck size={13} /> Impressora: {resumoImpressora(ponto.impressora)}
          </div>
        )}

        <button
          type="button"
          onClick={buscarImpressoras}
          disabled={statusPonte === "buscando"}
          className="pontos-impressao__btn-detectar"
        >
          {statusPonte === "buscando"
            ? <LuLoader size={14} className="pontos-impressao__spin" color={varColor(C.blue)} />
            : <LuRefreshCw size={14} />}
          Procurar impressoras
        </button>

        {statusPonte === "ausente" && (
          <div className="pontos-impressao__status pontos-impressao__status--atencao">
            <LuCircleAlert size={13} color={varColor(C.warn)} /> A Ponte não está rodando neste computador. Dê dois
            cliques no KoraPonte.exe — ele trabalha em segundo plano, sem abrir janela — e procure de novo.
          </div>
        )}
        {statusPonte === "erro" && (
          <div className="pontos-impressao__status pontos-impressao__status--erro">
            <LuCircleAlert size={13} /> {erroPonte}
          </div>
        )}
        {statusPonte === "ok" && impressorasPonte.length === 0 && (
          <div className="pontos-impressao__status pontos-impressao__status--atencao">
            <LuCircleAlert size={13} color={varColor(C.warn)} /> Nenhuma impressora encontrada neste computador.
          </div>
        )}
        {statusPonte === "ok" && impressorasPonte.length > 0 && (
          <div className="pontos-impressao__lista-impressoras">
            {impressorasPonte.map((imp) => {
              const ativo = ponto.impressora?.tipo === "windows" && ponto.impressora?.nome === imp.nome;
              return (
                <button
                  key={imp.nome}
                  type="button"
                  onClick={() => escolherWindows(imp.nome)}
                  className={`pontos-impressao__opcao-impressora${ativo ? " pontos-impressao__opcao-impressora--ativa" : ""}`}
                >
                  <LuPrinter size={14} />
                  {imp.nome}
                  {imp.padrao && <span className="pontos-impressao__tag-padrao-windows">padrão do Windows</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="pontos-impressao__separador">ou impressora de rede</div>
        <div className="pontos-impressao__rede">
          <input
            type="text"
            placeholder="IP da impressora, ex: 192.168.0.50"
            value={redeHost}
            onChange={(e) => setRedeHost(e.target.value)}
            className="pontos-impressao__input pontos-impressao__input--host"
          />
          <input
            type="text"
            inputMode="numeric"
            placeholder="Porta"
            value={redePorta}
            onChange={(e) => setRedePorta(e.target.value)}
            className="pontos-impressao__input pontos-impressao__input--porta"
          />
          <button type="button" onClick={usarRede} disabled={!redeHost.trim()} className="pontos-impressao__btn-usar-rede">
            Usar esta impressora
          </button>
        </div>
      </div>

      <div className="pontos-impressao__card-rodape">
        {confirmando ? (
          <div className="pontos-impressao__confirma-exclusao">
            <span>Remover "{ponto.nome || "este ponto"}"? Os itens dele passam a sair no ponto padrão.</span>
            <div className="pontos-impressao__confirma-botoes">
              <button type="button" onClick={onConfirmarExclusao} className="pontos-impressao__btn-confirmar-exclusao">Remover</button>
              <button type="button" onClick={onCancelarExclusao} className="pontos-impressao__btn-cancelar">Cancelar</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPedirExclusao}
            disabled={somenteUm}
            title={somenteUm ? "Precisa existir ao menos um ponto de impressão" : undefined}
            className="pontos-impressao__btn-remover"
          >
            <LuTrash2 size={14} /> Remover ponto
          </button>
        )}
      </div>
    </div>
  );
}

// ── Seção 2 — Para onde vai cada item ──────────────────────────────────

function SecaoRoteamento({ pontos, roteamento, setRoteamento, categorias, products, configCompleta, onSalvo }) {
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

  const definirCategoria = (categoria, pontoId) => {
    setRoteamento((prev) => {
      const proximasCategorias = { ...prev.categorias };
      if (!pontoId) delete proximasCategorias[categoria];
      else proximasCategorias[categoria] = pontoId;
      return { ...prev, categorias: proximasCategorias };
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
            Use o <strong>Salvar</strong> da seção de cima primeiro — até lá, o que você mandar
            {pontosNaoSalvos.length === 1 ? " para ele" : " para eles"} sai no ponto padrão.
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
                value={roteamento.categorias?.[categoria] ?? ""}
                onChange={(e) => definirCategoria(categoria, e.target.value)}
                className="pontos-impressao__select"
              >
                <option value="">— vai pro ponto padrão —</option>
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
            Uma exceção por produto vence a categoria — use quando um item específico precisa sair num ponto
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
