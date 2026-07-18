import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { getPermissions } from "@/constants/roles";
import { useIsMobile, useIdleTimer } from "@/utils/hooks";
import { supabase } from "@/lib/supabase";
import { buscarBootstrapTenant, moduloHabilitado, addonHabilitado } from "@/lib/tenant";
import { emailDoLogin } from "@/lib/tenantSlug";
import { sincronizarStatusAssinatura } from "@/lib/assinatura";
import { gerarVariaveisTema, aplicarVariaveisTema, aplicarTituloDocumento, nomeExibicaoTenant } from "@/lib/tema";
import { logAction } from "@/lib/logger";
import { emitirEvento } from "@/lib/jarvas";
import { executarAnaliseJarvas } from "@/lib/jarvasEngine";
import { montarVendaLegada, persistirVendaNormalizada } from "@/lib/vendas";
import { criarLancamento } from "@/lib/financeiro";
import { METODOS_TEF_PADRAO } from "@/lib/tef";
import { processarBaixaEstoque } from "@/lib/estoque";
import { garantirUidItens, mesclarItensComanda, totalItensAtivos } from "@/lib/comandaItens";
import { LOCK_TTL_MS } from "@/lib/comandaLock";
import { sanitizeInput } from "@/utils/crypto";
import { isErroDeRede } from "@/lib/offline/rede";
import { criarFila, drenarFila } from "@/lib/offline/fila";
import { salvarSnapshot, lerSnapshot } from "@/lib/offline/snapshot";
import { useStatusRede } from "@/hooks/useStatusRede";
import IndicadorRede from "@/components/shared/IndicadorRede";
import PonteLocalBridge from "@/components/shared/PonteLocalBridge";
import {
  saveSession, loadSession, clearSession,
  getAttempts, setAttempts, clearAttempts,
  IDLE_MS, MAX_ATTEMPTS, LOCKOUT_MS,
} from "@/utils/session";

const AppContext = createContext(null);

