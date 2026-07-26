/**
 * MobilePage — o /palm do garçom, reconstruído sobre o design mobile
 * (telas 1a–1h). Este arquivo é o SHELL: guarda todo o estado e as regras
 * de negócio (que vêm intactas da versão anterior) e apenas orquestra os
 * componentes puramente apresentacionais em `src/pages/mobile/`.
 *
 * Navegação por abas fixas na base (Pedido · Comandas · Painel · Mais),
 * no lugar do antigo `mode` de três telas. Toda a lógica de lançamento,
 * espera, trava de comanda e guardas de caixa/offline foi preservada.
 *
 * Intuitividade (princípio nº 1): as quatro ações do garçom viram quatro
 * abas sempre visíveis com o polegar; nada fica escondido atrás de menu.
 * O caminho feliz — escolher itens, lançar na comanda — continua em poucos
 * toques, agora com teclado numérico grande e carrinho em folha inferior.
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LuWifiOff } from "react-icons/lu";

import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { nomeExibicaoTenant } from "@/lib/tema";
import {
  totalLancamentosGarcom,
  radarOportunidades,
} from "@/lib/painelGarcom";
import {
  adicionarEspera,
  removerEspera,
  totalEspera,
  resumoEsperas,
} from "@/lib/pedidosEmEspera";
import { useTravaComanda } from "@/hooks/useTravaComanda";
import { travadaPorOutro, nomeTrava } from "@/lib/comandaLock";
import MODULOS from "@/constants/modulos";

import { fmtComanda, fmtDinheiro } from "@/pages/mobile/fmt";
import { BottomNav, Guarda, Toast } from "@/pages/mobile/chrome";
import PedidoTab from "@/pages/mobile/tabs/pedido/PedidoTab";
import ComandasTab from "@/pages/mobile/tabs/comandas/ComandasTab";
import PainelTab from "@/pages/mobile/tabs/painel/PainelTab";
import MaisTab from "@/pages/mobile/tabs/mais/MaisTab";
import CarrinhoSheet from "@/pages/mobile/sheets/lancamento/CarrinhoSheet";
import LancarSheet from "@/pages/mobile/sheets/lancamento/LancarSheet";
import EsperasSheet from "@/pages/mobile/sheets/comanda/EsperasSheet";
import DetalheComandaSheet from "@/pages/mobile/sheets/comanda/DetalheComandaSheet";

import "./MobilePage.css";

const TOTAL_COMANDAS = 1000;
const PAGE = 50;

/**
 * Módulos oferecidos na aba "Mais" — atalhos para telas que existem hoje
 * mas são melhores no computador (por isso `melhorNoComputador`). Nada
 * hardcodado por cliente: a lista é filtrada por permissão do usuário e
 * pelo plano do tenant (`moduloHabilitado`).
 */
const MODULOS_MAIS = [
  { chave: "pdv", perm: "pdv", modulo: MODULOS.PDV, rota: "/app/pdv", icone: "pdv", rotulo: "PDV", descricao: "Caixa e cobrança" },
  { chave: "produtos", perm: "produtos", modulo: MODULOS.CARDAPIO, rota: "/app/produtos", icone: "cardapio", rotulo: "Cardápio", descricao: "Produtos e preços" },
  { chave: "estoque", perm: "estoque", modulo: MODULOS.ESTOQUE, rota: "/app/estoque", icone: "estoque", rotulo: "Estoque", descricao: "Insumos e validade" },
  { chave: "cozinha", perm: "cozinha", modulo: MODULOS.COZINHA, rota: "/app/cozinha", icone: "cozinha", rotulo: "Cozinha", descricao: "Painel de produção" },
  { chave: "delivery", perm: "produtos", modulo: MODULOS.DELIVERY, rota: "/app/delivery", icone: "delivery", rotulo: "Delivery", descricao: "Pedidos para entrega" },
  { chave: "financeiro", perm: "financeiro", modulo: MODULOS.FINANCEIRO, rota: "/app/financeiro", icone: "financeiro", rotulo: "Financeiro", descricao: "Contas e fluxo de caixa" },
  { chave: "relatorio", perm: "relatorio", modulo: MODULOS.RELATORIOS, rota: "/app/relatorio", icone: "relatorios", rotulo: "Relatórios", descricao: "Vendas e desempenho" },
  { chave: "clientes", perm: "clientes", modulo: MODULOS.CLIENTES, rota: "/app/clientes", icone: "clientes", rotulo: "Clientes", descricao: "Cadastro e histórico" },
];

