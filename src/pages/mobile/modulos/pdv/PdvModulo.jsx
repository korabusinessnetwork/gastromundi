/**
 * PdvModulo — tela "PDV rápido" do hub Mais no /palm (mobile).
 *
 * Venda de balcão em 2 passos: (1) escolher os itens, (2) cobrar.
 * É o mesmo caixa do desktop, só que na mão: NÃO existe regra de venda
 * própria aqui. Tudo que envolve dinheiro é reuso do que já roda em
 * produção no PDV do computador:
 *   - persistência da venda ...... `useFinalizarPagamento()` (PDVView)
 *   - arredondamento ............. `round2` (@/lib/vendas)
 *   - meios de pagamento ......... `meiosPagamento` + `metodosCustom` do tenant
 *   - rótulo do método ........... `rotuloMetodo` (@/utils/pagamentos)
 *   - guarda de TEF offline ...... `metodoUsaTef` (@/lib/tef)
 *   - comprovante ................ `montarComprovantePagamento` + `imprimirDocumento`
 *
 * A venda de balcão não tem comanda. Para reusar a regra real sem
 * duplicá-la, montamos uma "comanda sintética" (`Balcão`) e chamamos o
 * hook com `semComanda: true` — nesse modo ele pula a remoção em
 * `pending`, que no balcão não existe (nem o alarme de cobrança dupla,
 * que ali seria falso).
 *
 * Decisão 018: nenhum estilo mora no JSX (ver PdvModulo.css).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LuArrowLeft,
  LuBanknote,
  LuCircleAlert,
  LuCircleCheck,
  LuCreditCard,
  LuLock,
  LuMinus,
  LuPlus,
  LuPrinter,
  LuSearch,
  LuSearchX,
  LuShoppingCart,
  LuSmartphone,
  LuTrash,
  LuWallet,
  LuWifiOff,
  LuZap,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { useFinalizarPagamento } from "@/components/desktop/views/PDVView/useFinalizarPagamento";
import { round2 } from "@/lib/vendas";
import { metodoUsaTef } from "@/lib/tef";
import { rotuloMetodo } from "@/utils/pagamentos";
import { fmtDinheiro } from "@/pages/mobile/fmt";
import {
  buscarConfigImpressao,
  montarComprovantePagamento,
} from "@/lib/impressao";
import { imprimirDocumento } from "@/lib/impressao/drivers";
import "../modulos.css";
import "./PdvModulo.css";

/** Ícone dos métodos nativos. Método personalizado do estabelecimento cai
 *  no genérico — a LISTA em si nunca é fixa, vem sempre do tenant. */
const ICONES_METODO = {
  dinheiro: LuBanknote,
  credito: LuCreditCard,
  debito: LuSmartphone,
  pix: LuZap,
};

/** Mesmo default do AppContext, usado só quando o tenant não configurou nada. */
const METODOS_PADRAO = ["dinheiro", "credito", "debito", "pix"];

/** Rótulo da venda sem comanda. Genérico do varejo, não é marca de cliente. */
const COMANDA_BALCAO = "Balcão";

function precoDoItem(item) {
  return (Number(item?.price) || 0) * (item?.qty ?? 1);
}

/** Cabeçalho comum aos três passos (fica fora do componente para não
 *  remontar a cada render). */
function Cabecalho({ titulo, subtitulo, onSair }) {
  return (
    <header className="mod-header">
      <div className="mod-header__textos">
        <h1 className="mod-header__titulo">{titulo}</h1>
        <p className="mod-header__subtitulo">{subtitulo}</p>
      </div>
      <button
        type="button"
        className="mod-header__voltar"
        onClick={onSair}
        aria-label="Voltar"
      >
        <LuArrowLeft aria-hidden="true" />
      </button>
    </header>
  );
}

