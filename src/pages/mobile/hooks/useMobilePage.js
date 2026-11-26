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

import { useSessao, useOffline, useConfig, useCatalogo, useComandas, useCaixa } from "@/context/AppContext";
import { logAction } from "@/features/auditoria/dados/logger";
import {
  adicionarEspera
} from "@/features/comandas/regras/pedidosEmEspera";
import { useTravaComanda } from "@/hooks/useTravaComanda";
import { travadaPorOutro, nomeTrava } from "@/features/comandas/regras/comandaLock";
import { totalItensAtivos } from "@/features/comandas/regras/comandaItens";


import { PAGE } from "@/pages/mobile/pagina/apoio";
import { useEstadoLancamentoComanda } from "./useEstadoLancamentoComanda";

// Estado e ações do app do garçom no celular: abas, carrinho, comandas, esperas e detalhe.
export function useMobilePage() {
  const navigate = useNavigate();
  const { currentUser, loading: bootstrapLoading, logout, moduloHabilitado, tenant } = useSessao();
  const { redeOnline } = useOffline();
  const { ponteEndereco } = useConfig();
  const { products, categoriaGrupoMap } = useCatalogo();
  const { pending, addPending, updatePending, lancadas, addLancada } = useComandas();
  const { caixaAberto, sales, sessaoAbertaEm } = useCaixa();

  // ── Estado de UI ──────────────────────────────────────────────
  const [aba, setAba] = useState("pedido"); // pedido | comandas | painel | mais
  // Módulo aberto por cima da aba "Mais" (chave de MODULOS_MAIS) ou null.
  const [moduloAberto, setModuloAberto] = useState(null);
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
  const {
    showLancar, setShowLancar, lancComanda, setLancComanda, lancMesa, setLancMesa, lancApelido,
    setLancApelido, lancErro, setLancErro,
  } = useEstadoLancamentoComanda();

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
      // Mesma conta do resto do sistema: só itens ativos, arredondada. A soma
      // inline daqui usava `qty || 0`, então item sem qty valia zero no Palm e
      // 1 no PDV — a mesma comanda tinha dois totais.
      const novoTotal = totalItensAtivos(acumulados);
      const { error } = await updatePending(
        order.id,
        { items: acumulados, total: novoTotal },
        { baseItems: anteriores }
      );
      // Sem isto o erro era engolido: o garçom via "Pedido enviado com
      // sucesso", o carrinho era limpo e a cozinha nunca recebia o papel.
      // Em `enviarEsperas` era pior — a espera contava como enviada e saía
      // da fila para sempre.
      if (error) throw error;
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
    setToast(`Comanda ${nomeComanda} em espera, siga com a próxima`);
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

  return {
    aba, setAba, moduloAberto, setModuloAberto, cartItems, setCartItems, salvando, setSalvando,
    limite, setLimite, catAtiva, setCatAtiva, cartAberto, setCartAberto, toast, setToast,
    buscaGrid, setBuscaGrid, buscaItens, setBuscaItens, esperas, setEsperas, showEsperas,
    setShowEsperas, detalheComanda, setDetalheComanda, detalheVisible, setDetalheVisible,
    currentUser, bootstrapLoading, logout, moduloHabilitado, tenant, redeOnline, ponteEndereco,
    products, categoriaGrupoMap, pending, addPending, updatePending, lancadas, addLancada,
    caixaAberto, sales, sessaoAbertaEm, showLancar, setShowLancar, lancComanda, setLancComanda,
    lancMesa, setLancMesa, lancApelido, setLancApelido, lancErro, setLancErro, bloqueio,
    navigate, detalheTimer, abrirDetalhe, fecharDetalhe, abertas, mapa, comandaEmEdicao,
    emUsoPorOutro, categorias, filtrados, total, qtdTotal, handleAddProduct, handleChangeQty,
    abrirModalLancar, selecionarComanda, persistirLancamento, handleLancar, porEmEspera,
    enviarEsperas,
  };
}