/** "HH:MM" a partir de um ISO; undefined se não der para interpretar. */
function formatHoraCurta(iso) {
  if (!iso) return undefined;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return undefined;
  const hora = String(data.getHours()).padStart(2, "0");
  const min = String(data.getMinutes()).padStart(2, "0");
  return `${hora}:${min}`;
}

export default function MobilePage() {
  const navigate = useNavigate();
  const {
    pending,
    products,
    currentUser,
    caixaAberto,
    loading: bootstrapLoading,
    addPending,
    updatePending,
    lancadas,
    addLancada,
    logout,
    sales,
    sessaoAbertaEm,
    categoriaGrupoMap,
    redeOnline,
    ponteEndereco,
    moduloHabilitado,
    tenant,
  } = useApp();

  // ── Estado de UI ──────────────────────────────────────────────
  const [aba, setAba] = useState("pedido"); // pedido | comandas | painel | mais
  const [cartItems, setCartItems] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [limite, setLimite] = useState(PAGE);
  const [catAtiva, setCatAtiva] = useState("Todos");
  const [cartAberto, setCartAberto] = useState(false);
  const [toast, setToast] = useState("");
  const [buscaGrid, setBuscaGrid] = useState("");
  const [buscaItens, setBuscaItens] = useState("");
  const [esperas, setEsperas] = useState([]);
  const [showEsperas, setShowEsperas] = useState(false);
  const [showLancar, setShowLancar] = useState(false);
  const [lancComanda, setLancComanda] = useState("");
  const [lancMesa, setLancMesa] = useState("");
  const [lancApelido, setLancApelido] = useState(""); // nome/complemento opcional (sai impresso, separado do nº)
  const [lancErro, setLancErro] = useState("");
  const [detalheComanda, setDetalheComanda] = useState(null);
  const [detalheVisible, setDetalheVisible] = useState(false);
  const detalheTimer = useRef(null);

  // ── Detalhe da comanda (folha inferior) ───────────────────────
  const abrirDetalhe = (order) => {
    if (detalheTimer.current) clearTimeout(detalheTimer.current);
    setDetalheComanda(order);
    setDetalheVisible(true);
  };
  const fecharDetalhe = () => {
    setDetalheVisible(false);
    detalheTimer.current = setTimeout(() => setDetalheComanda(null), 300);
  };

  // ── Índice de comandas abertas ────────────────────────────────
  const abertas = pending.filter((o) => o.status !== "closed");
  const mapa = {};
  abertas.forEach((o) => {
    mapa[String(o.comanda)] = o;
  });

  // Comanda "em edição" (para a trava): a que está aberta em detalhe, ou
  // a que o garçom está digitando no fluxo de lançamento.
  const comandaEmEdicao = detalheComanda
    ? mapa[String(detalheComanda.comanda)] ?? detalheComanda
    : aba === "pedido" && lancComanda.trim()
    ? mapa[lancComanda.trim()]
    : null;
  const { bloqueio } = useTravaComanda(comandaEmEdicao, true);
  const emUsoPorOutro = (order) => travadaPorOutro(order, currentUser?.username);

  // ── Cardápio ──────────────────────────────────────────────────
  const categorias = [
    "Todos",
    ...new Set(products.map((p) => p.category).filter(Boolean)),
  ];
  const filtrados =
    catAtiva === "Todos"
      ? products
      : products.filter((p) => p.category === catAtiva);

  // ── Totais do carrinho ────────────────────────────────────────
  const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const qtdTotal = cartItems.reduce((s, i) => s + i.qty, 0);

  const handleAddProduct = (product) => {
    setCartItems((prev) => {
      const idx = prev.findIndex((i) => i.id === product.id);
      if (idx >= 0) {
        return prev.map((it, i) => (i === idx ? { ...it, qty: it.qty + 1 } : it));
      }
      return [...prev, { ...product, qty: 1, _key: Date.now() + Math.random() }];
    });
  };

  const handleChangeQty = (index, qty) => {
    if (qty <= 0) {
      setCartItems((prev) => prev.filter((_, i) => i !== index));
    } else {
      setCartItems((prev) =>
        prev.map((it, i) => (i === index ? { ...it, qty } : it))
      );
    }
  };

  const abrirModalLancar = () => {
    // Todo lançamento novo começa do zero: comanda, mesa e nome sempre em
    // branco ao abrir a sheet, independente do lançamento anterior ter sido
    // concluído, deixado em espera ou abandonado. Evita reaproveitar por engano
    // o número/mesa/nome da comanda anterior no próximo pedido.
    setLancComanda("");
    setLancMesa("");
    setLancApelido("");
    setLancErro("");
    setShowLancar(true);
  };

  const selecionarComanda = (comanda, mesa = "", apelido = "") => {
    const order = mapa[String(comanda)];
    if (order) {
      abrirDetalhe(order);
    } else {
      setLancComanda(String(comanda));
      setLancMesa(mesa || "");
      setLancApelido(apelido || "");
      setLancErro("");
      setAba("pedido");
      setShowLancar(true);
    }
  };

  /**
   * Persiste um lançamento: cria a comanda se não existir, atualiza a mesa
   * se veio nova, e acumula os itens do carrinho. Retorna a order final.
   */
  const persistirLancamento = async (nomeComanda, mesa, itensCarrinho, apelido = "") => {
    let order = mapa[nomeComanda];

    if (!order) {
      const agora = new Date().toISOString();
      order = {
        id: crypto.randomUUID(),
        comanda: nomeComanda,
        mesa,
        apelido: apelido || null,
        items: [],
        status: "open",
        total: 0,
        garcom: currentUser?.name || "",
        created_by: currentUser?.username || "",
        created_at: agora,
        updated_at: agora,
      };
      const { error } = await addPending(order);
      if (error) throw error;
      logAction("comanda:abrir", { comanda: nomeComanda, mesa });
    } else {
      // Preenche mesa/apelido só se ainda estiverem vazios na comanda — não
      // sobrescreve o que já foi definido antes (mesmo critério dos dois).
      const patch = {};
      if (mesa && !order.mesa) patch.mesa = mesa;
      if (apelido && !order.apelido) patch.apelido = apelido;
      if (Object.keys(patch).length > 0) {
        const { error } = await updatePending(order.id, patch);
        if (error) throw error;
        order = { ...order, ...patch };
      }
    }

    let updatedOrder = order;

    if (itensCarrinho.length > 0) {
      const agora = new Date().toISOString();
      const anteriores = Array.isArray(order.items) ? order.items : [];
      const novos = itensCarrinho.map(({ _key, ...resto }) => ({
        ...resto,
        launched_at: agora,
      }));
      const acumulados = [...anteriores, ...novos];
      const novoTotal = acumulados.reduce(
        (s, it) => s + (it.price || 0) * (it.qty || 0),
        0
      );
      await updatePending(
        order.id,
        { items: acumulados, total: novoTotal },
        { baseItems: anteriores }
      );
      addLancada(order.id);
      logAction("itens:lancar", {
        comanda: nomeComanda,
        qtd: novos.length,
      });
      updatedOrder = {
        ...order,
        items: acumulados,
        total: novoTotal,
        updated_at: agora,
      };
    }

    return updatedOrder;
  };

  const handleLancar = async () => {
    const nomeComanda = lancComanda.trim();
    const mesa = lancMesa.trim();
    const apelido = lancApelido.trim();
    if (!nomeComanda) {
      setLancErro("Informe o número ou nome da comanda.");
      return;
    }
    if (salvando) return;

    const existente = mapa[nomeComanda];
    if (existente && emUsoPorOutro(existente)) {
      setLancErro(
        `Em uso por ${bloqueio?.nome ?? nomeTrava(existente)}. Aguarde fechar a comanda.`
      );
      return;
    }

    // Se já há esperas acumuladas, este vira mais um da fila: acumula e
    // manda para a folha de esperas (o garçom revisa e envia todos juntos).
    if (cartItems.length > 0 && esperas.length > 0) {
      setEsperas((prev) =>
        adicionarEspera(prev, { comanda: nomeComanda, mesa, apelido, items: cartItems })
      );
      setCartItems([]);
      setLancComanda("");
      setLancMesa("");
      setLancApelido("");
      setLancErro("");
      setShowLancar(false);
      setShowEsperas(true);
      return;
    }

    setSalvando(true);
    try {
      const updatedOrder = await persistirLancamento(
        nomeComanda,
        mesa,
        cartItems,
        apelido
      );
      if (cartItems.length > 0) {
        setToast("✓ Pedido enviado com sucesso!");
        setTimeout(() => setToast(""), 3000);
      }
      setCartItems([]);
      setLancComanda("");
      setLancMesa("");
      setLancApelido("");
      setLancErro("");
      setShowLancar(false);
      setAba("comandas");
      setTimeout(() => abrirDetalhe(updatedOrder), 80);
    } catch (e) {
      console.error("Erro ao lançar pedido:", e);
      setLancErro("Erro ao lançar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const porEmEspera = () => {
    const nomeComanda = lancComanda.trim();
    const mesa = lancMesa.trim();
    const apelido = lancApelido.trim();
    if (!nomeComanda) {
      setLancErro("Informe o número ou nome da comanda.");
      return;
    }
    if (cartItems.length === 0) return;
    setEsperas((prev) =>
      adicionarEspera(prev, { comanda: nomeComanda, mesa, apelido, items: cartItems })
    );
    setCartItems([]);
    setLancComanda("");
    setLancMesa("");
    setLancApelido("");
    setLancErro("");
    setShowLancar(false);
    setToast(`Comanda ${nomeComanda} em espera — siga com a próxima`);
    setTimeout(() => setToast(""), 2500);
  };

  const enviarEsperas = async () => {
    if (salvando || esperas.length === 0) return;
    setSalvando(true);
    const restantes = [];
    let enviados = 0;
    for (const esp of esperas) {
      const existente = mapa[esp.comanda];
      if (existente && emUsoPorOutro(existente)) {
        restantes.push({
          ...esp,
          erro: `Em uso por ${nomeTrava(existente)}. Aguarde liberar e envie de novo.`,
        });
        continue;
      }
      try {
        await persistirLancamento(esp.comanda, esp.mesa || "", esp.items || [], esp.apelido || "");
        enviados++;
      } catch (e) {
        console.error("Erro ao enviar espera:", e);
        restantes.push({ ...esp, erro: "Erro ao enviar. Tente de novo." });
      }
    }
    setEsperas(restantes);
    setSalvando(false);
    if (enviados > 0) {
      setToast(`✓ ${enviados} comanda(s) enviada(s)!`);
      setTimeout(() => setToast(""), 3000);
    }
    if (restantes.length === 0) {
      setShowEsperas(false);
      setAba("comandas");
    }
  };

  // ── Guardas de tela cheia ─────────────────────────────────────
  if (bootstrapLoading) {
    return <Guarda tipo="loading" />;
  }
  if (!caixaAberto) {
    return <Guarda tipo="caixaFechado" onAcao={() => window.location.reload()} />;
  }

  // ── Adaptadores de dados para as abas ─────────────────────────

  // Barra de esperas (compartilhada por Pedido e Comandas).
  const resumo = resumoEsperas(esperas);
  const barraEsperas = esperas.length
    ? { qtd: resumo.pedidos, total: resumo.total, onClick: () => setShowEsperas(true) }
    : null;

  // (a) PedidoTab
  const qItens = buscaItens.trim().toLowerCase();
  const produtosFiltrados = qItens
    ? filtrados.filter((p) => p.name.toLowerCase().includes(qItens))
    : filtrados;
  const qtdPorId = cartItems.reduce((acc, i) => {
    acc[i.id] = i.qty;
    return acc;
  }, {});

  // (b) ComandasTab
  const estadoDaOrder = (order) => {
    if (!order) return "vazia";
    if (lancadas.has(order.id)) return "lancada";
    const itens = Array.isArray(order.items) ? order.items : [];
    const qtd = itens.reduce((s, it) => s + (it.qty || 1), 0);
    return qtd > 0 ? "comItens" : "vazia";
  };
  const qGrid = buscaGrid.trim().toLowerCase();
  const resultadosGrid = qGrid
    ? abertas.filter((o) => {
        const nome = String(o.comanda).toLowerCase();
        return (
          nome.includes(qGrid) ||
          fmtComanda(o.comanda).toLowerCase().includes(qGrid) ||
          (o.garcom ?? "").toLowerCase().includes(qGrid)
        );
      })
    : null;
  const comandasGrade =
    resultadosGrid !== null
      ? resultadosGrid.map((order) => ({
          numero: order.comanda,
          estado: estadoDaOrder(order),
          emUso: emUsoPorOutro(order),
          nomeTrava: nomeTrava(order),
          total: order.total ?? 0,
          onClick: () => selecionarComanda(order.comanda, order.mesa, order.apelido),
        }))
      : Array.from({ length: limite }, (_, i) => i + 1).map((num) => {
          const order = mapa[String(num)];
          return {
            numero: num,
            estado: estadoDaOrder(order),
            emUso: order ? emUsoPorOutro(order) : false,
            nomeTrava: order ? nomeTrava(order) : "",
            total: order?.total ?? 0,
            onClick: () => selecionarComanda(num, order?.mesa, order?.apelido),
          };
        });
  const temMais = resultadosGrid === null && limite < TOTAL_COMANDAS;

  // (c) PainelTab
  const comandasEVendas = [
    ...abertas,
    ...(Array.isArray(sales) ? sales : []),
  ];
  const meu = totalLancamentosGarcom(comandasEVendas, {
    nome: currentUser?.name,
    username: currentUser?.username,
    desde: sessaoAbertaEm,
  });
  const ticketMedio = meu.comandas > 0 ? meu.total / meu.comandas : 0;
  const oportunidades = radarOportunidades(
    abertas,
    categoriaGrupoMap,
    products
  ).map((card) => ({
    ...card,
    onClick: () => {
      const o = mapa[String(card.comanda)];
      if (o) abrirDetalhe(o);
    },
  }));

  // (d) MaisTab
  const tenantNome = nomeExibicaoTenant(tenant?.tema, tenant?.nome);
  const usuarioIniciais =
    (currentUser?.name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("") || "?";
  const caixaInfo = {
    aberto: caixaAberto,
    desde: formatHoraCurta(sessaoAbertaEm),
    operador: undefined,
  };
  // Configurações segue a mesma regra dos módulos: só aparece para quem tem a
  // permissão. Sem ela, o botão some (prevenção > erro) — antes ele aparecia
  // sempre e a rota expulsava o usuário sem permissão.
  const podeConfiguracoes = !!currentUser?.permissions?.configuracoes;
  const modulosMais = MODULOS_MAIS.filter(
    (m) =>
      currentUser?.permissions?.[m.perm] &&
      (!m.modulo || moduloHabilitado(m.modulo))
  ).map((m) => ({
    chave: m.chave,
    rotulo: m.rotulo,
    descricao: m.descricao,
    icone: m.icone,
    habilitado: true,
    melhorNoComputador: true,
    onClick: () => navigate(m.rota),
  }));

  // (e) EsperasSheet
  const esperasAdaptadas = esperas.map((esp) => ({
    id: esp.comanda,
    nome: esp.comanda,
    itensTexto: (Array.isArray(esp.items) ? esp.items : [])
      .map((it) => `${it.qty ?? 1}× ${it.name}`)
      .join(", "),
    total: totalEspera(esp),
    erro: esp.erro,
  }));
  const resumoEsperasTexto = `${resumo.pedidos} pedido(s) · ${resumo.itens} item(ns) · ${fmtDinheiro(
    resumo.total
  )}`;

  // ── Wiring das sheets de lançamento ───────────────────────────
  const nomeLanc = lancComanda.trim();
  const existeLanc = mapa[nomeLanc];
  const textoConfirmarLancar =
    cartItems.length === 0
      ? existeLanc
        ? "Abrir Comanda"
        : "Criar Comanda"
      : esperas.length > 0
      ? `Revisar e lançar todos (${esperas.length + 1})`
      : existeLanc
      ? "Adicionar à Comanda"
      : "Criar e Lançar";

  const orderDetalhe = detalheComanda
    ? mapa[String(detalheComanda.comanda)] ?? detalheComanda
    : null;

  return (
    <div className="mobile-page">
      {/* ── Sem internet + ponte configurada → oferece o modo local.
          Pill não-bloqueante: um toque leva à página servida pela ponte
          no Wi-Fi do caixa, onde o pedido continua saindo na impressora.
          Só aparece quando faz sentido (prevenção > erro). ── */}
      {redeOnline === false && ponteEndereco ? (
        <button
          type="button"
          className="mobile-page__offline-pill"
          onClick={() => {
            window.location.href = ponteEndereco;
          }}
        >
          <LuWifiOff aria-hidden="true" />
          <span>Sem internet — lançar pelo Wi-Fi do caixa</span>
        </button>
      ) : null}

      <div className="mobile-page__conteudo">
        {aba === "pedido" && (
          <PedidoTab
            usuarioNome={currentUser?.name?.split(" ")[0]}
            onLogout={logout}
            categorias={categorias}
            catAtiva={catAtiva}
            onCategoria={setCatAtiva}
            busca={buscaItens}
            onBusca={setBuscaItens}
            produtos={produtosFiltrados}
            qtdPorId={qtdPorId}
            onAddProduto={handleAddProduct}
            carrinhoQtd={qtdTotal}
            carrinhoTotal={total}
            onAbrirCarrinho={() => setCartAberto(true)}
            barraEsperas={barraEsperas}
          />
        )}

        {aba === "comandas" && (
          <ComandasTab
            busca={buscaGrid}
            onBusca={setBuscaGrid}
            onVoltar={() => setAba("pedido")}
            comandas={comandasGrade}
            temMais={temMais}
            limite={limite}
            total={TOTAL_COMANDAS}
            onVerMais={() =>
              setLimite((l) => Math.min(l + PAGE, TOTAL_COMANDAS))
            }
            barraEsperas={barraEsperas}
          />
        )}

        {aba === "painel" && (
          <PainelTab
            meu={meu}
            ticketMedio={ticketMedio}
            oportunidades={oportunidades}
          />
        )}

        {aba === "mais" && (
          <MaisTab
            tenantNome={tenantNome}
            usuarioNome={currentUser?.name}
            usuarioIniciais={usuarioIniciais}
            caixa={caixaInfo}
            modulos={modulosMais}
            onConfiguracoes={
              podeConfiguracoes ? () => navigate("/app/configuracoes") : undefined
            }
          />
        )}
      </div>

      <BottomNav
        ativa={aba}
        onNavegar={setAba}
        comandasBadge={abertas.length}
      />

      {/* ── Sheets (fixas, sobrepõem tudo) ── */}
      <CarrinhoSheet
        aberto={cartAberto}
        itens={cartItems}
        onFechar={() => setCartAberto(false)}
        onQtd={handleChangeQty}
        onLimpar={() => {
          setCartItems([]);
          setCartAberto(false);
          setLancComanda("");
          setLancMesa("");
          setLancApelido("");
        }}
        onLancar={() => {
          setCartAberto(false);
          abrirModalLancar();
        }}
        total={total}
        podeConfirmar={cartItems.length > 0}
        textoConfirmar="Lançar pedido"
      />

      <LancarSheet
        aberto={showLancar}
        titulo={cartItems.length === 0 ? "Abrir Comanda" : "Lançar Pedido"}
        comanda={lancComanda}
        mesa={lancMesa}
        nome={lancApelido}
        onComanda={(v) => {
          setLancComanda(v);
          setLancErro("");
        }}
        onMesa={setLancMesa}
        onNome={setLancApelido}
        onConfirmar={handleLancar}
        onEspera={porEmEspera}
        onFechar={() => {
          if (!salvando) setShowLancar(false);
        }}
        erro={lancErro}
        salvando={salvando}
        textoConfirmar={textoConfirmarLancar}
        mostrarEspera={cartItems.length > 0}
      />

      <EsperasSheet
        aberto={showEsperas}
        esperas={esperasAdaptadas}
        resumo={resumoEsperasTexto}
        onFechar={() => setShowEsperas(false)}
        onRemover={(id) =>
          setEsperas((prev) => {
            const depois = removerEspera(prev, id);
            if (depois.length === 0) setShowEsperas(false);
            return depois;
          })
        }
        onEnviarTodos={enviarEsperas}
        enviando={salvando}
      />

      <DetalheComandaSheet
        order={orderDetalhe}
        visivel={detalheVisible}
        onFechar={fecharDetalhe}
        onAdicionar={() => {
          const o = detalheComanda
            ? mapa[String(detalheComanda.comanda)] ?? detalheComanda
            : null;
          if (!o) return;
          fecharDetalhe();
          setTimeout(() => {
            setLancComanda(String(o.comanda));
            setLancMesa(o.mesa || "");
            setLancApelido(o.apelido || "");
            setLancErro("");
            setAba("pedido");
          }, 320);
        }}
        travada={!!(bloqueio || (orderDetalhe && emUsoPorOutro(orderDetalhe)))}
        nomeTrava={
          bloqueio?.nome ?? (orderDetalhe ? nomeTrava(orderDetalhe) : "")
        }
      />

      <Toast msg={toast} />
    </div>
  );
}
