import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getPermissions } from "@/constants/roles";
import { useIsMobile, useIdleTimer } from "@/utils/hooks";
import { supabase } from "@/lib/supabase";
import { logAction } from "@/lib/logger";
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
  const [credentials,     setCredentialsLocal]   = useState({});
  const [estoque,       setEstoqueLocal]     = useState({});
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

  // ── Fetch inicial do Supabase (só roda autenticado) ───────────
  async function bootstrap() {
      const [
        { data: productsData, error: eProducts },
        { data: pendingData,  error: ePending  },
        { data: salesData,    error: eSales    },
        { data: usersData,    error: eUsers    },
        { data: fechamentosData, error: eFech  },
        { data: configData,   error: eConfig   },
      ] = await Promise.all([
        supabase.from("products").select("*").eq("active", true).order("id"),
        supabase.from("pending").select("*").order("created_at", { ascending: false }),
        supabase.from("sales").select("id,data,created_at").order("created_at", { ascending: false }),
        supabase.from("users").select("id,name,username,role,auth_id,active").eq("active", true),
        supabase.from("fechamentos").select("id,data,created_at").order("created_at", { ascending: false }),
        supabase.from("config").select("key,value").in("key", ["fundo_atual","caixa_aberto","credentials","estoque","sessao_aberta_em","meios_pagamento","taxa_servico","metodos_custom"]),
      ]);

      if (eUsers)    console.error("[bootstrap] users error:", eUsers);
      if (eProducts) console.error("[bootstrap] products error:", eProducts);
      if (ePending)  console.error("[bootstrap] pending error:", ePending);
      if (eSales)    console.error("[bootstrap] sales error:", eSales);
      if (eFech)     console.error("[bootstrap] fechamentos error:", eFech);
      if (eConfig)   console.error("[bootstrap] config error:", eConfig);

      if (productsData?.length)    setProductsLocal(productsData);
      if (pendingData)             setPendingLocal(pendingData);
      if (salesData)               setSalesLocal(salesData.map(r => r.data));
      if (usersData?.length)       setUsersLocal(usersData.map(u => ({
        ...u,
        permissions: getPermissions(u.role),
      })));
      if (fechamentosData)         setFechamentosLocal(fechamentosData.map(r => r.data));

      if (configData) {
        const fundo  = configData.find(c => c.key === "fundo_atual");
        const caixa  = configData.find(c => c.key === "caixa_aberto");
        const creds   = configData.find(c => c.key === "credentials");
        const estq    = configData.find(c => c.key === "estoque");
        const sessao = configData.find(c => c.key === "sessao_aberta_em");
        if (fundo)   setFundoAtualLocal(Number(fundo.value));
        if (caixa)   setCaixaAbertoLocal(caixa.value === true || caixa.value === "true");
        if (sessao?.value) setSessaoAbertaEmLocal(sessao.value);
        if (creds)   setCredentialsLocal(typeof creds.value === "object" ? creds.value : {});
        if (estq)    setEstoqueLocal(typeof estq.value === "object" ? estq.value : {});
        const meios = configData.find(c => c.key === "meios_pagamento");
        if (meios?.value && Array.isArray(meios.value) && meios.value.length > 0) setMeiosPagamentoLocal(meios.value);
        const taxa = configData.find(c => c.key === "taxa_servico");
        if (taxa?.value !== undefined) setTaxaServicoLocal(!!taxa.value);
        const custom = configData.find(c => c.key === "metodos_custom");
        if (custom?.value && Array.isArray(custom.value)) setMetodosCustomLocal(custom.value);
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
    const { id, comanda, items, status, note, total, garcom, created_by } = order;
    await supabase.from("pending").insert({ id, comanda, items, status, note, total, garcom, created_by });
  };

  const removePending = async (id) => {
    setPendingLocal(prev => prev.filter(o => o.id !== id));
    await supabase.from("pending").delete().eq("id", id);
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
    await supabase.from("sales").insert({ id: sale.id, data: sale });
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
  };

  // ── Config: Caixa ─────────────────────────────────────────────
  const updateEstoque = async (productId, qty) => {
    const updated = { ...estoque, [productId]: Math.max(0, qty) };
    setEstoqueLocal(updated);
    await supabase.from("config").upsert({ key: "estoque", value: updated });
  };

  // Atualiza múltiplos produtos de uma vez (evita race condition em imports em lote)
  const bulkSetEstoque = async (newEstoque) => {
    setEstoqueLocal(newEstoque);
    await supabase.from("config").upsert({ key: "estoque", value: newEstoque });
  };

  // AVISO: credentials armazena senhas legíveis para fins de recuperação
  // administrativa. Não armazena a senha de autenticação SHA-256.
  // Acesso restrito a role admin/gerente via permissão "configuracoes".
  const saveCredential = async (username, plainPassword) => {
    if (!plainPassword) return;
    const updated = { ...credentials, [username]: plainPassword };
    setCredentialsLocal(updated);
    await supabase.from("config").upsert({ key: "credentials", value: updated });
  };

  const setFundoAtual = async (val) => {
    setFundoAtualLocal(val);
    await supabase.from("config").upsert({ key: "fundo_atual", value: val });
  };

  const setCaixaAberto = async (val) => {
    setCaixaAbertoLocal(val);
    await supabase.from("config").upsert({ key: "caixa_aberto", value: val });
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

  const value = {
    loading,
    // dados
    products, pending, sales, users, fechamentos, fundoAtual, caixaAberto, sessaoAbertaEm, meiosPagamento, credentials, estoque,
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
    setFundoAtual, setCaixaAberto, setSessaoAbertaEm, setMeiosPagamento, saveCredential, updateEstoque, bulkSetEstoque,
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
