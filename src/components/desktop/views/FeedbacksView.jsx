import { useCallback, useEffect, useMemo, useState } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import {
  LuMessageSquare, LuStore, LuBike, LuCircleAlert, LuCheck, LuRotateCcw,
  LuMonitor, LuUser, LuInbox, LuRefreshCw,
} from "react-icons/lu";
import {
  listarFeedbacks, marcarResolvido, mediaDasNotas,
  filtrarFeedbacks, contarFeedbacks, quandoChegou, rotuloDaNota,
} from "@/lib/feedback";
import "./FeedbacksView.css";

/**
 * Feedbacks — onde o dono lê o que a equipe relatou e o que o cliente
 * achou (migração 20261010, tabela `feedbacks`).
 *
 * Os dois canais já gravavam e não havia tela nenhuma para ler: a feature
 * estava pela metade, e a metade que faltava era justamente a que serve
 * ao dono. Uma tela só para os dois porque o ciclo de vida é o mesmo
 * (chega, é lido, é resolvido), como a própria tabela decidiu.
 *
 * Por que é intuitivo (princípio nº 1):
 *
 *  • A primeira coisa na tela são os dois números que a pessoa veio
 *    buscar: a nota média dos clientes e quantos relatos ainda esperam
 *    resposta. Quem só quer saber "como estamos" não precisa ler a lista.
 *  • Os filtros são botões grandes com a CONTAGEM dentro, então dá para
 *    ver se vale clicar antes de clicar. Abre em "Abertos", que é a lista
 *    de coisas a fazer, e o próprio cabeçalho da lista diz que está
 *    filtrando e oferece o caminho de volta.
 *  • Cada relato diz de onde veio com a mesma palavra do resto do sistema
 *    ("Frente de caixa" / "Delivery"), e a nota do cliente aparece por
 *    extenso além das estrelas, porque cor sozinha não é informação.
 *  • Resolver é um clique e tem volta ("Reabrir"), então ninguém precisa
 *    ter certeza antes de clicar.
 *  • Lista vazia distingue "ainda não chegou nada" de "nada com este
 *    filtro", que são duas notícias diferentes; e falha de carregamento
 *    diz que falhou, em vez de mostrar zero como se fosse verdade.
 */

/** Chip de filtro, com a contagem dentro. */
function Chip({ ativo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`feedbacks-view__chip${ativo ? " feedbacks-view__chip--ativo" : ""}`}
    >
      {children}
    </button>
  );
}

/** As cinco estrelas de uma avaliação, já decididas. */
function Estrelas({ nota }) {
  const n = Number(nota) || 0;
  return (
    <span className="feedbacks-view__estrelas" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`feedbacks-view__estrela${i <= n ? " feedbacks-view__estrela--cheia" : ""}`}
        >
          ★
        </span>
      ))}
    </span>
  );
}