export default function PdvModulo({ onVoltar }) {
  const {
    products,
    caixaAberto,
    currentUser,
    tenant,
    meiosPagamento,
    metodosCustom,
    redeOnline,
    metodosTef,
    addonHabilitado,
  } = useApp();
  const { finalizarPagamento } = useFinalizarPagamento();

  const [passo, setPasso] = useState("itens"); // itens | cobrar | concluido
  const [busca, setBusca] = useState("");
  const [catAtiva, setCatAtiva] = useState("Todos");
  const [carrinho, setCarrinho] = useState([]);
  const [metodo, setMetodo] = useState(null);
  const [recebido, setRecebido] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [impressao, setImpressao] = useState(null); // null | imprimindo | erro | sucesso
  const [resumoVenda, setResumoVenda] = useState(null);

  const timerImpressao = useRef(null);
  useEffect(() => () => clearTimeout(timerImpressao.current), []);

  // ── Catálogo ────────────────────────────────────────────────────
  const listaProdutos = useMemo(() => products ?? [], [products]);

  const categorias = useMemo(
    () => ["Todos", ...new Set(listaProdutos.map((p) => p.category).filter(Boolean))],
    [listaProdutos]
  );

  const produtosFiltrados = useMemo(() => {
    const daCategoria =
      catAtiva === "Todos"
        ? listaProdutos
        : listaProdutos.filter((p) => p.category === catAtiva);
    const q = busca.trim().toLowerCase();
    return q
      ? daCategoria.filter((p) => String(p.name ?? "").toLowerCase().includes(q))
      : daCategoria;
  }, [listaProdutos, catAtiva, busca]);

  const qtdPorId = useMemo(
    () =>
      carrinho.reduce((acc, i) => {
        acc[i.id] = (acc[i.id] ?? 0) + i.qty;
        return acc;
      }, {}),
    [carrinho]
  );

  // ── Carrinho (mesmo formato do Palm do garçom) ──────────────────
  const total = round2(carrinho.reduce((s, i) => s + precoDoItem(i), 0));
  const qtdTotal = carrinho.reduce((s, i) => s + i.qty, 0);

  const adicionar = (produto) => {
    setCarrinho((prev) => {
      const idx = prev.findIndex((i) => i.id === produto.id);
      if (idx >= 0) {
        return prev.map((it, i) => (i === idx ? { ...it, qty: it.qty + 1 } : it));
      }
      return [...prev, { ...produto, qty: 1, _key: Date.now() + Math.random() }];
    });
  };

  const mudarQtd = (index, qty) => {
    if (qty <= 0) {
      setCarrinho((prev) => prev.filter((_, i) => i !== index));
    } else {
      setCarrinho((prev) => prev.map((it, i) => (i === index ? { ...it, qty } : it)));
    }
  };

  // ── Meios de pagamento do estabelecimento ───────────────────────
  const metodos = useMemo(() => {
    const rotulosCustom = {};
    for (const m of metodosCustom ?? []) {
      if (m?.id && m?.label) rotulosCustom[m.id] = m.label;
    }
    const ativos = meiosPagamento?.length ? meiosPagamento : METODOS_PADRAO;
    return ativos.filter(Boolean).map((id) => ({
      id,
      label: rotuloMetodo(id, rotulosCustom),
      Icone: ICONES_METODO[id] ?? LuWallet,
    }));
  }, [meiosPagamento, metodosCustom]);

  // TEF é só online (mesma regra do checkout do desktop): sem internet, a
  // maquininha não responde — o botão já nasce bloqueado em vez de deixar
  // o operador tentar e falhar depois de cobrar.
  const bloqueadoOffline = (id) =>
    !redeOnline && Boolean(addonHabilitado?.("tef")) && metodoUsaTef(id, metodosTef);

  // Fiado exige cliente identificado (F010) e o PDV rápido não tem seleção
  // de cliente — em vez de gravar fiado sem dono, bloqueia e diz o caminho.
  const ehFiado = (id) => id === "fiado";

  const metodoIndisponivel = (id) => bloqueadoOffline(id) || ehFiado(id);

  // ── Troco ───────────────────────────────────────────────────────
  const ehDinheiro = metodo === "dinheiro";
  const recebidoNum = round2(Number(String(recebido).replace(",", ".")) || 0);
  const troco = ehDinheiro ? Math.max(0, round2(recebidoNum - total)) : 0;
  const falta = ehDinheiro ? Math.max(0, round2(total - recebidoNum)) : 0;

  const podeConfirmar =
    Boolean(caixaAberto) &&
    carrinho.length > 0 &&
    Boolean(metodo) &&
    !metodoIndisponivel(metodo) &&
    (!ehDinheiro || recebidoNum >= total) &&
    !salvando;

  const pagamentosAtuais = () => [
    {
      metodo,
      valor: total,
      recebido: ehDinheiro ? recebidoNum : total,
      troco,
    },
  ];

  const vendaParaImpressao = () => ({
    comanda: COMANDA_BALCAO,
    items: carrinho.map(({ _key, ...resto }) => resto),
    valorTaxa: 0,
    ajuste: null,
    valorAjuste: 0,
    total,
    pagamentos: pagamentosAtuais(),
  });

  // ── Ações ───────────────────────────────────────────────────────
  const irParaCobrar = () => {
    setErro("");
    setPasso("cobrar");
  };

  const voltarParaItens = () => {
    setErro("");
    setPasso("itens");
  };

  const novaVenda = () => {
    setCarrinho([]);
    setMetodo(null);
    setRecebido("");
    setErro("");
    setImpressao(null);
    setResumoVenda(null);
    setBusca("");
    setPasso("itens");
  };

  const confirmar = async () => {
    if (!podeConfirmar) return;
    setSalvando(true);
    setErro("");

    const balcao = {
      id: crypto.randomUUID(),
      comanda: COMANDA_BALCAO,
      mesa: null,
      items: [],
      garcom: null,
      created_by: currentUser?.username ?? null,
    };
    const pagamentos = pagamentosAtuais();
    const fechado = {
      total,
      qtdTotal,
      metodo,
      metodoLabel: metodos.find((m) => m.id === metodo)?.label ?? rotuloMetodo(metodo),
      troco,
      // Congela os dados do comprovante no momento da venda: reimprimir
      // depois nunca pega um carrinho que já mudou.
      venda: vendaParaImpressao(),
    };

    try {
      await finalizarPagamento(balcao, carrinho, {
        pagamentos,
        total,
        taxaServico: false,
        valorTaxa: 0,
        ajuste: null,
        valorAjuste: 0,
        clienteId: null,
        cliente: null,
        // Sem seleção de cliente no balcão: NFC-e (quando o add-on está
        // ativo) sai anônima, de forma explícita em vez de por acidente.
        dest: null,
      }, { semComanda: true });
      setResumoVenda(fechado);
      setPasso("concluido");
    } catch (err) {
      setErro(
        err?.message ||
          "Não foi possível registrar a venda. Confira e tente de novo."
      );
    } finally {
      setSalvando(false);
    }
  };

  const imprimir = async (venda) => {
    if (impressao === "imprimindo") return;
    clearTimeout(timerImpressao.current);
    setImpressao("imprimindo");
    try {
      // buscarConfigImpressao nunca lança: sem config no servidor cai no
      // cache local e depois no padrão, então o botão sempre tem resposta.
      const { data: configImpressao } = await buscarConfigImpressao();
      const dados = montarComprovantePagamento({ venda, tenant, configImpressao });
      const { error } = await imprimirDocumento(dados, configImpressao?.perfilImpressora);
      if (error) {
        setImpressao("erro");
        return;
      }
      setImpressao("sucesso");
      timerImpressao.current = setTimeout(() => setImpressao(null), 2500);
    } catch {
      setImpressao("erro");
    }
  };

  const rotuloImpressao =
    impressao === "imprimindo"
      ? "Imprimindo…"
      : impressao === "erro"
      ? "Não imprimiu — tentar de novo"
      : impressao === "sucesso"
      ? "Comprovante enviado"
      : "Imprimir comprovante";

  // ── Guarda: caixa fechado ───────────────────────────────────────
  if (!caixaAberto) {
    return (
      <div className="mod-tela">
        <Cabecalho
          titulo="PDV rápido"
          subtitulo="Venda de balcão"
          onSair={onVoltar}
        />
        <div className="mod-vazio">
          <LuLock aria-hidden="true" />
          <p className="mod-vazio__titulo">Caixa fechado</p>
          <p className="mod-vazio__texto">
            Não dá para vender com o caixa fechado. Peça ao responsável para
            abrir o caixa no PDV do computador e volte aqui.
          </p>
        </div>
      </div>
    );
  }

  // ── Passo 3: venda concluída ────────────────────────────────────
  if (passo === "concluido" && resumoVenda) {
    return (
      <div className="mod-tela mod-tela--comRodape">
        <Cabecalho
          titulo="Venda concluída"
          subtitulo="PDV rápido · balcão"
          onSair={onVoltar}
        />

        <div className="pdv-modulo__sucesso">
          <LuCircleCheck className="pdv-modulo__sucessoIcone" aria-hidden="true" />
          <p className="pdv-modulo__sucessoTitulo">Pagamento registrado</p>
          <p className="pdv-modulo__sucessoValor">{fmtDinheiro(resumoVenda.total)}</p>
          <p className="pdv-modulo__sucessoSub">
            {resumoVenda.qtdTotal} {resumoVenda.qtdTotal === 1 ? "item" : "itens"} ·{" "}
            {resumoVenda.metodoLabel}
          </p>
        </div>

        {resumoVenda.troco > 0 ? (
          <div className="pdv-modulo__trocoDestaque">
            <span className="pdv-modulo__trocoDestaqueRotulo">Devolver de troco</span>
            <strong className="pdv-modulo__trocoDestaqueValor">
              {fmtDinheiro(resumoVenda.troco)}
            </strong>
          </div>
        ) : null}

        <div className="mod-rodape">
          <button
            type="button"
            className="mod-botao mod-botao--primario mod-botao--bloco"
            onClick={novaVenda}
          >
            <LuShoppingCart aria-hidden="true" />
            Nova venda
          </button>
          <button
            type="button"
            className="mod-botao mod-botao--fantasma mod-botao--bloco"
            onClick={() => imprimir(resumoVenda.venda ?? vendaParaImpressao())}
            disabled={impressao === "imprimindo"}
          >
            <LuPrinter aria-hidden="true" />
            {rotuloImpressao}
          </button>
        </div>
      </div>
    );
  }

  // ── Passo 2: cobrar ─────────────────────────────────────────────
  if (passo === "cobrar") {
    return (
      <div className="mod-tela mod-tela--comRodape">
        <Cabecalho
          titulo="Cobrar"
          subtitulo="PDV rápido · balcão"
          onSair={voltarParaItens}
        />

        <div className="pdv-modulo__total">
          <span className="pdv-modulo__totalRotulo">Total a cobrar</span>
          <strong className="pdv-modulo__totalValor">{fmtDinheiro(total)}</strong>
          <span className="pdv-modulo__totalItens">
            {qtdTotal} {qtdTotal === 1 ? "item" : "itens"}
          </span>
        </div>

        <section className="pdv-modulo__secao">
          <h2 className="pdv-modulo__secaoTitulo">Forma de pagamento</h2>
          <div className="pdv-modulo__metodos">
            {metodos.map(({ id, label, Icone }) => {
              const ativo = metodo === id;
              const indisponivel = metodoIndisponivel(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={
                    ativo
                      ? "pdv-modulo__metodo pdv-modulo__metodo--ativo"
                      : "pdv-modulo__metodo"
                  }
                  onClick={() => {
                    setMetodo(id);
                    setErro("");
                    if (id !== "dinheiro") setRecebido("");
                  }}
                  disabled={indisponivel}
                  aria-pressed={ativo}
                >
                  <Icone className="pdv-modulo__metodoIcone" aria-hidden="true" />
                  <span className="pdv-modulo__metodoLabel">{label}</span>
                  {bloqueadoOffline(id) ? (
                    <span className="pdv-modulo__metodoAviso">
                      <LuWifiOff aria-hidden="true" />
                      sem internet
                    </span>
                  ) : ehFiado(id) ? (
                    <span className="pdv-modulo__metodoAviso">
                      só no computador
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        {ehDinheiro ? (
          <section className="pdv-modulo__secao">
            <div className="pdv-modulo__troco">
              <label className="pdv-modulo__trocoCampo">
                <span className="pdv-modulo__trocoRotulo">Recebido</span>
                <input
                  className="pdv-modulo__trocoInput"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={recebido}
                  onChange={(e) => setRecebido(e.target.value)}
                  aria-label="Valor recebido em dinheiro"
                />
              </label>
              <div className="pdv-modulo__trocoCampo pdv-modulo__trocoCampo--saida">
                <span className="pdv-modulo__trocoRotulo">Troco</span>
                <strong className="pdv-modulo__trocoValor">{fmtDinheiro(troco)}</strong>
              </div>
            </div>
            {falta > 0 ? (
              <p className="pdv-modulo__falta">
                <LuCircleAlert aria-hidden="true" />
                Faltam {fmtDinheiro(falta)} para fechar a conta.
              </p>
            ) : null}
          </section>
        ) : null}

        {erro ? <p className="mod-erro">{erro}</p> : null}
        {impressao === "erro" ? (
          <p className="mod-erro">
            Não deu para imprimir. Confira a impressora nas configurações.
          </p>
        ) : null}

        <div className="mod-rodape">
          <button
            type="button"
            className="mod-botao mod-botao--primario mod-botao--bloco"
            onClick={confirmar}
            disabled={!podeConfirmar}
          >
            {salvando ? "Registrando…" : "Confirmar pagamento"}
          </button>
          <button
            type="button"
            className="mod-botao mod-botao--fantasma mod-botao--bloco"
            onClick={() => imprimir(vendaParaImpressao())}
            disabled={!metodo || impressao === "imprimindo"}
          >
            <LuPrinter aria-hidden="true" />
            {rotuloImpressao}
          </button>
        </div>
      </div>
    );
  }

  // ── Passo 1: itens ──────────────────────────────────────────────
  return (
    <div className={carrinho.length ? "mod-tela mod-tela--comRodape" : "mod-tela"}>
      <Cabecalho
        titulo="PDV rápido"
        subtitulo="Venda de balcão · sem comanda"
        onSair={onVoltar}
      />

      <div className="mod-busca">
        <LuSearch aria-hidden="true" />
        <input
          type="search"
          placeholder="Buscar produto…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar produto"
        />
      </div>

      <div className="mod-chips" role="tablist" aria-label="Categorias de produto">
        {categorias.map((cat) => {
          const ativa = cat === catAtiva;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={ativa}
              className={ativa ? "mod-chip mod-chip--ativo" : "mod-chip"}
              onClick={() => setCatAtiva(cat)}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {produtosFiltrados.length === 0 ? (
        <div className="mod-vazio">
          <LuSearchX aria-hidden="true" />
          <p className="mod-vazio__titulo">Nenhum produto encontrado</p>
          <p className="mod-vazio__texto">Tente outra busca ou categoria.</p>
        </div>
      ) : (
        <div className="pdv-modulo__grade">
          {produtosFiltrados.map((produto) => {
            const qtd = qtdPorId[produto.id] || 0;
            return (
              <button
                key={produto.id}
                type="button"
                className={
                  qtd > 0
                    ? "pdv-modulo__produto pdv-modulo__produto--ativo"
                    : "pdv-modulo__produto"
                }
                onClick={() => adicionar(produto)}
              >
                {qtd > 0 ? (
                  <span className="pdv-modulo__produtoBadge">{qtd}</span>
                ) : null}
                {produto.emoji ? (
                  <span className="pdv-modulo__produtoEmoji" aria-hidden="true">
                    {produto.emoji}
                  </span>
                ) : null}
                <span className="pdv-modulo__produtoNome">{produto.name}</span>
                <span className="pdv-modulo__produtoPreco">
                  {fmtDinheiro(produto.price)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {carrinho.length > 0 ? (
        <section className="pdv-modulo__secao">
          <h2 className="pdv-modulo__secaoTitulo">No carrinho</h2>
          <div className="mod-lista">
            {carrinho.map((item, index) => (
              <div key={item._key} className="pdv-modulo__item">
                <div className="pdv-modulo__itemTextos">
                  <span className="pdv-modulo__itemNome">{item.name}</span>
                  <span className="pdv-modulo__itemPreco">
                    {fmtDinheiro(precoDoItem(item))}
                  </span>
                </div>
                <div className="pdv-modulo__stepper">
                  <button
                    type="button"
                    className="pdv-modulo__stepperBotao"
                    onClick={() => mudarQtd(index, item.qty - 1)}
                    aria-label={
                      item.qty <= 1 ? `Remover ${item.name}` : `Menos ${item.name}`
                    }
                  >
                    {item.qty <= 1 ? (
                      <LuTrash aria-hidden="true" />
                    ) : (
                      <LuMinus aria-hidden="true" />
                    )}
                  </button>
                  <span className="pdv-modulo__stepperQtd">{item.qty}</span>
                  <button
                    type="button"
                    className="pdv-modulo__stepperBotao"
                    onClick={() => mudarQtd(index, item.qty + 1)}
                    aria-label={`Mais ${item.name}`}
                  >
                    <LuPlus aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {carrinho.length > 0 ? (
        <div className="mod-rodape">
          <button
            type="button"
            className="mod-botao mod-botao--primario mod-botao--bloco"
            onClick={irParaCobrar}
          >
            Cobrar {fmtDinheiro(total)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
