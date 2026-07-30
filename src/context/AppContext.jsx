import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { getPermissions, mesclarPermissoes, ROLES } from "@/constants/roles";
import { useIsMobile, useIdleTimer } from "@/utils/hooks";
import { supabase } from "@/lib/supabase";
import { buscarBootstrapTenant, moduloHabilitado, addonHabilitado } from "@/lib/tenant";
import { emailDoLogin } from "@/lib/tenantSlug";
import { ehConsoleHost } from "@/lib/consoleHost";
import { sincronizarStatusAssinatura } from "@/lib/assinatura";
import { gerarVariaveisTema, aplicarVariaveisTema, limparVariaveisTema, aplicarTituloDocumento, nomeExibicaoTenant, logoUrlTenant } from "@/lib/tema";
import { layoutDoTema, varianteDoHorario, temTrocaAutomatica, variaveisDoLayout, msAteProximaTroca } from "@/layouts";
import { salvarBrandingCache } from "@/lib/brandingCache";
import { logAction } from "@/lib/logger";
import { emitirEvento } from "@/lib/jarvas";
import { executarAnaliseJarvas } from "@/lib/jarvasEngine";
import { montarVendaLegada, persistirVendaNormalizada } from "@/lib/vendas";
import { criarLancamento } from "@/lib/financeiro";
import { METODOS_TEF_PADRAO } from "@/lib/tef";
import { processarBaixaEstoque, isRpcAusente } from "@/lib/estoque";
import { garantirUidItens, mesclarItensComanda, totalItensAtivos } from "@/lib/comandaItens";
import { LOCK_TTL_MS } from "@/lib/comandaLock";
import { sanitizeInput } from "@/utils/crypto";
import { isErroDeRede } from "@/lib/offline/rede";
import { reportarFalha, reportarInconsistencia, setTenantObservabilidade } from "@/lib/observabilidade";
import { criarFila, drenarFila } from "@/lib/offline/fila";
import { salvarSnapshot, lerSnapshot } from "@/lib/offline/snapshot";
import { useStatusRede } from "@/hooks/useStatusRede";
import IndicadorRede from "@/components/shared/IndicadorRede";
import PonteLocalBridge from "@/components/shared/PonteLocalBridge";
import ImpressaoLancamentosBridge from "@/components/shared/ImpressaoLancamentosBridge";
import {
  saveSession, loadSession, clearSession,
  lerSessao, atualizarUsuarioSessao, msRestantesDaSessao, esquecerTokenAuthLocal,
  getAttempts, setAttempts, clearAttempts,
  IDLE_MS, MAX_ATTEMPTS, LOCKOUT_MS,
} from "@/utils/session";

const AppContext = createContext(null);

// Fila local de operações offline (Leva 11) — singleton de módulo sobre
// localStorage: sobrevive a reload/fechamento do app e é compartilhada
// por todas as instâncias do provider (só existe uma no app real).
const filaOffline = criarFila({ storage: window.localStorage });

// Monta o mapa de permissões por cargo CIENTE do tenant: parte do default
// do roles.js (fallback white-label, decisão 017) e mescla por cima as
// linhas customizadas da tabela role_permissions daquele estabelecimento.
// Cargo sem linha no banco = mantém o default. Puro e estável (nível de
// módulo) para poder ser chamado no bootstrap com os dados recém-buscados.
function montarMapaCargos(rows) {
  const mapa = {};
  for (const role of Object.keys(ROLES)) mapa[role] = { ...getPermissions(role) };
  for (const row of rows || []) {
    if (!row?.role) continue;
    mapa[row.role] = mesclarPermissoes(getPermissions(row.role), row.permissions);
  }
  return mapa;
}

/**
 * Aplica sobre um mapa local (`{ produtoId: número }`) um valor que chegou do
 * realtime. Valor que não é número finito é IGNORADO: devolve o mapa anterior
 * intacto, e o dispositivo continua com o que já tinha.
 *
 * Antes o código fazia `Number(payload.new.minimo)` cru, e `Number` não avisa
 * quando não tem número: `Number(null)` é 0 e `Number(undefined)` é NaN. Um
 * evento sem a coluna `minimo` zerava o mínimo em TODOS os outros aparelhos e
 * desligava o alerta de estoque baixo sem ninguém tocar em nada. Um NaN em
 * `quantidade` era pior: a tela mostrava saldo 0 pintado de verde e escrito
 * "OK", porque nenhuma comparação com NaN é verdadeira.
 */
