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
  LuWallet
} from "react-icons/lu";
import { useSessao, useOffline, useConfig, useCatalogo, useCaixa } from "@/context/AppContext";
import { useFinalizarPagamento } from "./useFinalizarPagamento";
import { round2 } from "@/features/caixa/regras/vendas";
import { rotuloMetodo } from "@/utils/pagamentos";
import {
  buscarConfigImpressao, montarComprovantePagamento
} from "@/features/impressao/dados/impressao";
import { imprimirDocumento } from "@/features/impressao/regras/drivers";
import { ICONES_METODO, COMANDA_BALCAO, precoDoItem } from "@/pages/mobile/modulos/pdv/apoio";
import { METODOS_PADRAO, metodoBloqueadoSemRede, trocoEmDinheiro } from "@/features/pdv/regras/pagamento";

// Estado e ações da venda de balcão no celular: catálogo, carrinho, meios de pagamento,
// troco e os três passos (itens, cobrar, concluído).
export function usePdvCelular({ onVoltar }) {
  const { currentUser, tenant, addonHabilitado } = useSessao();
  const { redeOnline } = useOffline();
  const { meiosPagamento, metodosCustom, metodosTef } = useConfig();
  const { products } = useCatalogo();
  const { caixaAberto } = useCaixa();
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
    metodoBloqueadoSemRede(id, { redeOnline, tefLigado: addonHabilitado?.("tef"), metodosTef });

  // Fiado exige cliente identificado (F010) e o PDV rápido não tem seleção
  // de cliente — em vez de gravar fiado sem dono, bloqueia e diz o caminho.
  const ehFiado = (id) => id === "fiado";

  const metodoIndisponivel = (id) => bloqueadoOffline(id) || ehFiado(id);

  // ── Troco ───────────────────────────────────────────────────────
  const ehDinheiro = metodo === "dinheiro";
  const recebidoNum = round2(Number(String(recebido).replace(",", ".")) || 0);
  const troco = ehDinheiro ? trocoEmDinheiro(recebidoNum, total) : 0;
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
      ? "Não imprimiu, tentar de novo"
      : impressao === "sucesso"
      ? "Comprovante enviado"
      : "Imprimir comprovante";

  return {
    passo, setPasso, busca, setBusca, catAtiva, setCatAtiva, carrinho, setCarrinho, metodo,
    setMetodo, recebido, setRecebido, salvando, setSalvando, erro, setErro, impressao,
    setImpressao, resumoVenda, setResumoVenda, currentUser, tenant, addonHabilitado, redeOnline,
    meiosPagamento, metodosCustom, metodosTef, products, caixaAberto, finalizarPagamento,
    timerImpressao, listaProdutos, categorias, produtosFiltrados, qtdPorId, total, qtdTotal,
    adicionar, mudarQtd, metodos, bloqueadoOffline, ehFiado, metodoIndisponivel, ehDinheiro,
    recebidoNum, troco, falta, podeConfirmar, pagamentosAtuais, vendaParaImpressao, irParaCobrar,
    voltarParaItens, novaVenda, confirmar, imprimir, rotuloImpressao, onVoltar,
  };
}
