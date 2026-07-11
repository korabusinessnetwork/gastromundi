import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getPermissions } from "@/constants/roles";
import { useIsMobile, useIdleTimer } from "@/utils/hooks";
import { supabase } from "@/lib/supabase";
import { buscarBootstrapTenant, moduloHabilitado, addonHabilitado } from "@/lib/tenant";
import { sincronizarStatusAssinatura } from "@/lib/assinatura";
import { gerarVariaveisTema, aplicarVariaveisTema } from "@/lib/tema";
import { logAction } from "@/lib/logger";
import { emitirEvento } from "@/lib/jarvas";
import { executarAnaliseJarvas } from "@/lib/jarvasEngine";
import { mapearVendaParaLinhas } from "@/lib/vendas";
import { processarBaixaEstoque } from "@/lib/estoque";
import { sanitizeInput } from "@/utils/crypto";
import {
  saveSession, loadSession, clearSession,
  getAttempts, setAttempts, clearAttempts,
  IDLE_MS, MAX_ATTEMPTS, LOCKOUT_MS,
} from "@/utils/session";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // ── Estado local ─────────────────────────────────────────────
  const [products,    setProductsLocal]    = useState([]);
  const [pending,     setPendingLocal]     = useState([]);
  const [sales,       setSalesLocal]       = useState([]);
  const [users,       setUsersLocal]       = useState([]);
  const [fechamentos, setFechamentosLocal] = useState([]);
  const [fundoAtual,      setFundoAtualLocal]    = useState(0);
  const [caixaAberto,     setCaixaAbertoLocal]   = useState(true);
  const [sessaoAbertaEm,  setSessaoAbertaEmLocal] = useState(null);
  const [meiosPagamento,  setMeiosPagamentoLocal] = useState(["dinheiro", "credito", "debito", "pix"]);
  const [metodosCustom,   setMetodosCustomLocal]  = useState([]);
  const [taxaServico,     setTaxaServicoLocal]    = useState(false);
  const [estoque,         setEstoqueLocal]        = useState({});
  const [estoqueMinimos,  setEstoqueMinimosLocal] = useState({});
  const [tenant,          setTenantLocal]         = useState(null); // Fase 1 — camada de comercialização (ADR-005)
  const [loading,       setLoading]          = useState(true);
  // IDs de comandas com pedido lançado na sessão atual (sobrevive troca de aba)
  const [lancadas,    setLancadas]         = useState(new Set());

  // ── Auth ─────────────────────────────────────────────────────
  const [currentUser,  setCurrentUser]  = useState(() => loadSession());
  const [mobileChoice, setMobileChoice] = useState(null);

  const isMobile = useIsMobile();

  const logoutCallback = useCallback(() => {
    if (currentUser) logout();
  }, [currentUser]);
  useIdleTimer(logoutCallback, IDLE_MS, !!currentUser);

  // ── Restaura sessão do Supabase Auth ao carregar ─────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const userData = await buscarDadosUsuario(session.user.id);
        if (userData) {
          setCurrentUser(userData);
          saveSession(userData);
          await bootstrap();
        } else {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        setMobileChoice(null);
        clearSession();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Busca nome, role e permissions do usuário pelo auth_id
  async function buscarDadosUsuario(authId) {
    const { data } = await supabase
      .from("users")
      .select("id,name,username,role,auth_id")
      .eq("auth_id", authId)
      .eq("active", true)
      .single();
    if (!data) return null;
    return { ...data, permissions: getPermissions(data.role) };
  }

  // TD009 (etapa 2) — leituras agora vêm de vendas/venda_itens/venda_pagamentos
  // (remontadas no shape legado via montarVendaLegada); sales segue recebendo
  // a gravação dupla como backup. Se a leitura nova falhar por qualquer
  // motivo, cai para a query antiga em sales (resiliência na transição).
  async function buscarSalesData() {
    const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const { data: vendasData, error: eVendas } = await supabase
        .from("vendas")
        .select("id,comanda,mesa,subtotal,taxa_servico,valor_taxa,valor_ajuste,total,cashier,at")
        .gte("at", desde)
        .order("at", { ascending: false });
      if (eVendas) throw eVendas;

      const ids = (vendasData ?? []).map(v => v.id);
      let itensData = [], pagamentosData = [];
      if (ids.length > 0) {
        const [itensRes, pagamentosRes] = await Promise.all([
          supabase.from("venda_itens").select("venda_id,product_id,nome,preco,qtd,cancelado,motivo_cancelamento,cancelado_por").in("venda_id", ids),
          supabase.from("venda_pagamentos").select("venda_id,metodo,valor").in("venda_id", ids),
        ]);
        if (itensRes.error) throw itensRes.error;
        if (pagamentosRes.error) throw pagamentosRes.error;
        itensData = itensRes.data ?? [];
        pagamentosData = pagamentosRes.data ?? [];
      }

      const itensPorVenda = {};
      for (const item of itensData) {
        if (!itensPorVenda[item.venda_id]) itensPorVenda[item.venda_id] = [];
        itensPorVenda[item.venda_id].push(item);
      }
      const pagamentosPorVenda = {};
      for (const pag of pagamentosData) {
        if (!pagamentosPorVenda[pag.venda_id]) pagamentosPorVenda[pag.venda_id] = [];
        pagamentosPorVenda[pag.venda_id].push(pag);
      }

      return (vendasData ?? []).map(venda => montarVendaLegada({
        venda,
        itens: itensPorVenda[venda.id] ?? [],
        pagamentos: pagamentosPorVenda[venda.id] ?? [],
      }));
    } catch (err) {
      console.error("[bootstrap] falha ao ler vendas normalizadas, usando fallback em sales:", err);
      const { data: salesData, error: eSales } = await supabase
        .from("sales").select("id,data,at").gte("at", desde).order("at", { ascending: false });
      if (eSales) {
        console.error("[bootstrap] sales fallback error:", eSales);
        return [];
      }
      return (salesData ?? []).map(r => r.data);
    }
  }

  // ── Fetch inicial do Supabase (só roda autenticado) ───────────
  async function bootstrap() {
      const [
        { data: productsData, error: eProducts },
        { data: pendingData,  error: ePending  },
        salesData,
        { data: usersData,    error: eUsers    },
        { data: fechamentosData, error: eFech  },
        { data: configData,   error: eConfig   },
        { data: estoqueData,  error: eEstoque  },
        { data: tenantData,   error: eTenant   },
      ] = await Promise.all([
        supabase.from("products").select("*").eq("active", true).order("id"),
        supabase.from("pending").select("*").order("created_at", { ascending: false }),
        // Bootstrap limitado a 90 dias — relatórios de período maior devem consultar sob demanda.
        buscarSalesData(),
        supabase.from("users").select("id,name,username,role,auth_id,active").eq("active", true),
        supabase.from("fechamentos").select("id,data,created_at").order("created_at", { ascending: false }),
        supabase.from("config").select("key,value").in("key", ["fundo_atual","caixa_aberto","sessao_aberta_em","meios_pagamento","taxa_servico","metodos_custom"]),
        supabase.from("estoque").select("produto_id,quantidade,minimo"),
        // Fases 1-2 — camada de comercialização (ADR-005): nunca lança, então nunca bloqueia o resto do bootstrap.
        buscarBootstrapTenant(),
      ]);

      if (eUsers)    console.error("[bootstrap] users error:", eUsers);
      if (eProducts) console.error("[bootstrap] products error:", eProducts);
      if (ePending)  console.error("[bootstrap] pending error:", ePending);
      if (eFech)     console.error("[bootstrap] fechamentos error:", eFech);
      if (eConfig)   console.error("[bootstrap] config error:", eConfig);
      if (eEstoque)  console.error("[bootstrap] estoque error:", eEstoque);
      if (eTenant)   console.error("[bootstrap] tenant error:", eTenant);

      if (productsData?.length)    setProductsLocal(productsData);
      if (pendingData)             setPendingLocal(pendingData);
      if (salesData)               setSalesLocal(salesData);
      if (usersData?.length)       setUsersLocal(usersData.map(u => ({
        ...u,
        permissions: getPermissions(u.role),
      })));
      if (fechamentosData)         setFechamentosLocal(fechamentosData.map(r => r.data));

      if (estoqueData) {
        const qtds = {}, minimos = {};
        for (const row of estoqueData) {
          qtds[row.produto_id]    = Number(row.quantidade);
          minimos[row.produto_id] = Number(row.minimo);
        }
        setEstoqueLocal(qtds);
        setEstoqueMinimosLocal(minimos);
      }

      if (configData) {
        const fundo  = configData.find(c => c.key === "fundo_atual");
        const caixa  = configData.find(c => c.key === "caixa_aberto");
        const sessao = configData.find(c => c.key === "sessao_aberta_em");
        if (fundo)   setFundoAtualLocal(Number(fundo.value));
        if (caixa)   setCaixaAbertoLocal(caixa.value === true || caixa.value === "true");
        if (sessao?.value) setSessaoAbertaEmLocal(sessao.value);
        const meios = configData.find(c => c.key === "meios_pagamento");
        if (meios?.value && Array.isArray(meios.value) && meios.value.length > 0) setMeiosPagamentoLocal(meios.value);
        const taxa = configData.find(c => c.key === "taxa_servico");
        if (taxa?.value !== undefined) setTaxaServicoLocal(!!taxa.value);
        const custom = configData.find(c => c.key === "metodos_custom");
        if (custom?.value && Array.isArray(custom.value)) setMetodosCustomLocal(custom.value);
      }

      if (tenantData) {
        setTenantLocal(tenantData);
        // Fase 4 — camada de comercialização (ADR-006): sincroniza o CACHE
        // de status no banco (telas administrativas). Fire-and-forget —
        // nunca bloqueia o bootstrap; o status exibido já foi calculado
        // localmente em buscarBootstrapTenant, não depende desta chamada.
        if (tenantData.id) {
          sincronizarStatusAssinatura(tenantData.id).catch((err) => {
            console.error("[bootstrap] falha ao sincronizar status da assinatura:", err);
          });
        }
      }

      setLoading(false);
  }

  // ── Atualiza currentUser quando a lista de usuários muda ──────
  useEffect(() => {
    if (!currentUser) return;
    const updated = users.find(u => u.id === currentUser.id);
    if (updated) {
      const refreshed = { ...updated, permissions: getPermissions(updated.role) };
      setCurrentUser(refreshed);
      saveSession(refreshed);
    }
  }, [users]);

  // ── Fase 6 — camada de comercialização (ADR-007): aplica o tema do
  //    tenant (--gm-*) assim que `tenant.tema` é conhecido. Sem tema
  //    custom (tenant atual, GastroMundi), `gerarVariaveisTema` retorna
  //    {} e os defaults de src/styles/tema.css continuam valendo —
  //    nada muda visualmente.
  useEffect(() => {
    aplicarVariaveisTema(gerarVariaveisTema(tenant?.tema));
  }, [tenant?.tema]);

  // ── Jarvas: análise pós-carregamento (fire-and-forget; motor só
  //    roda para gerente/admin e tem throttle interno de 6h) ──────
  useEffect(() => {
    if (loading || !currentUser) return;
    void executarAnaliseJarvas({ products, estoque, estoqueMinimos, sales, fechamentos, currentUser });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, currentUser?.id]);

  // ── Realtime: pedidos pendentes (palm ↔ caixa) ───────────────
  useEffect(() => {
    const channel = supabase
      .channel("pending-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pending" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setPendingLocal(prev =>
            prev.find(p => p.id === payload.new.id) ? prev : [payload.new, ...prev]
          );
        } else if (payload.eventType === "UPDATE") {
          setPendingLocal(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
        } else if (payload.eventType === "DELETE") {
          setPendingLocal(prev => prev.filter(p => p.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Realtime: estoque (sincroniza saldo/mínimo entre dispositivos) ──
  // Requer Realtime habilitado na tabela `estoque` (Database → Replication).
  useEffect(() => {
    const channel = supabase
      .channel("estoque-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "estoque" }, (payload) => {
        const produtoId = payload.new?.produto_id ?? payload.old?.produto_id;
        if (payload.eventType === "DELETE") {
          setEstoqueLocal(prev => { const { [produtoId]: _omit, ...rest } = prev; return rest; });
          setEstoqueMinimosLocal(prev => { const { [produtoId]: _omit, ...rest } = prev; return rest; });
          return;
        }
        setEstoqueLocal(prev => ({ ...prev, [produtoId]: Number(payload.new.quantidade) }));
        setEstoqueMinimosLocal(prev => ({ ...prev, [produtoId]: Number(payload.new.minimo) }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Actions: Auth ─────────────────────────────────────────────
  const login = async (username, password) => {
    const clean = sanitizeInput(username);
    const att   = getAttempts(clean);

    if (att.lockedUntil && att.lockedUntil > Date.now()) {
      const secs = Math.ceil((att.lockedUntil - Date.now()) / 1000);
      return { error: `Conta bloqueada. Aguarde ${secs}s.` };
    }

    // Supabase Auth valida a senha no servidor — sem hash no cliente
    const email = `${clean}@gastromundi.local`;
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: sanitizeInput(password, 100),
    });

    if (authError) {
      const count       = (att.count || 0) + 1;
      const lockedUntil = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
      setAttempts(clean, { count, lockedUntil });
      if (lockedUntil) return { error: "Muitas tentativas. Bloqueado por 2 minutos." };
      return { error: `Usuário ou senha incorretos. ${MAX_ATTEMPTS - count} tentativa(s) restante(s).` };
    }

    const userData = await buscarDadosUsuario(authData.user.id);
    if (!userData) {
      await supabase.auth.signOut();
      return { error: "Usuário não encontrado ou inativo." };
    }

    clearAttempts(clean);
    setCurrentUser(userData);
    saveSession(userData);
    logAction(userData.username, "auth:login", { msg: `Login realizado · ${userData.role}`, name: userData.name, role: userData.role });
    await bootstrap();
    return { ok: true };
  };

  const logout = async () => {
    if (currentUser) logAction(currentUser.username, "auth:logout", { msg: "Sessão encerrada", name: currentUser.name, role: currentUser.role });
    setCurrentUser(null);
    setMobileChoice(null);
    clearSession();
    await supabase.auth.signOut();
  };

  // ── Actions: Pending ──────────────────────────────────────────
  const addPending = async (order) => {
    setPendingLocal(prev => [order, ...prev]);
    const { id, comanda, mesa, apelido, items, status, note, total, garcom, created_by } = order;
    await supabase.from("pending").insert({ id, comanda, mesa, apelido, items, status, note, total, garcom, created_by });
    emitirEvento("pedido.aberto", "pedidos", { pedido_id: id, comanda, mesa: mesa ?? null, total: total ?? null, garcom: garcom ?? null }, created_by ?? currentUser?.username);
  };

  const removePending = async (id) => {
    setPendingLocal(prev => prev.filter(o => o.id !== id));
    const { error } = await supabase.from("pending").delete().eq("id", id);
    if (error) console.error("removePending error:", JSON.stringify(error, null, 2));
  };

  const updatePending = async (id, changes) => {
    setPendingLocal(prev => prev.map(o => o.id === id ? { ...o, ...changes } : o));
    await supabase.from("pending").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id);
  };

  // ── Actions: Products ─────────────────────────────────────────
  const addProduct = async (product) => {
    // omite o id gerado pelo app — o banco gera o uuid via default
    const { id: _ignored, ...payload } = product;
    const { data, error } = await supabase.from("products").insert(payload).select().single();
    if (data) setProductsLocal(prev => [...prev, data]);
    return { data, error };
  };

  const updateProduct = async (id, changes) => {
    const { error } = await supabase.from("products").update(changes).eq("id", id);
    if (!error) setProductsLocal(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
    return { error };
  };

  const removeProduct = async (id) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (!error) setProductsLocal(prev => prev.filter(p => p.id !== id));
    return { error };
  };

  // ── Actions: Sales ────────────────────────────────────────────
  const addSale = async (sale) => {
    setSalesLocal(prev => [sale, ...prev]);
    const { error } = await supabase.from("sales").insert({ id: sale.id, data: sale });
    if (error) {
      console.error("addSale error:", JSON.stringify(error, null, 2));
      throw error;
    }
    emitirEvento("venda.finalizada", "pdv", {
      venda_id: sale.id,
      total: sale.total ?? null,
      metodo: sale.metodo ?? sale.payment ?? null,
      itens: Array.isArray(sale.items) ? sale.items.length : null,
    }, currentUser?.username);

    // TD009 (etapa 1) — gravação dupla nas tabelas relacionais novas.
    // sales continua a fonte de verdade: falha aqui nunca pode quebrar a venda.
    void (async () => {
      try {
        const { venda, itens, pagamentos } = mapearVendaParaLinhas(sale);
        await supabase.from("vendas").insert(venda);
        if (itens.length > 0) await supabase.from("venda_itens").insert(itens);
        if (pagamentos.length > 0) await supabase.from("venda_pagamentos").insert(pagamentos);
      } catch (err) {
        console.error("dual-write vendas:", err);
      }
    })();
  };

  // ── Actions: Users ────────────────────────────────────────────
  const addUser = async (user) => {
    // omite id (gerado pelo banco) e permissions (derivado do role no cliente)
    const { id: _ignored, permissions: _perms, ...payload } = user;
    const { data, error } = await supabase.from("users").insert(payload).select().single();
    if (data) setUsersLocal(prev => [...prev, {
      ...data,
      permissions: { ...getPermissions(data.role), ...(data.permissions || {}) },
    }]);
    return { data, error };
  };

  const updateUser = async (id, changes) => {
    // permissions não existe no banco — remove antes de enviar
    const { permissions: _perms, ...payload } = changes;
    const { error } = await supabase.from("users").update(payload).eq("id", id);
    if (!error) setUsersLocal(prev => prev.map(u => {
      if (u.id !== id) return u;
      const merged = { ...u, ...changes };
      return {
        ...merged,
        permissions: { ...getPermissions(merged.role), ...(merged.permissions || {}) },
      };
    }));
    return { error };
  };

  const removeUser = async (id) => {
    const { error } = await supabase.from("users").delete().eq("id", id);
    if (!error) setUsersLocal(prev => prev.filter(u => u.id !== id));
    return { error };
  };

  // ── Actions: Fechamentos ──────────────────────────────────────
  const addFechamento = async (f) => {
    setFechamentosLocal(prev => [f, ...prev]);
    await supabase.from("fechamentos").insert({ data: f });
    emitirEvento("caixa.fechado", "caixa", {
      total_vendas: f?.totalVendas ?? null,
      total_conferido: f?.totalConferido ?? null,
    }, currentUser?.username);
  };

  // ── Actions: Estoque ──────────────────────────────────────────
  const updateEstoque = async (productId, qty) => {
    const novaQtd = Math.max(0, qty);
    setEstoqueLocal(prev => ({ ...prev, [productId]: novaQtd }));
    await supabase.from("estoque").upsert(
      { produto_id: productId, quantidade: novaQtd, updated_at: new Date().toISOString() },
      { onConflict: "produto_id" },
    );
    emitirEvento("estoque.ajustado", "estoque", { produto_id: productId, quantidade: novaQtd }, currentUser?.username);
  };

  // Atualiza múltiplos produtos de uma vez (evita race condition em imports em lote)
  const bulkSetEstoque = async (newEstoque) => {
    setEstoqueLocal(newEstoque);
    const rows = Object.entries(newEstoque ?? {}).map(([produto_id, quantidade]) => ({
      produto_id,
      quantidade: Math.max(0, Number(quantidade) || 0),
      updated_at: new Date().toISOString(),
    }));
    if (rows.length > 0) {
      await supabase.from("estoque").upsert(rows, { onConflict: "produto_id" });
    }
    emitirEvento("estoque.ajuste_em_lote", "estoque", { itens: Object.keys(newEstoque ?? {}).length }, currentUser?.username);
  };

  // Baixa atômica no servidor (evita race condition entre dispositivos descontando ao mesmo tempo).
  // Decisão de alerta de mínimo delegada a processarBaixaEstoque (src/lib/estoque.js) — testável isoladamente.
  const baixarEstoque = async (productId, qty) => {
    const anterior = Number(estoque[productId] ?? 0);
    setEstoqueLocal(prev => ({ ...prev, [productId]: Math.max(0, anterior - qty) })); // otimista

    const produto = products.find(p => String(p.id) === String(productId));
    const { quantidade, error } = await processarBaixaEstoque({
      produtoId: productId,
      qty,
      quantidadeAnterior: anterior,
      nomeProduto: produto?.name ?? `Produto ${productId}`,
      minimoFallback: estoqueMinimos[productId] ?? 10,
      usuario: currentUser?.username,
      chamarRpc: (id, q) => supabase.rpc("baixar_estoque", { p_produto_id: id, p_qtd: q }),
    });
    if (error) return;

    setEstoqueLocal(prev => ({ ...prev, [productId]: quantidade }));
    emitirEvento("estoque.baixa", "estoque", { produto_id: productId, quantidade: qty }, currentUser?.username);
  };

  const setMinimoEstoque = async (productId, minimo) => {
    const novoMinimo = Math.max(0, Number(minimo) || 0);
    setEstoqueMinimosLocal(prev => ({ ...prev, [productId]: novoMinimo }));
    await supabase.from("estoque").upsert(
      { produto_id: productId, minimo: novoMinimo, updated_at: new Date().toISOString() },
      { onConflict: "produto_id" },
    );
  };

  const setFundoAtual = async (val) => {
    setFundoAtualLocal(val);
    await supabase.from("config").upsert({ key: "fundo_atual", value: val });
  };

  const setCaixaAberto = async (val) => {
    setCaixaAbertoLocal(val);
    await supabase.from("config").upsert({ key: "caixa_aberto", value: val });
    if (val) emitirEvento("caixa.aberto", "caixa", {}, currentUser?.username);
  };

  const setSessaoAbertaEm = async (val) => {
    setSessaoAbertaEmLocal(val);
    await supabase.from("config").upsert({ key: "sessao_aberta_em", value: val });
  };

  const setMeiosPagamento = async (val) => {
    setMeiosPagamentoLocal(val);
    await supabase.from("config").upsert({ key: "meios_pagamento", value: val });
  };

  const setMetodosCustom = async (val) => {
    setMetodosCustomLocal(val);
    await supabase.from("config").upsert({ key: "metodos_custom", value: val });
  };

  const setTaxaServico = async (val) => {
    setTaxaServicoLocal(!!val);
    await supabase.from("config").upsert({ key: "taxa_servico", value: !!val });
  };

  // ── Context value ─────────────────────────────────────────────
  const addLancada = (id) => setLancadas(prev => new Set([...prev, id]));

  // Fase 2 — camada de comercialização (ADR-005): única fonte de gating por
  // plano no front. Sidebar/rotas/telas novas devem checar por aqui, nunca
  // comparar tenant.planoCodigo diretamente.
  const moduloHabilitadoNoPlano = (modulo) => moduloHabilitado(tenant?.modulosDisponiveis, modulo);
  // Fase 3 — add-ons pagos (decisão 019): equivalente para NF-e/TEF, que não
  // dependem de plano. Hooks de add-on devem checar por aqui, nunca ler
  // tenant.addonsAtivos diretamente.
  const addonHabilitadoNoTenant = (addon) => addonHabilitado(tenant?.addonsAtivos, addon);

  const value = {
    loading,
    // dados
    products, pending, sales, users, fechamentos, fundoAtual, caixaAberto, sessaoAbertaEm, meiosPagamento, estoque, estoqueMinimos,
    tenant, moduloHabilitado: moduloHabilitadoNoPlano, addonHabilitado: addonHabilitadoNoTenant,
    // Fase 4 — camada de comercialização (ADR-006): status calculado, só
    // exibição nesta fase — nenhuma escrita é bloqueada por causa disso.
    assinatura: tenant?.assinatura ?? null,
    currentUser, isMobile, mobileChoice,
    lancadas, addLancada,
    // setter simples (sem persistência)
    setMobileChoice,
    // auth
    login, logout,
    // pending
    addPending, removePending, updatePending,
    // products
    addProduct, updateProduct, removeProduct,
    // sales
    addSale,
    // users
    addUser, updateUser, removeUser,
    // outros
    addFechamento,
    setFundoAtual, setCaixaAberto, setSessaoAbertaEm, setMeiosPagamento, updateEstoque, bulkSetEstoque, baixarEstoque, setMinimoEstoque,
    taxaServico, setTaxaServico,
    metodosCustom, setMetodosCustom,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp deve ser usado dentro de <AppProvider>");
  return ctx;
};