/** Nota média com uma casa, em pt-BR ("4,6"). */
function notaFormatada(media) {
  return media.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export default function FeedbacksView() {
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [feedbacks, setFeedbacks] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  // Começa nos abertos: é a lista do que falta fazer. O cabeçalho da lista
  // diz que está filtrando, então ninguém acha que o resto sumiu.
  const [origem, setOrigem] = useState("todas");
  const [situacao, setSituacao] = useState("abertos");
  // Id em trânsito: o botão daquele cartão vira "Salvando..." sozinho, sem
  // travar a tela inteira nem deixar dois cliques passarem.
  const [salvando, setSalvando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await listarFeedbacks();
    // Erro de leitura com lista zerada na tela seria "nenhum feedback" na
    // cara do dono, que é o oposto da verdade.
    setErro(error ? "Não deu para carregar os feedbacks agora. Tente de novo." : "");
    if (!error) setFeedbacks(data);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const contagem = useMemo(() => contarFeedbacks(feedbacks), [feedbacks]);
  const visiveis = useMemo(
    () => filtrarFeedbacks(feedbacks, { origem, situacao }),
    [feedbacks, origem, situacao]
  );
  const { media, quantas } = useMemo(
    () => mediaDasNotas(feedbacks.filter((f) => f.origem === "cliente")),
    [feedbacks]
  );

  const filtrando = origem !== "todas" || situacao !== "todos";

  const alternarResolvido = async (f) => {
    if (salvando) return;
    setSalvando(f.id);
    const { error } = await marcarResolvido(f.id, !f.resolvido);
    setSalvando(null);
    if (error) {
      setErro("Não deu para salvar. Tente de novo.");
      return;
    }
    setErro("");
    // Troca só a linha mexida: recarregar a lista inteira faria o cartão
    // saltar de lugar e o dono perder onde estava lendo.
    setFeedbacks((atuais) =>
      atuais.map((item) => (item.id === f.id ? { ...item, resolvido: !f.resolvido } : item))
    );
  };

  const limparFiltros = () => {
    setOrigem("todas");
    setSituacao("todos");
  };

  return (
    <div className="feedbacks-view" style={{ background: varColor(C.bg) }}>

      {/* Header */}
      <div className="feedbacks-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div>
          <div className="feedbacks-view__titulo" style={{ fontWeight: 800 }}>Feedbacks</div>
          <div className="feedbacks-view__subtitulo" style={{ color: varColor(C.muted) }}>
            O que a equipe relatou e o que os clientes acharam
          </div>
        </div>
        <button
          type="button"
          onClick={carregar}
          className="feedbacks-view__btn-recarregar"
          disabled={carregando}
        >
          <LuRefreshCw size={15} /> Atualizar
        </button>
      </div>

      {/* Os dois números que a pessoa veio buscar, antes da lista. */}
      <div className="feedbacks-view__resumo" style={{ padding: `${sz.padSm}px ${sz.pad}px 0` }}>
        <div
          className="feedbacks-view__cartao"
          style={{ borderColor: alfa(C.accent, "44"), background: alfa(C.accent, "0a") }}
        >
          <div className="feedbacks-view__cartao-rotulo">Nota dos clientes</div>
          {media === null ? (
            <div className="feedbacks-view__cartao-vazio">Ainda não avaliaram</div>
          ) : (
            <>
              <div className="feedbacks-view__cartao-numero" style={{ color: varColor(C.accent) }}>
                {notaFormatada(media)} <span className="feedbacks-view__cartao-de">de 5</span>
              </div>
              <div className="feedbacks-view__cartao-nota">
                {quantas} {quantas === 1 ? "avaliação" : "avaliações"}
              </div>
            </>
          )}
        </div>

        <div
          className="feedbacks-view__cartao"
          style={{
            borderColor: contagem.abertos > 0 ? alfa(C.red, "44") : varColor(C.border),
            background: contagem.abertos > 0 ? alfa(C.red, "0a") : "transparent",
          }}
        >
          <div className="feedbacks-view__cartao-rotulo">Esperando resposta</div>
          <div
            className="feedbacks-view__cartao-numero"
            style={{ color: contagem.abertos > 0 ? varColor(C.red) : varColor(C.muted) }}
          >
            {contagem.abertos}
          </div>
          <div className="feedbacks-view__cartao-nota">
            {contagem.abertos === 0 ? "Nada em aberto" : "Ainda não marcados como resolvidos"}
          </div>
        </div>
      </div>

      {/* Filtros: origem e situação são eixos independentes, porque "o que
          os clientes ainda não responderam" é pergunta legítima. */}
      <div className="feedbacks-view__filtros-wrap" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
        <div className="feedbacks-view__chips" role="group" aria-label="Filtrar por origem">
          <Chip ativo={origem === "todas"} onClick={() => setOrigem("todas")}>
            <LuMessageSquare size={13} /> Tudo <b>{contagem.total}</b>
          </Chip>
          <Chip ativo={origem === "equipe"} onClick={() => setOrigem("equipe")}>
            <LuStore size={13} /> Da equipe <b>{contagem.equipe}</b>
          </Chip>
          <Chip ativo={origem === "cliente"} onClick={() => setOrigem("cliente")}>
            <LuBike size={13} /> Dos clientes <b>{contagem.cliente}</b>
          </Chip>
        </div>

        <div className="feedbacks-view__chips" role="group" aria-label="Filtrar por situação">
          <Chip ativo={situacao === "abertos"} onClick={() => setSituacao("abertos")}>
            <LuInbox size={13} /> Abertos <b>{contagem.abertos}</b>
          </Chip>
          <Chip ativo={situacao === "resolvidos"} onClick={() => setSituacao("resolvidos")}>
            <LuCheck size={13} /> Resolvidos <b>{contagem.resolvidos}</b>
          </Chip>
          <Chip ativo={situacao === "todos"} onClick={() => setSituacao("todos")}>
            Todos <b>{contagem.total}</b>
          </Chip>
        </div>
      </div>

      {/* Lista */}
      <div className="feedbacks-view__lista-area" style={{ padding: `0 ${sz.pad}px ${sz.pad}px` }}>
        {erro && (
          <div className="feedbacks-view__alerta" style={{ background: alfa(C.red, "12") }}>
            <LuCircleAlert size={18} /> {erro}
          </div>
        )}

        {carregando ? (
          <div className="feedbacks-view__estado">
            <div className="feedbacks-view__msg-estado">Carregando feedbacks...</div>
          </div>
        ) : erro && feedbacks.length === 0 ? (
          // Falha de leitura já foi dita no aviso acima. Desenhar a caixa
          // vazia embaixo dele seria afirmar "não chegou nada" logo depois
          // de admitir que não deu para olhar.
          null
        ) : visiveis.length === 0 ? (
          <div className="feedbacks-view__estado">
            <LuMessageSquare size={44} style={{ opacity: 0.3 }} />
            {/* Lista vazia por filtro parece caixa vazia, e as duas notícias
                são diferentes: uma pede tirar o filtro, a outra não pede nada. */}
            <div className="feedbacks-view__titulo-estado">
              {contagem.total > 0
                ? "Nenhum feedback com esses filtros"
                : "Ainda não chegou nenhum feedback"}
            </div>
            {contagem.total > 0 ? (
              <button type="button" onClick={limparFiltros} className="feedbacks-view__limpar">
                Ver todos
              </button>
            ) : (
              <div className="feedbacks-view__msg-vazio">
                A equipe relata pelo botão "Reportar algo" na barra lateral, e o
                cliente avalia na tela de confirmação do pedido.
              </div>
            )}
          </div>
        ) : (
          <>
            {filtrando && (
              <div className="feedbacks-view__contagem">
                Mostrando {visiveis.length} de {contagem.total}
                {" "}
                <button type="button" onClick={limparFiltros} className="feedbacks-view__limpar-inline">
                  Ver todos
                </button>
              </div>
            )}

            <div className="feedbacks-view__lista">
              {visiveis.map((f) => {
                const doCliente = f.origem === "cliente";
                return (
                  <div
                    key={f.id}
                    className={`feedbacks-view__item${f.resolvido ? " feedbacks-view__item--resolvido" : ""}`}
                  >
                    <div className="feedbacks-view__item-topo">
                      <span
                        className={`feedbacks-view__selo feedbacks-view__selo--${doCliente ? "cliente" : "equipe"}`}
                      >
                        {doCliente ? <LuBike size={11} /> : <LuStore size={11} />}
                        {doCliente ? "Cliente" : "Equipe"}
                      </span>

                      {doCliente && f.nota != null && (
                        <span className="feedbacks-view__nota">
                          <Estrelas nota={f.nota} />
                          <span className="feedbacks-view__nota-rotulo">{rotuloDaNota(f.nota)}</span>
                        </span>
                      )}

                      <span className="feedbacks-view__quando">{quandoChegou(f.created_at)}</span>
                    </div>

                    <p className="feedbacks-view__texto">{f.texto}</p>

                    <div className="feedbacks-view__item-rodape">
                      <div className="feedbacks-view__meta">
                        {/* A tela em que a pessoa estava é o dado que mais se
                            esquece de contar e o que mais ajuda a consertar. */}
                        {f.tela && (
                          <span className="feedbacks-view__meta-item">
                            <LuMonitor size={12} /> {f.tela}
                          </span>
                        )}
                        {f.autor && (
                          <span className="feedbacks-view__meta-item">
                            <LuUser size={12} /> {f.autor}
                          </span>
                        )}
                        {f.resolvido && (
                          <span className="feedbacks-view__meta-item feedbacks-view__meta-item--ok">
                            <LuCheck size={12} /> Resolvido
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => alternarResolvido(f)}
                        disabled={salvando === f.id}
                        className={`feedbacks-view__acao${f.resolvido ? " feedbacks-view__acao--reabrir" : ""}`}
                      >
                        {salvando === f.id ? (
                          "Salvando..."
                        ) : f.resolvido ? (
                          <>
                            <LuRotateCcw size={13} /> Reabrir
                          </>
                        ) : (
                          <>
                            <LuCheck size={13} /> Marcar como resolvido
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