export function aplicarNumeroRemoto(mapa, produtoId, valor) {
  // `numeric` do Postgres chega como número ou como string no JSON do evento.
  // Qualquer outra coisa é ruído: `Number(null)` é 0 e `Number([])` também.
  if (typeof valor !== "number" && typeof valor !== "string") return mapa;
  if (typeof valor === "string" && valor.trim() === "") return mapa;
  const n = Number(valor);
  if (!Number.isFinite(n)) return mapa;
  if (mapa[produtoId] === n) return mapa; // nada mudou: não re-renderiza
  return { ...mapa, [produtoId]: n };
}

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
  // Matriz de permissões por cargo do tenant (role → mapa efetivo, já
  // mesclado sobre o default do roles.js). Vazio até o bootstrap carregar;
  // enquanto isso, o resto do app cai no getPermissions(role) do roles.js.
  const [rolePermissions, setRolePermissionsLocal] = useState({});
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
  // `lerSessao` em vez de `loadSession` porque um inicializador de estado não
  // deve ter efeito colateral: quem apaga a sessão vencida é o efeito de
  // restauração abaixo, que também precisa SABER que ela venceu para derrubar
  // a sessão do Supabase Auth junto.
  const [currentUser,  setCurrentUser]  = useState(() => lerSessao().user);
  // tenant_id do JWT da sessão atual — fonte confiável e disponível offline
  // (o `currentUser` de `users` NÃO traz tenant_id). Usado para carimbar e
  // validar os caches locais (snapshot/fila), isolando estabelecimentos que
  // porventura dividam a mesma origem de navegador (preview/IP/apex).
  const tenantIdRef = useRef(null);

  const isMobile = useIsMobile();

  // Os dois cronômetros de segurança abaixo precisam de um callback com
  // identidade ESTÁVEL: quando ela troca, o efeito remonta e a contagem volta
  // ao zero. O callback antigo dependia de `currentUser`, que troca de
  // identidade a cada refresh da lista de usuários (efeito [users]) — então num
  // turno movimentado os 30 minutos de inatividade nunca chegavam ao fim.
  // O ref sempre aponta para o `logout` da última renderização.
  const logoutRef = useRef(null);
  const logoutCallback = useCallback(() => { logoutRef.current?.(); }, []);
  useIdleTimer(logoutCallback, IDLE_MS, !!currentUser);

  // Teto absoluto da sessão: 8 horas contadas do login. O `lerSessao` só é
  // consultado ao carregar a página, então numa aba aberta o turno inteiro — o
  // caso normal do PDV — o teto nunca chegava a valer. Aqui ele corre em
  // memória e desloga na hora. Depende do `id`, não do objeto, para que o
  // refresh da lista de usuários não reagende nada.
  useEffect(() => {
    if (!currentUser) return;
    const restante = msRestantesDaSessao();
    if (restante === null) return;
    if (restante === 0) { logoutRef.current?.(); return; }
    const t = setTimeout(() => logoutRef.current?.(), restante);
    return () => clearTimeout(t);
  }, [currentUser?.id]);

  // ── Restaura sessão do Supabase Auth ao carregar ─────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && lerSessao().estado === "expirada") {
        // Teto de 8 horas vencido. O refresh token do Supabase vive muito mais
        // que isso, então sem este ramo bastava dar F5 para o `saveSession`
        // logo abaixo carimbar um `at` novo e o teto nunca valer nada. Derruba
        // a sessão do Auth também, senão o próximo carregamento reabre tudo.
        tenantIdRef.current = null;
        setCurrentUser(null);
        clearSession();
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }
      if (session) {
        tenantIdRef.current = session.user?.app_metadata?.tenant_id ?? null;
        const userData = await buscarDadosUsuario(session.user.id);
        if (userData) {
          setCurrentUser(userData);
          // Preserva o relógio quando esta aba já tem sessão; só carimba um
          // `at` novo quando é aba nova (aí é começo de sessão de verdade).
          if (!atualizarUsuarioSessao(userData)) saveSession(userData);
          await bootstrap();
        } else if (loadSession() && typeof navigator !== "undefined" && navigator.onLine === false) {
          // Sem internet a busca do usuário falha mesmo com sessão válida.
          // A sessão local basta para operar: o bootstrap hidrata do
          // snapshot e o app segue offline em vez de travar no login.
          await bootstrap();
        } else {
          setLoading(false);
        }
      } else if (loadSession() && typeof navigator !== "undefined" && navigator.onLine === false) {
        // Offline: o getSession pode devolver null só porque não conseguiu
        // renovar o token. A sessão local é justamente o que mantém o PDV
        // operando do snapshot, então ela fica e o bootstrap hidrata do cache.
        await bootstrap();
      } else {
        // Sem sessão no Supabase Auth e com rede: o `currentUser` semeado do
        // sessionStorage (linha 119, para a tela abrir sem piscar) está morto.
        // Sem JWT nenhuma leitura passa pela RLS, então o app renderizava
        // "logado" com tudo vazio — e ninguém limpava esse estado, porque num
        // carregamento sem sessão o supabase-js emite `INITIAL_SESSION`, e o
        // onAuthStateChange abaixo só reage a `SIGNED_OUT`. Limpar aqui joga
        // a pessoa de volta ao login, que é o estado verdadeiro.
        tenantIdRef.current = null;
        setCurrentUser(null);
        clearSession();
        setLoading(false);
      }
    }).catch((err) => {
      // Restaurar a sessão pode rejeitar (refresh de token expirado, falha de
      // rede no getSession, throw dentro do bootstrap). Sem este catch a
      // rejeição escapa como `unhandledrejection` global (Sentry KORA-2) na
      // porta de entrada. Degrada para deslogado: a tela de login segue
      // funcionando e a autenticação real continua protegida por Auth + RLS.
      console.error("[auth] falha ao restaurar sessão:", err?.message ?? err);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        tenantIdRef.current = null;
        setCurrentUser(null);
        clearSession();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Busca nome, role e permissions do usuário pelo auth_id.
  // No login a matriz do tenant ainda não carregou, então a base é o default
  // do roles.js; o override do funcionário (users.permissions) é mesclado por
  // cima. O efeito [users] refina para a matriz do tenant assim que o
  // bootstrap termina. Resiliente à coluna ausente (migration 20260828 não
  // aplicada, erro 42703): repete o select sem ela e desliga o override.
  async function buscarDadosUsuario(authId) {
    const selecionar = (cols) =>
      supabase.from("users").select(cols).eq("auth_id", authId).eq("active", true).single();
    let { data, error } = await selecionar("id,name,username,role,auth_id,permissions");
    if (error?.code === "42703") {
      permsColunaIndisponivelRef.current = true;
      ({ data } = await selecionar("id,name,username,role,auth_id"));
    }
    if (!data) return null;
    const override = data.permissions ?? null;
    return {
      ...data,
      permissoesOverride: override,
      permissions: mesclarPermissoes(getPermissions(data.role), override),
    };
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

  // Fail-open p/ o override de permissão por funcionário (users.permissions):
  // quando a migration 20260828 ainda não rodou no banco (coluna inexistente,
  // erro 42703), a coluna some do select e é removida dos writes — os
  // overrides ficam desligados e o app opera pelo cargo, sem quebrar.
  const permsColunaIndisponivelRef = useRef(false);

  // Mapa de permissões de um cargo, ciente do tenant. Fallback total no
  // roles.js quando a matriz ainda não carregou (login) ou o cargo não foi
  // customizado neste estabelecimento.
  const mapaDoCargo = (role) => rolePermissions[role] || getPermissions(role);

  // Colunas base de pending (nunca select * em tabela sensível — CLAUDE.md).
  const COLUNAS_PENDING = "id,comanda,items,status,note,total,garcom,created_by,created_at,updated_at,mesa,apelido,cliente_id,cliente_nome,status_cozinha,em_preparo_em,pronto_em";
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

  // Usuários do tenant. Tenta incluir a coluna de override (permissions); se
  // a migration 20260828 ainda não rodou (42703), marca a coluna como
  // indisponível e repete sem ela — o bootstrap não pode quebrar por causa
  // de uma feature opcional (mesmo padrão de buscarPendingData/Leva 14).
  const COLUNAS_USERS = "id,name,username,role,auth_id,active";
  async function buscarUsers() {
    const res = await supabase.from("users")
      .select(`${COLUNAS_USERS},permissions`).eq("active", true);
    if (res.error?.code === "42703") {
      permsColunaIndisponivelRef.current = true;
      return supabase.from("users").select(COLUNAS_USERS).eq("active", true);
    }
    return res;
  }

  // Matriz de permissões por cargo do tenant. Qualquer erro (tabela ausente
  // antes da migration, RLS, rede) resolve para lista vazia → o app usa o
  // default do roles.js. Nunca lança, nunca bloqueia o bootstrap.
  async function buscarRolePermissions() {
    try {
      const res = await supabase.from("role_permissions").select("role,permissions");
      if (res.error) return { data: [] };
      return res;
    } catch {
      return { data: [] };
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
        { data: gruposData,   error: eGrupos   },
        { data: catGrupoData, error: eCatGrupo },
        { data: rolePermsData },
      ] = await Promise.all([
        supabase.from("products").select("*").eq("active", true).order("id"),
        buscarPendingData(),
        // Bootstrap limitado a 90 dias — relatórios de período maior devem consultar sob demanda.
        buscarSalesData(),
        buscarUsers(),
        supabase.from("fechamentos").select("id,data,created_at").order("created_at", { ascending: false }),
        supabase.from("config").select("key,value").in("key", ["fundo_atual","caixa_aberto","sessao_aberta_em","meios_pagamento","taxa_servico","metodos_custom","metodos_tef","dias_alerta_validade","ponte_endereco"]),
        supabase.from("estoque").select("produto_id,quantidade,minimo"),
        // Fases 1-2 — camada de comercialização (ADR-005): nunca lança, então nunca bloqueia o resto do bootstrap.
        buscarBootstrapTenant(),
        // C3 — grupos de categoria (Radar de Oportunidades no Palm)
        supabase.from("grupos_categoria").select("id,nome").order("id"),
        supabase.from("categoria_grupo").select("category,grupo_id"),
        // Permissões por cargo do tenant (matriz editável, decisão 017).
        buscarRolePermissions(),
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
        const snapshot = lerSnapshot(window.localStorage, tenantIdRef.current);
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
      // Matriz de permissões por cargo deste tenant (fallback no roles.js).
      const mapaCargos = montarMapaCargos(rolePermsData);
      setRolePermissionsLocal(mapaCargos);
      if (usersData?.length)       setUsersLocal(usersData.map(u => ({
        ...u,
        // permissoesOverride = override cru do funcionário (users.permissions);
        // permissions = mapa EFETIVO (cargo do tenant ⊕ override). Consumidores
        // (PrivateRoute/Sidebar/...) leem sempre o efetivo.
        permissoesOverride: u.permissions ?? null,
        permissions: mesclarPermissoes(mapaCargos[u.role] || getPermissions(u.role), u.permissions),
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
        // Observabilidade: registra o UUID do tenant (NUNCA nome/marca/PII)
        // para taguear os eventos do Sentry por estabelecimento (multi-tenant).
        setTenantObservabilidade(tenantData.id ?? null);
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
        }, tenantData?.id ?? tenantIdRef.current);
      }

      setLoading(false);
  }

  // ── Atualiza currentUser quando a lista de usuários muda ──────
  // A linha em `users` já traz o mapa EFETIVO (cargo do tenant ⊕ override do
  // funcionário), calculado ao montar a lista. Preserva esse `permissions` —
  // recomputar pelo roles.js aqui apagaria a matriz do tenant e o override.
  useEffect(() => {
    if (!currentUser) return;
    const updated = users.find(u => u.id === currentUser.id);
    if (updated) {
      setCurrentUser(updated);
      // Atualiza os dados SEM tocar no relógio: com `saveSession` aqui, todo
      // refresh da lista de usuários renovava a sessão e o teto de 8 horas
      // nunca vencia numa aba aberta o dia inteiro.
      atualizarUsuarioSessao(updated);
    }
  }, [users]);

  // ── Fase 6 — camada de comercialização (ADR-007): aplica o tema do
  //    tenant (--gm-*) assim que `tenant.tema` é conhecido, em camadas:
  //    defaults do tema.css → variante do layout (`tema.layout`,
  //    src/layouts) → overrides finos do tenant por cima. Sem layout e
  //    sem tema custom, nada é sobrescrito — aparência atual intacta.
  const [varianteLayout, setVarianteLayout] = useState(() => varianteDoHorario(new Date().getHours()));

  useEffect(() => {
    // Antes do tenant carregar, quem manda é a pintura anti-flash (cache do
    // index.html / LoginPage) — limpar aqui apagaria essa pintura e faria a
    // tela piscar o visual default até o bootstrap responder.
    if (!tenant) return;
    // No host do Console (plataforma), a marca é SEMPRE neutra da KORA: nunca
    // aplicar tema/título/cache de tenant aqui — senão a marca de um
    // estabelecimento (ex.: "GASTROMUNDI by Kora") vaza na aba/visual do
    // console. Limpa qualquer token --gm-* órfão e fixa o título neutro.
    if (ehConsoleHost()) {
      limparVariaveisTema();
      if (typeof document !== "undefined") document.title = "KORA · Console";
      return;
    }
    const codigoLayout = layoutDoTema(tenant.tema);
    const variaveis = {
      ...variaveisDoLayout(codigoLayout, varianteLayout),
      ...gerarVariaveisTema(tenant.tema),
    };
    // Limpa o que a aplicação anterior setou (troca de layout/variante
    // não pode herdar tokens órfãos) e aplica o merge da vez.
    limparVariaveisTema();
    aplicarVariaveisTema(variaveis);
    // Aba do navegador com a marca do tenant (white-label).
    const nome = nomeExibicaoTenant(tenant.tema, tenant.nome);
    aplicarTituloDocumento(nome);
    // Cache por origem (anti-flash): a próxima abertura deste endereço
    // já pinta com esta marca antes do bootstrap (script do index.html).
    salvarBrandingCache({ nome, logo: logoUrlTenant(tenant.tema), variaveis });
  }, [tenant?.tema, varianteLayout]);

  // ── Timer dia/noite dos layouts adaptativos (marca, casa): arma um
  //    despertar para a próxima fronteira (06:00/19:00). Ao disparar, a
  //    variante muda, o efeito acima repinta e este efeito re-arma a
  //    fronteira seguinte. Layout fixo não arma nada.
  useEffect(() => {
    if (!temTrocaAutomatica(layoutDoTema(tenant?.tema))) return;
    const timer = setTimeout(() => {
      setVarianteLayout(varianteDoHorario(new Date().getHours()));
    }, msAteProximaTroca(new Date()));
    return () => clearTimeout(timer);
  }, [tenant?.tema, varianteLayout]);

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
        // Sem produto no evento não há o que aplicar. Antes entrava uma chave
        // "undefined" no mapa de estoque de todo mundo.
        if (produtoId === null || produtoId === undefined) return;
        if (payload.eventType === "DELETE") {
          setEstoqueLocal(prev => { const { [produtoId]: _omit, ...rest } = prev; return rest; });
          setEstoqueMinimosLocal(prev => { const { [produtoId]: _omit, ...rest } = prev; return rest; });
          return;
        }
        setEstoqueLocal(prev => aplicarNumeroRemoto(prev, produtoId, payload.new?.quantidade));
        setEstoqueMinimosLocal(prev => aplicarNumeroRemoto(prev, produtoId, payload.new?.minimo));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Realtime: vendas fechadas (saldo do dia entre dispositivos) ──
  // Leva 15.4 — sem isso, cada caixa só enxergava as próprias vendas e o
  // Saldo do Dia / fechamento divergiam entre dispositivos (bug A4/TD010).
  // Requer Realtime habilitado na tabela `sales` (Database → Replication).
  useEffect(() => {
    const channel = supabase
      .channel("sales-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const venda = payload.new?.data;
          if (!venda?.id) return;
          setSalesLocal(prev => prev.find(s => s && s.id === venda.id) ? prev : [venda, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          // Cancelamento (15.3) e outras edições do blob propagam na hora.
          const venda = payload.new?.data;
          if (!venda?.id) return;
          setSalesLocal(prev => prev.map(s => (s && s.id === venda.id ? venda : s)));
        } else if (payload.eventType === "DELETE") {
          const id = payload.old?.id;
          if (id) setSalesLocal(prev => prev.filter(s => !s || s.id !== id));
        }
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
    // O opId veio junto da operação original: reenviar com ele faz a RPC
    // reconhecer a baixa já aplicada em vez de descontar o item de novo.
    // Operação antiga (guardada antes desta versão) não tem opId — vai como
    // null e se comporta como antes, sem quebrar o dreno da fila.
    if (op.tipo === "rpc_baixar_estoque") {
      return supabase.rpc("baixar_estoque", { p_produto_id: op.produtoId, p_qtd: op.qtd, p_op_id: op.opId ?? null });
    }
    if (op.tipo === "rpc_baixar_estoque_subproduto") {
      return supabase.rpc("baixar_estoque_subproduto", { p_subproduto_id: op.subprodutoId, p_qtd: op.qtd, p_op_id: op.opId ?? null });
    }
    if (op.tipo === "insert_lancamento") return criarLancamento(op.dados, op.usuario);
    return Promise.resolve({ error: null }); // tipo desconhecido — descarta
  };

  const reenviarVendaOffline = async (op) => {
    const sale = op.payload.data;
    const { error } = await supabase.from("sales").upsert({ id: op.payload.id, data: sale }, { onConflict: "id" });
    if (error) return { error };
    // DÍVIDA (auditoria P3/P4): reenvio pode reaplicar efeitos — precisa de chave de idempotência na RPC
    // (o upsert acima não duplica a venda, mas o evento e o dual-write abaixo podem reemitir no dreno).
    emitirEvento("venda.finalizada", "pdv", {
      venda_id: sale.id,
      total: sale.total ?? null,
      metodo: sale.metodo ?? sale.payment ?? null,
      itens: Array.isArray(sale.items) ? sale.items.length : null,
    }, currentUser?.username);
    void persistirVendaNormalizada(supabase, sale, {
      onFalha: ({ etapa, error: e, venda_id }) => {
        console.error(`dual-write vendas (${etapa}) venda ${venda_id}:`, e);
        reportarFalha(e, { acao: "persistirVendaNormalizada", etapa, tabela: "vendas", venda_id, origem: "reenvioOffline" });
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
  // Carimba a op com o tenant da sessão (JWT). No drain, ops de outro tenant
  // são puladas e preservadas (isolamento em origem compartilhada). Ver fila.js.
  const enfileirarOffline = (op) =>
    setPendenciasOffline(filaOffline.enfileirar({ ...op, __tenant: tenantIdRef.current }));

  const drenarPendenciasOffline = async () => {
    if (drenandoRef.current || filaOffline.tamanho() === 0) return;
    drenandoRef.current = true;
    try {
      const { falhas } = await drenarFila({ fila: filaOffline, executar: executarOpOffline, isErroDeRede, tenantAtual: tenantIdRef.current });
      for (const { op, error } of falhas) {
        console.error("[offline] operação descartada no reenvio:", op.tipo, error?.message);
        // Falha NÃO-rede ao drenar: a op foi descartada (não é reenfileirada)
        // e aqui mora a não-idempotência do estoque / evento reemitido. É bug
        // silencioso — reporta com o tipo da op (drenarFila já separou rede).
        reportarFalha(error, { acao: "drenarPendenciasOffline", op: op?.tipo });
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
    // Endereço de acesso que não forma um namespace válido (subdomínio com
    // caractere estranho, fallback mal configurado): não é erro de senha, então
    // não consome tentativa nem vai à rede — e a mensagem fala do endereço, não
    // da credencial.
    if (!email) return { error: "Endereço de acesso inválido. Confira o link do estabelecimento." };
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
    tenantIdRef.current = authData.user?.app_metadata?.tenant_id ?? null;
    setCurrentUser(userData);
    saveSession(userData);
    logAction(userData.username, "auth:login", { msg: `Login realizado · ${userData.role}`, name: userData.name, role: userData.role });
    await bootstrap();
    return { ok: true };
  };

  const logout = async () => {
    if (currentUser) logAction(currentUser.username, "auth:logout", { msg: "Sessão encerrada", name: currentUser.name, role: currentUser.role });
    // A tela volta para o login na hora — quem clicou em "Sair" não deve
    // esperar a rede para ver que saiu.
    setCurrentUser(null);
    clearSession();
    // Mas o que autoriza qualquer leitura no banco é o token do Supabase, no
    // localStorage deste navegador. Sem internet ou com o servidor fora, o
    // `signOut` devolve { error } e sai ANTES de apagar o token: o próximo
    // carregamento usaria o refresh token para religar a sessão sem pedir
    // senha, e num PDV compartilhado isso é o próximo turno entrando como o
    // anterior. Então, se o servidor não confirmou, apagamos na mão.
    const { error } = await supabase.auth.signOut();
    if (error) esquecerTokenAuthLocal();
    return { error: error ?? null };
  };
  // É por aqui que os cronômetros de inatividade e do teto de 8h chamam o
  // logout: eles guardam um callback estável e leem sempre a versão atual.
  logoutRef.current = logout;

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
    const { id, comanda, mesa, apelido, cliente_id, cliente_nome, items, status, note, total, garcom, created_by } = order;
    const { error } = await supabase.from("pending").insert({ id, comanda, mesa, apelido, cliente_id, cliente_nome, items, status, note, total, garcom, created_by });
    if (error) {
      // Sem internet o pedido NÃO some (Leva 11): mantém o estado
      // otimista, guarda na fila local e reenvia quando a rede voltar.
      if (isErroDeRede(error)) {
        enfileirarOffline({ tipo: "insert", payload: { id, comanda, mesa, apelido, cliente_id, cliente_nome, items, status, note, total, garcom, created_by } });
        return { error: null, offline: true };
      }
      console.error("addPending error:", error);
      reportarFalha(error, { acao: "addPending", tabela: "pending" });
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
        enfileirarOffline({ tipo: "delete", id });
        return { error: null, offline: true };
      }
      console.error("removePending error:", error);
      reportarFalha(error, { acao: "removePending", tabela: "pending", id });
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
        enfileirarOffline({ tipo: "update", id, changes: { ...changes, updated_at: new Date().toISOString() } });
        return { error: null, offline: true };
      }
      console.error("updatePending error:", error);
      reportarFalha(error, { acao: "updatePending", tabela: "pending", id });
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
    // X3 — o username entra cru no filtro .or() abaixo. Um username com `,`
    // `.` `)` ou espaço reescreveria a lógica do filtro (roubo de trava).
    // Só montamos o .or() com username em allowlist [a-zA-Z0-9._-]; fora
    // dela, fail-open (não trava ninguém — coerente com o resto da função).
    if (!/^[a-zA-Z0-9._-]+$/.test(currentUser.username)) return { ok: true, semTrava: true };
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
    // .select() após o update: PostgREST devolve sucesso HTTP com 0 linhas
    // quando a RLS filtra tudo (ex.: gerente edita preço, mas a policy exige
    // admin) ou o id não bate. Sem checar as linhas, a UI fingiria sucesso
    // sem nada persistir (mesmo padrão do updateUser/cancelarVendaFechada).
    const { data, error } = await supabase.from("products").update(changes).eq("id", id).select("id");
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "updateProduct", tabela: "products", id });
      return { error: { code: "no_rows_updated", message: "Nenhuma linha atualizada — sem permissão ou produto inexistente." } };
    }
    setProductsLocal(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
    return { error: null };
  };

  const removeProduct = async (id) => {
    // .select() após o delete: 0 linhas removidas (RLS ou id inexistente)
    // resolve { error: null } no supabase-js — checagem evita sucesso falso.
    const { data, error } = await supabase.from("products").delete().eq("id", id).select("id");
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "removeProduct", tabela: "products", id });
      return { error: { code: "no_rows_deleted", message: "Nenhuma linha removida — sem permissão ou produto inexistente." } };
    }
    setProductsLocal(prev => prev.filter(p => p.id !== id));
    return { error: null };
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
        return { error: null, offline: true };
      }
      // A2 da auditoria — a venda NÃO existe no banco (RLS, constraint...).
      // Sem desfazer o otimista ela continuava somando no Saldo do Dia até
      // alguém recarregar a página: o caixa fechava o dia com dinheiro que
      // nunca foi gravado. addPending/updatePending/removePending já
      // desfaziam; a única ação que mexe em dinheiro era a que não desfazia.
      setSalesLocal(prev => prev.filter(v => v.id !== sale.id));
      console.error("addSale error:", JSON.stringify(error, null, 2));
      reportarFalha(error, { acao: "addSale", tabela: "sales", venda_id: sale.id });
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
        reportarFalha(error, { acao: "persistirVendaNormalizada", etapa, tabela: "vendas", venda_id });
        // Trilha durável: em vez de só console, deixa rastro pro Jarvas.
        emitirEvento("venda.dualwrite.falhou", "pdv", {
          venda_id,
          etapa,
          erro: error?.message ?? error?.code ?? String(error),
        }, currentUser?.username);
      },
    });

    // Mesmo contrato das demais actions: { error } sempre presente.
    return { error: null };
  };

  // Leva 15.3 — cancela uma venda já fechada (comanda fechada).
  // O blob em `sales` NÃO é apagado: marcamos data.cancelada (trilha de
  // auditoria) e removemos as linhas relacionais (TD009), já que o caminho
  // de leitura é relacional-first — apagar as linhas tira a venda dos
  // relatórios sem precisar de migration. Lançamentos financeiros da venda
  // (receita automática / fiado) também são removidos.
  const cancelarVendaFechada = async (vendaId, motivo) => {
    const alvo = sales.find(s => s && s.id === vendaId);
    if (!alvo) return { error: { code: "venda_nao_encontrada", message: "Venda não encontrada." } };
    if (alvo.cancelada) return { error: { code: "ja_cancelada", message: "Esta venda já foi cancelada." } };

    const cancelada = {
      ...alvo,
      cancelada: true,
      motivoCancelamento: motivo,
      canceladaPor: currentUser?.name ?? currentUser?.username ?? null,
      canceladaEm: new Date().toISOString(),
    };

    // .select() após o update: PostgREST devolve sucesso HTTP com 0 linhas
    // quando a RLS filtra tudo ou o id não existe (mesmo padrão do
    // updateUser) — sem checar, a UI fingiria que cancelou.
    const { data: linhas, error } = await supabase
      .from("sales")
      .update({ data: cancelada })
      .eq("id", vendaId)
      .select("id");
    if (error) return { error };
    if (!linhas || linhas.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "cancelarVendaFechada", tabela: "sales", venda_id: vendaId });
      return { error: { code: "no_rows_updated", message: "Nenhuma linha atualizada — venda inexistente ou sem permissão." } };
    }

    // Espelho relacional: filhos antes do cabeçalho (FK). Falha aqui não
    // desfaz o cancelamento (o blob é a fonte de verdade) — só registra.
    const { error: ePag } = await supabase.from("venda_pagamentos").delete().eq("venda_id", vendaId);
    if (ePag) console.error("cancelarVendaFechada venda_pagamentos:", ePag);
    const { error: eIt } = await supabase.from("venda_itens").delete().eq("venda_id", vendaId);
    if (eIt) console.error("cancelarVendaFechada venda_itens:", eIt);
    const { error: eVen } = await supabase.from("vendas").delete().eq("id", vendaId);
    if (eVen) console.error("cancelarVendaFechada vendas:", eVen);

    const { error: eLanc } = await supabase.from("lancamentos").delete().eq("venda_id", vendaId);
    if (eLanc) console.error("cancelarVendaFechada lancamentos:", eLanc);

    setSalesLocal(prev => prev.map(s => (s && s.id === vendaId ? cancelada : s)));

    logAction(currentUser?.username, "venda:cancelar", {
      msg: `Venda cancelada · ${alvo.comanda ?? vendaId} · R$ ${Number(alvo.total ?? 0).toFixed(2)} · motivo: ${motivo}`,
      name: currentUser?.name, role: currentUser?.role, venda_id: vendaId, motivo,
    });
    emitirEvento("venda.cancelada", "pdv", {
      venda_id: vendaId, total: alvo.total ?? null, motivo,
    }, currentUser?.username);
    return { error: null };
  };

  // ── Actions: Users ────────────────────────────────────────────
  const addUser = async (user) => {
    // omite id (gerado pelo banco). `permissions` agora É persistido: é o
    // OVERRIDE do funcionário (parcial; null = segue o cargo). Se a coluna
    // ainda não existe (migration 20260828 pendente), some do payload
    // (fail-open) e o usuário nasce seguindo o cargo.
    const { id: _ignored, ...payload } = user;
    if (permsColunaIndisponivelRef.current) delete payload.permissions;
    const { data, error } = await supabase.from("users").insert(payload).select().single();
    if (data) setUsersLocal(prev => [...prev, {
      ...data,
      permissoesOverride: data.permissions ?? null,
      permissions: mesclarPermissoes(mapaDoCargo(data.role), data.permissions),
    }]);
    return { data, error };
  };

  const updateUser = async (id, changes) => {
    // `permissions` (override do funcionário) É persistido — a menos que a
    // coluna ainda não exista no banco (fail-open, migration pendente).
    const payload = { ...changes };
    if (permsColunaIndisponivelRef.current) delete payload.permissions;
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
      reportarInconsistencia("write afetou 0 linhas", { acao: "updateUser", tabela: "users", id });
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
      // Se o override veio nesta edição, adota-o (null = volta a seguir o
      // cargo); senão, preserva o override que o usuário já tinha.
      const override = Object.prototype.hasOwnProperty.call(changes, "permissions")
        ? (changes.permissions ?? null)
        : u.permissoesOverride;
      return {
        ...merged,
        permissoesOverride: override,
        permissions: mesclarPermissoes(mapaDoCargo(merged.role), override),
      };
    }));
    return { error: null, data };
  };

  const removeUser = async (id) => {
    // .select() após o delete: 0 linhas removidas (RLS filtra — apenas admin
    // remove usuários — ou id inexistente) resolve { error: null } no
    // supabase-js. Checar as linhas evita sucesso falso (mesmo padrão do
    // updateUser/cancelarVendaFechada).
    const { data, error } = await supabase.from("users").delete().eq("id", id).select("id");
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "removeUser", tabela: "users", id });
      return { error: { code: "no_rows_deleted", message: "Nenhuma linha removida — sem permissão (apenas admin remove usuários) ou usuário inexistente." } };
    }
    setUsersLocal(prev => prev.filter(u => u.id !== id));
    return { error: null };
  };

  // Grava a matriz de permissões de UM cargo para este estabelecimento
  // (upsert por tenant_id+role). `permissoesCompletas` é o mapa inteiro do
  // cargo (todas as chaves booleanas). tenant_id explícito do tenant
  // carregado; a RLS exige tenant_id = tenant_atual_id() (só admin, só o
  // próprio tenant). Recalcula as permissões efetivas de todos os usuários
  // daquele cargo (cargo ⊕ override de cada um) para refletir na hora.
  const salvarPermissoesCargo = async (role, permissoesCompletas) => {
    if (!ROLES[role]) return { error: { message: "Cargo inválido." } };
    if (!tenant?.id) return { error: { message: "Estabelecimento ainda carregando — tente de novo." } };
    const payload = {
      tenant_id: tenant.id,
      role,
      permissions: permissoesCompletas,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("role_permissions")
      .upsert(payload, { onConflict: "tenant_id,role" })
      .select("role,permissions");
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "salvarPermissoesCargo", tabela: "role_permissions", role });
      return { error: { code: "no_rows_updated", message: "Nenhuma linha gravada — só um administrador edita permissões de cargo." } };
    }
    const efetivoCargo = mesclarPermissoes(getPermissions(role), permissoesCompletas);
    const novoMapa = { ...rolePermissions, [role]: efetivoCargo };
    setRolePermissionsLocal(novoMapa);
    setUsersLocal(prev => prev.map(u => (
      u.role !== role ? u : { ...u, permissions: mesclarPermissoes(efetivoCargo, u.permissoesOverride) }
    )));
    return { error: null };
  };

  // ── Actions: Fechamentos ──────────────────────────────────────
  const addFechamento = async (f) => {
    setFechamentosLocal(prev => [f, ...prev]);
    const { error } = await supabase.from("fechamentos").insert({ data: f });
    if (error) {
      console.error("addFechamento error:", error);
      reportarFalha(error, { acao: "addFechamento", tabela: "fechamentos" });
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
    // Quantidade não numérica virava NaN aqui (`Math.max(0, undefined)` é NaN):
    // a tela passava a mostrar "NaN" no saldo e o banco recusava a gravação com
    // um erro que ninguém lia. Recusa antes de encostar no estado.
    // E `Number(null)` e `Number("")` são 0: um valor perdido no caminho zerava
    // o saldo do produto em silêncio. Zerar é operação legítima, mas só quando
    // alguém manda o número 0.
    const vazio = qty === null || qty === undefined || (typeof qty === "string" && qty.trim() === "");
    const numero = vazio ? NaN : Number(qty);
    if (!Number.isFinite(numero)) {
      return { error: { message: "Quantidade inválida." } };
    }
    const novaQtd = Math.max(0, numero);
    const tinhaLinha = estoque[productId] !== undefined;
    const anterior = estoque[productId];
    setEstoqueLocal(prev => ({ ...prev, [productId]: novaQtd }));
    const { error } = await supabase.from("estoque").upsert(
      { produto_id: productId, quantidade: novaQtd, updated_at: new Date().toISOString() },
      { onConflict: "produto_id" },
    );
    if (error) {
      console.error("updateEstoque error:", error);
      reportarFalha(error, { acao: "updateEstoque", tabela: "estoque", produto_id: productId });
      setEstoqueLocal(prev => {
        const next = { ...prev };
        // Produto que ainda não tinha linha de estoque volta a NÃO ter. Deixar a
        // chave valendo 0 fazia a tela e o Jarvas tratarem como ruptura um
        // produto que simplesmente não controla estoque.
        if (tinhaLinha) next[productId] = anterior;
        else delete next[productId];
        return next;
      });
      return { error };
    }
    emitirEvento("estoque.ajustado", "estoque", { produto_id: productId, quantidade: novaQtd }, currentUser?.username);
    return { error: null };
  };

  // Baixa atômica no servidor (evita race condition entre dispositivos descontando ao mesmo tempo).
  // Decisão de alerta de mínimo delegada a processarBaixaEstoque (src/lib/estoque.js) — testável isoladamente.
  const baixarEstoque = async (productId, qty) => {
    const anterior = Number(estoque[productId] ?? 0);
    setEstoqueLocal(prev => ({ ...prev, [productId]: Math.max(0, anterior - qty) })); // otimista

    // Identidade desta baixa. Gerada UMA vez aqui e repetida no reenvio:
    // é o que faz a RPC reconhecer "já apliquei essa" quando a primeira
    // tentativa gravou mas a resposta se perdeu na queda de conexão.
    const opId = crypto.randomUUID();
    const produto = products.find(p => String(p.id) === String(productId));
    const { quantidade, error } = await processarBaixaEstoque({
      produtoId: productId,
      qty,
      quantidadeAnterior: anterior,
      nomeProduto: produto?.name ?? `Produto ${productId}`,
      minimoFallback: estoqueMinimos[productId] ?? 10,
      usuario: currentUser?.username,
      chamarRpc: (id, q) => supabase.rpc("baixar_estoque", { p_produto_id: id, p_qtd: q, p_op_id: opId }),
    });
    if (error) {
      // Sem internet: mantém o desconto otimista e agenda a RPC para quando
      // a conexão voltar, carregando o MESMO opId — reenviar não desconta
      // duas vezes (migration 20260830_idempotencia_baixa_estoque.sql).
      if (isErroDeRede(error)) {
        enfileirarOffline({ tipo: "rpc_baixar_estoque", produtoId: productId, qtd: qty, opId });
        return { error: null, offline: true };
      }
      // Baixa não confirmada no servidor: desfaz o desconto otimista e deixa
      // rastro visível para o Jarvas/gestor (TD012 — antes falhava em silêncio).
      setEstoqueLocal(prev => ({ ...prev, [productId]: anterior }));
      reportarFalha(error, { acao: "baixarEstoque", tabela: "estoque", produto_id: productId, quantidade: qty });
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

  // Entrada de mercadoria atômica no servidor (Run 4, leva 4).
  //
  // Antes a tela somava no saldo que ELA tinha em memória e gravava o
  // TOTAL absoluto por upsert. Dois aparelhos conferindo a mesma nota ao
  // mesmo tempo perdiam mercadoria: saldo 40, um lança 5 e grava 45, o
  // outro (que ainda via 40) lança 3 e grava 43 — os 5 do primeiro somem
  // sem nenhum erro na tela. Agora quem soma é o banco
  // (migration 20260901_entrada_estoque_atomica.sql) e a tela manda só o
  // quanto entrou. O opId impede que um reenvio some duas vezes.
  const entradaEstoque = async (productId, delta) => {
    const quantoEntrou = Number(delta);
    if (!Number.isFinite(quantoEntrou) || quantoEntrou <= 0) {
      return { error: { message: "Quantidade de entrada inválida." } };
    }
    const tinhaLinha = estoque[productId] !== undefined;
    const anterior = Number(estoque[productId] ?? 0);
    setEstoqueLocal(prev => ({ ...prev, [productId]: anterior + quantoEntrou })); // otimista

    const opId = crypto.randomUUID();
    let data = null, error = null;
    try {
      ({ data, error } = await supabase.rpc("entrada_estoque", {
        p_produto_id: productId,
        p_delta: quantoEntrou,
        p_op_id: opId,
      }));
    } catch (err) {
      error = { message: err?.message ?? String(err) };
    }

    // Banco ainda sem a função (app publicado antes da migration rodar):
    // usa o caminho antigo em vez de impedir o recebimento de mercadoria.
    // Volta a ser um read-modify-write nessa janela — é o comportamento
    // que já existia, não uma piora.
    if (error && isRpcAusente(error)) {
      return updateEstoque(productId, anterior + quantoEntrou);
    }
    if (error) {
      setEstoqueLocal(prev => {
        const next = { ...prev };
        // Produto que ainda não tinha linha de estoque volta a NÃO ter. Deixar
        // a chave valendo 0 faria a tela e o Jarvas tratarem como ruptura um
        // produto que simplesmente não controla estoque.
        if (tinhaLinha) next[productId] = anterior;
        else delete next[productId];
        return next;
      });
      reportarFalha(error, { acao: "entradaEstoque", tabela: "estoque", produto_id: productId, quantidade: quantoEntrou });
      emitirEvento("estoque.entrada.falhou", "estoque", {
        produto_id: productId,
        quantidade: quantoEntrou,
        erro: error?.message ?? error?.code ?? String(error),
      }, currentUser?.username);
      return { error };
    }

    // Saldo que o banco confirmou — pode diferir do otimista quando outro
    // aparelho mexeu no mesmo produto, e é ele que vale.
    const linha = Array.isArray(data) ? data[0] : data;
    if (linha?.quantidade != null) {
      setEstoqueLocal(prev => ({ ...prev, [productId]: Number(linha.quantidade) }));
    }
    if (linha?.minimo != null) {
      setEstoqueMinimosLocal(prev => ({ ...prev, [productId]: Number(linha.minimo) }));
    }
    emitirEvento("estoque.entrada", "estoque", { produto_id: productId, quantidade: quantoEntrou }, currentUser?.username);
    return { error: null };
  };

  // B4 — baixa atômica de subproduto (componentes de combo). Sem estado
  // otimista local: o saldo de subproduto não aparece no PDV, só no
  // cadastro (SubprodutosView recarrega do banco). Nunca deve travar a
  // venda: erro vira evento para o Jarvas, não bloqueio.
  const baixarEstoqueSubproduto = async (subprodutoId, qtd, nome) => {
    // Mesma chave de idempotência da baixa de produto (ver acima).
    const opId = crypto.randomUUID();
    let error = null;
    try {
      ({ error } = await supabase.rpc("baixar_estoque_subproduto", {
        p_subproduto_id: subprodutoId,
        p_qtd: qtd,
        p_op_id: opId,
      }));
    } catch (err) {
      error = { message: err?.message ?? String(err) };
    }
    if (error) {
      if (isErroDeRede(error)) {
        enfileirarOffline({ tipo: "rpc_baixar_estoque_subproduto", subprodutoId, qtd, opId });
        return { error: null, offline: true };
      }
      reportarFalha(error, { acao: "baixarEstoqueSubproduto", tabela: "estoque", subproduto_id: subprodutoId, quantidade: qtd });
      emitirEvento("estoque.baixa.falhou", "estoque", {
        subproduto_id: subprodutoId,
        nome: nome ?? null,
        quantidade: qtd,
        erro: error?.message ?? error?.code ?? String(error),
      }, currentUser?.username);
      return { error };
    }
    emitirEvento("estoque.baixa", "estoque", { subproduto_id: subprodutoId, nome: nome ?? null, quantidade: qtd }, currentUser?.username);
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
      reportarFalha(error, { acao: "setMinimoEstoque", tabela: "estoque", produto_id: productId });
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
      reportarFalha(error, { acao: "gravarConfig", tabela: "config", key });
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
    // P8 — captura o estado anterior antes do otimista para reverter no erro
    // (senão a UI mantém o mapeamento aplicado enquanto o banco não gravou).
    const anterior = categoriaGrupos;
    if (grupoId == null || grupoId === "") {
      setCategoriaGruposLocal(prev => prev.filter(r => r.category !== cat));
      const { error } = await supabase.from("categoria_grupo").delete().eq("category", cat);
      if (error) {
        reportarFalha(error, { acao: "setCategoriaGrupo", tabela: "categoria_grupo", operacao: "delete", category: cat });
        setCategoriaGruposLocal(anterior);
        return { error };
      }
      return { error: null };
    }
    const gid = Number(grupoId);
    setCategoriaGruposLocal(prev => {
      const outros = prev.filter(r => r.category !== cat);
      return [...outros, { category: cat, grupo_id: gid }];
    });
    const { error } = await supabase
      .from("categoria_grupo")
      .upsert({ category: cat, grupo_id: gid, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,category" });
    if (error) {
      reportarFalha(error, { acao: "setCategoriaGrupo", tabela: "categoria_grupo", operacao: "upsert", category: cat });
      setCategoriaGruposLocal(anterior);
      return { error };
    }
    return { error: null };
  };

  // ── Context value ─────────────────────────────────────────────
  const addLancada = (id) => setLancadas(prev => new Set([...prev, id]));

  // Fase 2 — camada de comercialização (ADR-005): única fonte de gating por
  // plano no front. Sidebar/rotas/telas novas devem checar por aqui, nunca
  // comparar tenant.planoCodigo diretamente.
  //
  // Enquanto o plano NÃO é conhecido (`tenant` ainda null: bootstrap em voo,
  // erro ao ler `tenants`/RLS, ou abertura sem internet — o snapshot offline
  // não guarda o plano) a resposta é "pode". Responder "não" aqui mentia para
  // quem paga: toda rota com `requiredModulo` virava "não está no seu plano",
  // a Sidebar escondia os módulos e o hub do Palm perdia os cartões — inclusive
  // a Cozinha, justo no cenário offline que o app promete atender. É a mesma
  // escolha já feita para a assinatura (PrivateRoute só bloqueia quando ela
  // está carregada). Com o plano em mãos, o gating volta a valer normalmente.
  const moduloHabilitadoNoPlano = (modulo) =>
    tenant ? moduloHabilitado(tenant.modulosDisponiveis, modulo) : true;
  // Fase 3 — add-ons pagos (decisão 019): equivalente para NF-e/TEF, que não
  // dependem de plano. Hooks de add-on devem checar por aqui, nunca ler
  // tenant.addonsAtivos diretamente. Add-on segue fail-CLOSED sem tenant: ao
  // contrário de um módulo, emitir NF-e/passar TEF depende do servidor de
  // qualquer jeito, e liberar por engano geraria documento fiscal indevido.
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
    currentUser, isMobile,
    lancadas, addLancada,
    // auth
    login, logout,
    // pending
    addPending, removePending, updatePending,
    // trava de edição de comanda (Leva 14)
    adquirirTrava, liberarTrava, renovarTrava,
    // products
    addProduct, updateProduct, removeProduct, recarregarProdutos,
    // sales
    addSale, cancelarVendaFechada,
    // users
    addUser, updateUser, removeUser,
    // permissões (matriz por cargo do tenant + editor)
    rolePermissions, salvarPermissoesCargo,
    // outros
    addFechamento,
    setFundoAtual, setCaixaAberto, setSessaoAbertaEm, setMeiosPagamento, updateEstoque, baixarEstoque, entradaEstoque, baixarEstoqueSubproduto, setMinimoEstoque, recarregarEstoque,
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
      <ImpressaoLancamentosBridge />
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp deve ser usado dentro de <AppProvider>");
  return ctx;
};