// Fila local de operações offline (Leva 11) — singleton de módulo sobre
// localStorage: sobrevive a reload/fechamento do app e é compartilhada
// por todas as instâncias do provider (só existe uma no app real).
const filaOffline = criarFila({ storage: window.localStorage });

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
  const [metodosTef,      setMetodosTefLocal]     = useState(METODOS_TEF_PADRAO); // quais métodos usam maquininha (TEF)
  const [taxaServico,     setTaxaServicoLocal]    = useState(false);
  const [diasAlertaValidade, setDiasAlertaValidadeLocal] = useState(7); // C1 — janela de alerta de validade
  const [estoque,         setEstoqueLocal]        = useState({});
  const [estoqueMinimos,  setEstoqueMinimosLocal] = useState({});
  const [tenant,          setTenantLocal]         = useState(null); // Fase 1 — camada de comercialização (ADR-005)
  const [gruposCategoria, setGruposCategoriaLocal] = useState([]); // C3 — grupos (comida/bebida/cafe)
  const [categoriaGrupos, setCategoriaGruposLocal] = useState([]); // C3 — mapa categoria→grupo_id (linhas cruas)
  const [loading,       setLoading]          = useState(true);
  // IDs de comandas com pedido lançado na sessão atual (sobrevive troca de aba)
  const [lancadas,    setLancadas]         = useState(new Set());

  // ── Offline-first (Leva 11) ──────────────────────────────────
  const redeOnline = useStatusRede();
  const [pendenciasOffline, setPendenciasOffline] = useState(() => filaOffline.tamanho());
  const drenandoRef = useRef(false);
  // Leva 13 — endereço da página do Palm servida pela Ponte KORA
  // (http://IP:porta/palm?t=token). Persistido em config para o Palm
  // saber para onde ir quando a internet cair.
  const [ponteEndereco, setPonteEnderecoLocal] = useState(null);

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
        } else if (loadSession() && typeof navigator !== "undefined" && navigator.onLine === false) {
          // Sem internet a busca do usuário falha mesmo com sessão válida.
          // A sessão local basta para operar: o bootstrap hidrata do
          // snapshot e o app segue offline em vez de travar no login.
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

  // Leva 14 — trava de edição: fica true quando as colunas da trava ainda
  // não existem no banco (migration 20260747 não aplicada). Aí a trava
  // desliga por inteiro (fail-open) e o app opera como antes (merge da
  // Leva 2 continua sendo a rede de segurança contra escrita concorrente).
  const lockIndisponivelRef = useRef(false);

  // Colunas base de pending (nunca select * em tabela sensível — CLAUDE.md).
  const COLUNAS_PENDING = "id,comanda,items,status,note,total,garcom,created_by,created_at,updated_at,mesa,apelido,status_cozinha,em_preparo_em,pronto_em";
  const COLUNAS_TRAVA = "editando_por,editando_nome,editando_desde";

  // Busca pending tentando incluir as colunas da trava; se o banco ainda não
  // tem a migration 20260747 (erro 42703 = coluna inexistente), marca a trava
  // como indisponível e repete só com as colunas antigas — o bootstrap
  // inteiro não pode quebrar por causa de uma feature opcional.
  async function buscarPendingData() {
    const res = await supabase.from("pending")
      .select(`${COLUNAS_PENDING},${COLUNAS_TRAVA}`)
      .order("created_at", { ascending: false });
    if (res.error?.code === "42703") {
      lockIndisponivelRef.current = true;
      return supabase.from("pending")
        .select(COLUNAS_PENDING)
        .order("created_at", { ascending: false });
    }
    return res;
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
        { data: gruposData,   error: eGrupos   },
        { data: catGrupoData, error: eCatGrupo },
      ] = await Promise.all([
        supabase.from("products").select("*").eq("active", true).order("id"),
        buscarPendingData(),
        // Bootstrap limitado a 90 dias — relatórios de período maior devem consultar sob demanda.
        buscarSalesData(),
        supabase.from("users").select("id,name,username,role,auth_id,active").eq("active", true),
        supabase.from("fechamentos").select("id,data,created_at").order("created_at", { ascending: false }),
        supabase.from("config").select("key,value").in("key", ["fundo_atual","caixa_aberto","sessao_aberta_em","meios_pagamento","taxa_servico","metodos_custom","metodos_tef","dias_alerta_validade","ponte_endereco"]),
        supabase.from("estoque").select("produto_id,quantidade,minimo"),
        // Fases 1-2 — camada de comercialização (ADR-005): nunca lança, então nunca bloqueia o resto do bootstrap.
        buscarBootstrapTenant(),
        // C3 — grupos de categoria (Radar de Oportunidades no Palm)
        supabase.from("grupos_categoria").select("id,nome").order("id"),
        supabase.from("categoria_grupo").select("category,grupo_id"),
      ]);

      if (eUsers)    console.error("[bootstrap] users error:", eUsers);
      if (eProducts) console.error("[bootstrap] products error:", eProducts);
      if (ePending)  console.error("[bootstrap] pending error:", ePending);
      if (eFech)     console.error("[bootstrap] fechamentos error:", eFech);
      if (eConfig)   console.error("[bootstrap] config error:", eConfig);
      if (eEstoque)  console.error("[bootstrap] estoque error:", eEstoque);
      if (eTenant)   console.error("[bootstrap] tenant error:", eTenant);
      if (eGrupos)   console.error("[bootstrap] grupos_categoria error:", eGrupos);
      if (eCatGrupo) console.error("[bootstrap] categoria_grupo error:", eCatGrupo);

      // ── Offline (Leva 11): sem internet, hidrata do último snapshot ──
      // e deixa o PDV operar; os pedidos entram na fila local.
      if (isErroDeRede(eProducts) || isErroDeRede(ePending)) {
        const snapshot = lerSnapshot(window.localStorage);
        if (snapshot) {
          if (snapshot.products?.length) setProductsLocal(snapshot.products);
          if (snapshot.pending)          setPendingLocal(snapshot.pending);
          if (snapshot.estoque)          setEstoqueLocal(snapshot.estoque);
          if (snapshot.estoqueMinimos)   setEstoqueMinimosLocal(snapshot.estoqueMinimos);
          const config = snapshot.config ?? {};
          if (config.caixaAberto !== undefined) setCaixaAbertoLocal(!!config.caixaAberto);
          if (config.sessaoAbertaEm)            setSessaoAbertaEmLocal(config.sessaoAbertaEm);
          if (config.fundoAtual !== undefined)  setFundoAtualLocal(Number(config.fundoAtual));
          if (Array.isArray(config.meiosPagamento) && config.meiosPagamento.length) setMeiosPagamentoLocal(config.meiosPagamento);
          if (Array.isArray(config.metodosCustom)) setMetodosCustomLocal(config.metodosCustom);
          if (Array.isArray(config.metodosTef))    setMetodosTefLocal(config.metodosTef);
          if (config.taxaServico !== undefined) setTaxaServicoLocal(!!config.taxaServico);
          if (typeof config.ponteEndereco === "string" && config.ponteEndereco) setPonteEnderecoLocal(config.ponteEndereco);
        }
        setLoading(false);
        return;
      }

      if (gruposData)   setGruposCategoriaLocal(gruposData);
      if (catGrupoData) setCategoriaGruposLocal(catGrupoData);

      if (productsData?.length)    setProductsLocal(productsData);
      if (pendingData)             setPendingLocal(pendingData);
      if (salesData)               setSalesLocal(salesData);
      if (usersData?.length)       setUsersLocal(usersData.map(u => ({
        ...u,
        permissions: getPermissions(u.role),
      })));
      if (fechamentosData)         setFechamentosLocal(fechamentosData.map(r => r.data));

      const qtds = {}, minimos = {};
      if (estoqueData) {
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
        // Array (mesmo vazio) = escolha explícita do estabelecimento;
        // sem config vale METODOS_TEF_PADRAO (crédito/débito).
        const tef = configData.find(c => c.key === "metodos_tef");
        if (Array.isArray(tef?.value)) setMetodosTefLocal(tef.value);
        const diasValidade = configData.find(c => c.key === "dias_alerta_validade");
        if (diasValidade?.value != null && !isNaN(Number(diasValidade.value))) setDiasAlertaValidadeLocal(Number(diasValidade.value));
        // Leva 13 — endereço do Palm na ponte local (salvo pela bridge)
        const ponte = configData.find(c => c.key === "ponte_endereco");
        if (typeof ponte?.value === "string" && ponte.value) setPonteEnderecoLocal(ponte.value);
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

      // Snapshot para a próxima abertura sem internet (Leva 11). Só o
      // essencial para operar o PDV — vendas/usuários seguem online-only.
      if (productsData || pendingData) {
        const configMap = Object.fromEntries((configData ?? []).map(c => [c.key, c.value]));
        salvarSnapshot(window.localStorage, {
          products: productsData ?? [],
          pending: pendingData ?? [],
          estoque: qtds,
          estoqueMinimos: minimos,
          config: {
            caixaAberto: configMap.caixa_aberto === true || configMap.caixa_aberto === "true",
            sessaoAbertaEm: configMap.sessao_aberta_em ?? null,
            fundoAtual: configMap.fundo_atual !== undefined ? Number(configMap.fundo_atual) : undefined,
            meiosPagamento: Array.isArray(configMap.meios_pagamento) ? configMap.meios_pagamento : undefined,
            metodosCustom: Array.isArray(configMap.metodos_custom) ? configMap.metodos_custom : undefined,
            metodosTef: Array.isArray(configMap.metodos_tef) ? configMap.metodos_tef : undefined,
            taxaServico: configMap.taxa_servico !== undefined ? !!configMap.taxa_servico : undefined,
            ponteEndereco: typeof configMap.ponte_endereco === "string" ? configMap.ponte_endereco : undefined,
          },
        });
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
    // Aba do navegador com a marca do tenant (white-label). Só quando o
    // tenant é conhecido — antes disso o <title> estático/LoginPage valem.
    if (tenant) aplicarTituloDocumento(nomeExibicaoTenant(tenant.tema, tenant.nome));
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

  // ── Offline-first (Leva 11): reenvio da fila local ───────────
  // Replay de uma operação guardada. Insert vira UPSERT por id: se a
  // primeira tentativa gravou mas a resposta se perdeu na queda de rede,
  // reenviar não duplica nem estoura chave única.
  const executarOpOffline = (op) => {
    if (op.tipo === "insert") return supabase.from("pending").upsert(op.payload, { onConflict: "id" });
    if (op.tipo === "update") return supabase.from("pending").update(op.changes).eq("id", op.id);
    if (op.tipo === "delete") return supabase.from("pending").delete().eq("id", op.id);
    // Cobrança offline (não-TEF): venda fechada sem internet. Upsert por id
    // — se a primeira tentativa gravou mas a resposta se perdeu, reenviar
    // não duplica. Evento + gravação dupla só acontecem aqui, no reenvio
    // que confirmou (addSale offline pula os dois de propósito).
    if (op.tipo === "insert_venda") return reenviarVendaOffline(op);
    if (op.tipo === "rpc_baixar_estoque") {
      return supabase.rpc("baixar_estoque", { p_produto_id: op.produtoId, p_qtd: op.qtd });
    }
    if (op.tipo === "insert_lancamento") return criarLancamento(op.dados, op.usuario);
    return Promise.resolve({ error: null }); // tipo desconhecido — descarta
  };

  const reenviarVendaOffline = async (op) => {
    const sale = op.payload.data;
    const { error } = await supabase.from("sales").upsert({ id: op.payload.id, data: sale }, { onConflict: "id" });
    if (error) return { error };
    emitirEvento("venda.finalizada", "pdv", {
      venda_id: sale.id,
      total: sale.total ?? null,
      metodo: sale.metodo ?? sale.payment ?? null,
      itens: Array.isArray(sale.items) ? sale.items.length : null,
    }, currentUser?.username);
    void persistirVendaNormalizada(supabase, sale, {
      onFalha: ({ etapa, error: e, venda_id }) => {
        console.error(`dual-write vendas (${etapa}) venda ${venda_id}:`, e);
        emitirEvento("venda.dualwrite.falhou", "pdv", {
          venda_id,
          etapa,
          erro: e?.message ?? e?.code ?? String(e),
        }, currentUser?.username);
      },
    });
    return { error: null };
  };

  // Enfileira uma operação para reenvio quando a internet voltar e
  // atualiza o contador do badge — único caminho para fora do provider.
  const enfileirarOffline = (op) => setPendenciasOffline(filaOffline.enfileirar(op));

  const drenarPendenciasOffline = async () => {
    if (drenandoRef.current || filaOffline.tamanho() === 0) return;
    drenandoRef.current = true;
    try {
      const { falhas } = await drenarFila({ fila: filaOffline, executar: executarOpOffline, isErroDeRede });
      for (const { op, error } of falhas) {
        console.error("[offline] operação descartada no reenvio:", op.tipo, error?.message);
      }
    } finally {
      drenandoRef.current = false;
      setPendenciasOffline(filaOffline.tamanho());
    }
  };

  useEffect(() => {
    if (redeOnline && !loading) drenarPendenciasOffline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redeOnline, loading, pendenciasOffline]);

  // ── Actions: Auth ─────────────────────────────────────────────
  const login = async (username, password) => {
    const clean = sanitizeInput(username);
    const att   = getAttempts(clean);

    if (att.lockedUntil && att.lockedUntil > Date.now()) {
      const secs = Math.ceil((att.lockedUntil - Date.now()) / 1000);
      return { error: `Conta bloqueada. Aguarde ${secs}s.` };
    }

    // Supabase Auth valida a senha no servidor — sem hash no cliente.
    // E-mail com namespace por tenant (slug do subdomínio) para permitir o
    // mesmo username em tenants diferentes. Fallback 'gastromundi' quando
    // não há subdomínio (dev/preview/domínio nu) — inerte por design.
    const email = emailDoLogin(clean);
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
  // O supabase-js NÃO lança em erro de RLS/constraint — resolve com
  // { error }. Toda escrita aqui checa o .error, desfaz o estado
  // otimista quando a gravação falha e devolve { error } para o
  // chamador mostrar feedback — senão a UI finge sucesso enquanto o
  // banco ficou para trás (pedido do garçom some, cobrança dupla).
  const addPending = async (order) => {
    // uid estável por item — base da reconciliação multi-dispositivo
    // (Palm × PDV) feita no updatePending.
    order = { ...order, items: garantirUidItens(order.items) };
    setPendingLocal(prev => [order, ...prev]);
    const { id, comanda, mesa, apelido, items, status, note, total, garcom, created_by } = order;
    const { error } = await supabase.from("pending").insert({ id, comanda, mesa, apelido, items, status, note, total, garcom, created_by });
    if (error) {
      // Sem internet o pedido NÃO some (Leva 11): mantém o estado
      // otimista, guarda na fila local e reenvia quando a rede voltar.
      if (isErroDeRede(error)) {
        setPendenciasOffline(filaOffline.enfileirar({ tipo: "insert", payload: { id, comanda, mesa, apelido, items, status, note, total, garcom, created_by } }));
        return { error: null, offline: true };
      }
      console.error("addPending error:", error);
      setPendingLocal(prev => prev.filter(o => o.id !== id));
      return { error };
    }
    emitirEvento("pedido.aberto", "pedidos", { pedido_id: id, comanda, mesa: mesa ?? null, total: total ?? null, garcom: garcom ?? null }, created_by ?? currentUser?.username);
    return { error: null };
  };

  const removePending = async (id) => {
    let removida = null;
    setPendingLocal(prev => {
      removida = prev.find(o => o.id === id) ?? removida;
      return prev.filter(o => o.id !== id);
    });
    const { error } = await supabase.from("pending").delete().eq("id", id);
    if (error) {
      if (isErroDeRede(error)) {
        setPendenciasOffline(filaOffline.enfileirar({ tipo: "delete", id }));
        return { error: null, offline: true };
      }
      console.error("removePending error:", error);
      // Restaura a comanda: ela continua existindo no banco.
      if (removida) setPendingLocal(prev => prev.some(o => o.id === id) ? prev : [removida, ...prev]);
      return { error };
    }
    return { error: null };
  };

  // `baseItems` = snapshot de onde o chamador derivou `changes.items`.
  // Com ele, itens lançados por outro dispositivo (Palm) entre o snapshot
  // e a gravação são preservados em vez de sobrescritos ("última escrita
  // vence" fazia itens sumirem da conta). A janela de corrida residual
  // (leitura→gravação não é atômica) fica registrada como dívida técnica —
  // a solução definitiva é um RPC de append em jsonb no Postgres.
  const updatePending = async (id, changes, { baseItems } = {}) => {
    if (Array.isArray(changes.items)) {
      changes = { ...changes, items: garantirUidItens(changes.items) };
      if (Array.isArray(baseItems)) {
        const { data: atual, error: erroLeitura } = await supabase
          .from("pending").select("items").eq("id", id).maybeSingle();
        if (!erroLeitura && atual) {
          const { items, houveMescla } = mesclarItensComanda({ base: baseItems, propostos: changes.items, banco: atual.items });
          if (houveMescla) {
            changes = { ...changes, items };
            if ("total" in changes) changes.total = totalItensAtivos(items);
          }
        }
      }
    }
    let anterior = null;
    setPendingLocal(prev => prev.map(o => {
      if (o.id !== id) return o;
      anterior = o;
      return { ...o, ...changes };
    }));
    const { error } = await supabase.from("pending").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      if (isErroDeRede(error)) {
        setPendenciasOffline(filaOffline.enfileirar({ tipo: "update", id, changes: { ...changes, updated_at: new Date().toISOString() } }));
        return { error: null, offline: true };
      }
      console.error("updatePending error:", error);
      if (anterior) setPendingLocal(prev => prev.map(o => o.id === id ? anterior : o));
      return { error };
    }
    return { error: null };
  };

  // ── Trava de edição de comanda (Leva 14) ─────────────────────
  // Enquanto uma pessoa está com a comanda aberta, outra não mexe.
  // Adquirir = UPDATE condicional: só grava se a trava está livre, é minha,
  // ou expirou (TTL). Quem chegar primeiro leva; o perdedor recebe ok:false
  // com o nome de quem está editando. Tudo fail-open: sem migration (42703)
  // ou sem rede, a trava se desliga e o app opera como antes.
  const adquirirTrava = async (id) => {
    if (lockIndisponivelRef.current || !currentUser?.username) return { ok: true, semTrava: true };
    const agora = new Date();
    const limiteExpirada = new Date(agora.getTime() - LOCK_TTL_MS).toISOString();
    const { data, error } = await supabase.from("pending")
      .update({ editando_por: currentUser.username, editando_nome: currentUser.name ?? currentUser.username, editando_desde: agora.toISOString() })
      .eq("id", id)
      .or(`editando_por.is.null,editando_por.eq.${currentUser.username},editando_desde.lt.${limiteExpirada}`)
      .select("id,editando_por,editando_nome,editando_desde")
      .maybeSingle();
    if (error) {
      if (error.code === "42703") lockIndisponivelRef.current = true;
      // Rede fora ou banco sem migration: não bloqueia ninguém (fail-open).
      return { ok: true, semTrava: true };
    }
    if (!data) {
      // Outra pessoa segura a trava — busca quem, pra UI mostrar o nome.
      const { data: dono } = await supabase.from("pending")
        .select("editando_nome,editando_por,editando_desde").eq("id", id).maybeSingle();
      return { ok: false, nome: dono?.editando_nome || dono?.editando_por || "outra pessoa", desde: dono?.editando_desde ?? null };
    }
    setPendingLocal(prev => prev.map(o => o.id === id ? { ...o, ...data } : o));
    return { ok: true };
  };

  // Renovação (heartbeat): reusa a aquisição — se a minha trava segue
  // valendo, o UPDATE condicional só atualiza o editando_desde.
  const renovarTrava = (id) => adquirirTrava(id);

  const liberarTrava = async (id) => {
    if (lockIndisponivelRef.current || !currentUser?.username) return { error: null };
    setPendingLocal(prev => prev.map(o => (o.id === id && o.editando_por === currentUser.username)
      ? { ...o, editando_por: null, editando_nome: null, editando_desde: null }
      : o));
    const { error } = await supabase.from("pending")
      .update({ editando_por: null, editando_nome: null, editando_desde: null })
      .eq("id", id)
      .eq("editando_por", currentUser.username);
    // Falhou (rede etc.)? Sem drama: a trava expira sozinha pelo TTL.
    return { error: error ?? null };
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

  // Recarrega o cardápio inteiro do banco — usado após operações em lote
  // que gravam fora das actions acima (ex.: importação de planilha).
  const recarregarProdutos = async () => {
    const { data, error } = await supabase
      .from("products").select("*").eq("active", true).order("id");
    if (!error && data) setProductsLocal(data);
    return { error };
  };

  // Recarrega saldos/mínimos do banco — usado após importação em lote
  // (não depende do Realtime estar habilitado na tabela).
  const recarregarEstoque = async () => {
    const { data, error } = await supabase
      .from("estoque").select("produto_id,quantidade,minimo");
    if (!error && data) {
      const qtds = {}, minimos = {};
      for (const row of data) {
        qtds[row.produto_id]    = Number(row.quantidade);
        minimos[row.produto_id] = Number(row.minimo);
      }
      setEstoqueLocal(qtds);
      setEstoqueMinimosLocal(minimos);
    }
    return { error };
  };

  // ── Actions: Sales ────────────────────────────────────────────
  const addSale = async (sale) => {
    setSalesLocal(prev => [sale, ...prev]);
    const { error } = await supabase.from("sales").insert({ id: sale.id, data: sale });
    if (error) {
      // Sem internet (métodos não-TEF): a venda fica na fila local e sobe
      // sozinha quando a conexão voltar. Evento + gravação dupla ficam para
      // o reenvio confirmado (executarOpOffline), senão duplicariam.
      if (isErroDeRede(error)) {
        enfileirarOffline({ tipo: "insert_venda", payload: { id: sale.id, data: sale } });
        return { offline: true };
      }
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
    // sales continua a fonte de verdade: falha aqui nunca pode quebrar a
    // venda. persistirVendaNormalizada checa o .error de cada insert (o
    // supabase-js não lança em RLS/constraint) e nos avisa via onFalha —
    // fim do furo silencioso que gerou buracos na janela do 20260722.
    void persistirVendaNormalizada(supabase, sale, {
      onFalha: ({ etapa, error, venda_id }) => {
        console.error(`dual-write vendas (${etapa}) venda ${venda_id}:`, error);
        // Trilha durável: em vez de só console, deixa rastro pro Jarvas.
        emitirEvento("venda.dualwrite.falhou", "pdv", {
          venda_id,
          etapa,
          erro: error?.message ?? error?.code ?? String(error),
        }, currentUser?.username);
      },
    });
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
    // .select() após o update: PostgREST retorna sucesso HTTP com 0 linhas
    // quando a RLS filtra tudo (ex.: editor aberto para gerente, mas a
    // policy users_update exige admin) OU quando o id não bate. Sem checar
    // as linhas retornadas, a UI "atualizava" o estado local e fingia
    // sucesso sem nada persistir no banco.
    const { data, error } = await supabase
      .from("users")
      .update(payload)
      .eq("id", id)
      .select();
    if (error) return { error };
    if (!data || data.length === 0) {
      return {
        error: {
          code: "no_rows_updated",
          message: "Nenhuma linha atualizada — sem permissão (apenas admin edita usuários) ou usuário inexistente.",
        },
      };
    }
    setUsersLocal(prev => prev.map(u => {
      if (u.id !== id) return u;
      const merged = { ...u, ...changes };
      return {
        ...merged,
        permissions: { ...getPermissions(merged.role), ...(merged.permissions || {}) },
      };
    }));
    return { error: null, data };
  };

  const removeUser = async (id) => {
    const { error } = await supabase.from("users").delete().eq("id", id);
    if (!error) setUsersLocal(prev => prev.filter(u => u.id !== id));
    return { error };
  };

  // ── Actions: Fechamentos ──────────────────────────────────────
  const addFechamento = async (f) => {
    setFechamentosLocal(prev => [f, ...prev]);
    const { error } = await supabase.from("fechamentos").insert({ data: f });
    if (error) {
      console.error("addFechamento error:", error);
      setFechamentosLocal(prev => prev.filter(x => x.id !== f.id));
      return { error };
    }
    emitirEvento("caixa.fechado", "caixa", {
      total_vendas: f?.totalVendas ?? null,
      total_conferido: f?.totalConferido ?? null,
    }, currentUser?.username);
    return { error: null };
  };

  // ── Actions: Estoque ──────────────────────────────────────────
  const updateEstoque = async (productId, qty) => {
    const novaQtd = Math.max(0, qty);
    const anterior = estoque[productId];
    setEstoqueLocal(prev => ({ ...prev, [productId]: novaQtd }));
    const { error } = await supabase.from("estoque").upsert(
      { produto_id: productId, quantidade: novaQtd, updated_at: new Date().toISOString() },
      { onConflict: "produto_id" },
    );
    if (error) {
      console.error("updateEstoque error:", error);
      setEstoqueLocal(prev => ({ ...prev, [productId]: anterior ?? 0 }));
      return { error };
    }
    emitirEvento("estoque.ajustado", "estoque", { produto_id: productId, quantidade: novaQtd }, currentUser?.username);
    return { error: null };
  };

  // Atualiza múltiplos produtos de uma vez (evita race condition em imports em lote)
  const bulkSetEstoque = async (newEstoque) => {
    const anterior = estoque;
    setEstoqueLocal(newEstoque);
    const rows = Object.entries(newEstoque ?? {}).map(([produto_id, quantidade]) => ({
      produto_id,
      quantidade: Math.max(0, Number(quantidade) || 0),
      updated_at: new Date().toISOString(),
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("estoque").upsert(rows, { onConflict: "produto_id" });
      if (error) {
        console.error("bulkSetEstoque error:", error);
        setEstoqueLocal(anterior);
        return { error };
      }
    }
    emitirEvento("estoque.ajuste_em_lote", "estoque", { itens: Object.keys(newEstoque ?? {}).length }, currentUser?.username);
    return { error: null };
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
    if (error) {
      // Sem internet: mantém o desconto otimista e agenda a RPC para quando
      // a conexão voltar. Caveat conhecido: a RPC não é idempotente — se a
      // baixa gravou mas a resposta se perdeu, o reenvio desconta de novo
      // (janela rara; corrigível com chave de idempotência na RPC).
      if (isErroDeRede(error)) {
        enfileirarOffline({ tipo: "rpc_baixar_estoque", produtoId: productId, qtd: qty });
        return { error: null, offline: true };
      }
      // Baixa não confirmada no servidor: desfaz o desconto otimista e deixa
      // rastro visível para o Jarvas/gestor (TD012 — antes falhava em silêncio).
      setEstoqueLocal(prev => ({ ...prev, [productId]: anterior }));
      emitirEvento("estoque.baixa.falhou", "estoque", {
        produto_id: productId,
        quantidade: qty,
        erro: error?.message ?? error?.code ?? String(error),
      }, currentUser?.username);
      return { error };
    }

    setEstoqueLocal(prev => ({ ...prev, [productId]: quantidade }));
    emitirEvento("estoque.baixa", "estoque", { produto_id: productId, quantidade: qty }, currentUser?.username);
    return { error: null };
  };

  const setMinimoEstoque = async (productId, minimo) => {
    const novoMinimo = Math.max(0, Number(minimo) || 0);
    const anterior = estoqueMinimos[productId];
    setEstoqueMinimosLocal(prev => ({ ...prev, [productId]: novoMinimo }));
    const { error } = await supabase.from("estoque").upsert(
      { produto_id: productId, minimo: novoMinimo, updated_at: new Date().toISOString() },
      { onConflict: "produto_id" },
    );
    if (error) {
      console.error("setMinimoEstoque error:", error);
      setEstoqueMinimosLocal(prev => {
        const next = { ...prev };
        if (anterior === undefined) delete next[productId];
        else next[productId] = anterior;
        return next;
      });
      return { error };
    }
    return { error: null };
  };

  // config tem PK composta (tenant_id, key) — migração 20260738. O
  // tenant_id é resolvido pelo DEFAULT tenant_atual_id() no banco (não vai
  // no payload), mas o onConflict precisa nomear as duas colunas da PK.
  // Cada setter grava otimista, checa o .error do upsert (a RLS de config
  // exige gerente/admin — o papel caixa falhava em silêncio) e desfaz o
  // estado local quando a persistência falha, devolvendo { error }.
  const gravarConfig = async (key, value, desfazer) => {
    const { error } = await supabase.from("config").upsert({ key, value }, { onConflict: "tenant_id,key" });
    if (error) {
      console.error(`config upsert (${key}) error:`, error);
      desfazer();
      return { error };
    }
    return { error: null };
  };

  const setFundoAtual = async (val) => {
    const anterior = fundoAtual;
    setFundoAtualLocal(val);
    return gravarConfig("fundo_atual", val, () => setFundoAtualLocal(anterior));
  };

  const setCaixaAberto = async (val) => {
    const anterior = caixaAberto;
    setCaixaAbertoLocal(val);
    const res = await gravarConfig("caixa_aberto", val, () => setCaixaAbertoLocal(anterior));
    if (!res.error && val) emitirEvento("caixa.aberto", "caixa", {}, currentUser?.username);
    return res;
  };

  const setSessaoAbertaEm = async (val) => {
    const anterior = sessaoAbertaEm;
    setSessaoAbertaEmLocal(val);
    return gravarConfig("sessao_aberta_em", val, () => setSessaoAbertaEmLocal(anterior));
  };

  const setMeiosPagamento = async (val) => {
    const anterior = meiosPagamento;
    setMeiosPagamentoLocal(val);
    return gravarConfig("meios_pagamento", val, () => setMeiosPagamentoLocal(anterior));
  };

  const setMetodosCustom = async (val) => {
    const anterior = metodosCustom;
    setMetodosCustomLocal(val);
    return gravarConfig("metodos_custom", val, () => setMetodosCustomLocal(anterior));
  };

  const setMetodosTef = async (val) => {
    const anterior = metodosTef;
    setMetodosTefLocal(val);
    return gravarConfig("metodos_tef", val, () => setMetodosTefLocal(anterior));
  };

  const setTaxaServico = async (val) => {
    const anterior = taxaServico;
    setTaxaServicoLocal(!!val);
    return gravarConfig("taxa_servico", !!val, () => setTaxaServicoLocal(anterior));
  };

  // Leva 13 — a bridge grava o endereço do Palm quando ele muda (IP novo
  // do roteador, token novo). Também vai para o snapshot no próximo boot.
  const setPonteEndereco = async (val) => {
    const anterior = ponteEndereco;
    setPonteEnderecoLocal(val);
    return gravarConfig("ponte_endereco", val, () => setPonteEnderecoLocal(anterior));
  };

  const setDiasAlertaValidade = async (val) => {
    const anterior = diasAlertaValidade;
    const n = Math.max(1, Math.min(365, Number(val) || 7));
    setDiasAlertaValidadeLocal(n);
    return gravarConfig("dias_alerta_validade", n, () => setDiasAlertaValidadeLocal(anterior));
  };

  // ── Actions: Grupos de categoria (C3) ─────────────────────────
  // Mapeia uma categoria (texto livre de products.category) a um grupo.
  // grupoId null/"" remove o mapeamento.
  const setCategoriaGrupo = async (category, grupoId) => {
    const cat = String(category ?? "").trim();
    if (!cat) return { error: { message: "Categoria inválida." } };
    if (grupoId == null || grupoId === "") {
      setCategoriaGruposLocal(prev => prev.filter(r => r.category !== cat));
      const { error } = await supabase.from("categoria_grupo").delete().eq("category", cat);
      return { error };
    }
    const gid = Number(grupoId);
    setCategoriaGruposLocal(prev => {
      const outros = prev.filter(r => r.category !== cat);
      return [...outros, { category: cat, grupo_id: gid }];
    });
    const { error } = await supabase
      .from("categoria_grupo")
      .upsert({ category: cat, grupo_id: gid, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,category" });
    return { error };
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

  // C3 — mapa derivado categoria(texto) → nome do grupo, para o radar do Palm.
  const categoriaGrupoMap = (() => {
    const porId = {};
    for (const g of gruposCategoria) porId[g.id] = g.nome;
    const mapa = {};
    for (const r of categoriaGrupos) { const nome = porId[r.grupo_id]; if (nome) mapa[r.category] = nome; }
    return mapa;
  })();

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
    // trava de edição de comanda (Leva 14)
    adquirirTrava, liberarTrava, renovarTrava,
    // products
    addProduct, updateProduct, removeProduct, recarregarProdutos,
    // sales
    addSale,
    // users
    addUser, updateUser, removeUser,
    // outros
    addFechamento,
    setFundoAtual, setCaixaAberto, setSessaoAbertaEm, setMeiosPagamento, updateEstoque, bulkSetEstoque, baixarEstoque, setMinimoEstoque, recarregarEstoque,
    taxaServico, setTaxaServico,
    diasAlertaValidade, setDiasAlertaValidade,
    // C3 — grupos de categoria (radar do Palm + mapeamento em Configurações)
    gruposCategoria, categoriaGrupos, categoriaGrupoMap, setCategoriaGrupo,
    metodosCustom, setMetodosCustom,
    metodosTef, setMetodosTef,
    // offline-first (Leva 11)
    redeOnline, pendenciasOffline, enfileirarOffline,
    // ponte local (Leva 13)
    ponteEndereco, setPonteEndereco,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      <IndicadorRede online={redeOnline} pendencias={pendenciasOffline} visivel={!!currentUser} />
      <PonteLocalBridge />
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp deve ser usado dentro de <AppProvider>");
  return ctx;
};
