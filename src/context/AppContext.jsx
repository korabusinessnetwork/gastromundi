import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import { getPermissions, mesclarPermissoes, ROLES } from "@/constants/roles";
import { useIsMobile, useIdleTimer } from "@/utils/hooks";
import { SessaoContext } from "./SessaoContext";
import { OfflineProvider, useOfflineCarga } from "./OfflineProvider";
import { useOffline } from "./OfflineContext";
import { ConfigProvider, useConfigCarga } from "./ConfigProvider";
import { useConfig } from "./ConfigContext";
import { CatalogoProvider, useCatalogoCarga } from "./CatalogoProvider";
import { useCatalogo } from "./CatalogoContext";
import { ComandasProvider, useComandasCarga } from "./ComandasProvider";
import { useComandas } from "./ComandasContext";
import { CaixaProvider, useCaixaCarga } from "./CaixaProvider";
import { useCaixa } from "./CaixaContext";
import { lerConfigDaAbertura } from "@/features/configuracoes/dados/config";
// Carga e reenvio da fila: o resto do estoque mora no CatalogoProvider.
import { listarSaldos, baixarEstoqueNoBanco, baixarEstoqueSubprodutoNoBanco } from "@/features/estoque/dados/saldos";
// Carga e reenvio da fila: o resto das vendas mora no CaixaProvider.
import {
  listarVendasDesde, listarItensDasVendas, listarPagamentosDasVendas, listarVendasLegadasDesde,
  gravarVendaNormalizada,
} from "@/features/caixa/dados/vendas";
import { listarFechamentos, listarMovimentosRecentes } from "@/features/caixa/dados/caixa";
// Carga e reenvio da fila: o resto das comandas mora no ComandasProvider.
import { listarComandas, regravarComanda, atualizarComanda, excluirComanda } from "@/features/comandas/dados/comandas";
import { listarProdutosAtivos } from "@/features/cardapio/dados/produtos";
import { listarGruposCategoria, listarCategoriaGrupos } from "@/features/cardapio/dados/gruposCategoria";
import { useFuncaoEstavel } from "@/hooks/useFuncaoEstavel";
import { obterSessaoAuth, entrarComSenha, sairDoAuth, aoMudarSessaoAuth } from "@/features/sessao/dados/auth";
import {
  buscarUsuarioAtivoPorAuth, listarUsuariosAtivos, criarUsuario, atualizarUsuario,
  excluirUsuario, listarPermissoesDosCargos, salvarPermissoesDoCargo,
} from "@/features/sessao/dados/usuarios";
import { buscarBootstrapTenant, moduloHabilitado, addonHabilitado } from "@/lib/tenant";
import { emailDoLogin } from "@/lib/tenantSlug";
import { consultarBloqueio, registrarFalha, registrarSucesso } from "@/lib/loginTentativas";
import { ehConsoleHost } from "@/lib/consoleHost";
import { sincronizarStatusAssinatura } from "@/lib/assinatura";
import { gerarVariaveisTema, aplicarVariaveisTema, limparVariaveisTema, aplicarTituloDocumento, nomeExibicaoTenant, logoUrlTenant } from "@/lib/tema";
import { layoutDoTema, varianteDoHorario, temTrocaAutomatica, variaveisDoLayout, msAteProximaTroca } from "@/layouts";
import { salvarBrandingCache } from "@/lib/brandingCache";
import { logAction } from "@/lib/logger";
import { emitirEvento } from "@/lib/jarvas";
import { executarAnaliseJarvas } from "@/lib/jarvasEngine";
import { montarVendaLegada } from "@/lib/vendas";
import { criarLancamento } from "@/lib/financeiro";
import { emitirDocumentoFiscal } from "@/lib/fiscal";
import { gerarAlertaBaixaFalhou, iniciarLoteDeBaixas, fecharLoteDeBaixas } from "@/lib/estoque";
import { sanitizeInput } from "@/utils/crypto";
import { isErroDeRede } from "@/lib/offline/rede";
import { reportarFalha, reportarInconsistencia, setTenantObservabilidade } from "@/lib/observabilidade";
import { separarCampos, COLUNAS_ESCRITA_USERS, COLUNAS_REPLAY_PENDING } from "@/lib/camposPermitidos";
import { drenarFila } from "@/lib/offline/fila";
// Fila local de operações offline (Leva 11) — singleton de módulo sobre o
// IndexedDB (F021 fatia 2): sobrevive a reload/fechamento do app e é
// compartilhada por todas as instâncias do provider (só existe uma no app
// real) e pela tela de notas emitidas, que conta as pendências fiscais
// guardadas nela. O banco responde depois do primeiro render, por isso o
// contador reassina em `assinarFilaOffline`.
import { filaOffline } from "@/lib/offline/filaApp";
import { salvarSnapshot, lerSnapshot } from "@/lib/offline/snapshot";
import IndicadorRede from "@/components/shared/IndicadorRede";
import AvisoSessao from "@/components/shared/AvisoSessao";
import PonteLocalBridge from "@/components/shared/PonteLocalBridge";
import ImpressaoLancamentosBridge from "@/components/shared/ImpressaoLancamentosBridge";
import {
  saveSession, loadSession, clearSession,
  lerSessao, atualizarUsuarioSessao, msRestantesDaSessao, esquecerTokenAuthLocal,
  perfilInativoConfirmado,
  getAttempts, setAttempts, clearAttempts,
  IDLE_MS, MAX_ATTEMPTS, LOCKOUT_MS, AVISO_INATIVIDADE_MS,
} from "@/utils/session";

const AppContext = createContext(null);

// Código Postgres de coluna inexistente: o app pediu uma coluna que a
// migration correspondente ainda não criou no banco.
const PG_COLUNA_INEXISTENTE = "42703";


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
 * Monta os provedores que já são donos do próprio estado (tarefa 2.9 do plano
 * de refatoração) por fora do provedor que ainda guarda o resto. A referência
 * do estabelecimento atual nasce aqui porque os dois lados precisam dela.
 */
export function AppProvider({ children }) {
  const tenantIdRef = useRef(null);
  // O que os provedores de fora ainda precisam ler de dentro (o usuário
  // logado). Preenchido pelo AppProviderInterno a cada render.
  const pontesRef = useRef({ currentUser: null });
  // "Recarregar os dados" é a carga da coordenação, lá dentro.
  const recarregarRef = useRef(() => {});
  // Banco sem as colunas da trava de edição (migration não aplicada): a carga
  // descobre, as travas das comandas obedecem.
  const lockIndisponivelRef = useRef(false);
  return (
    <OfflineProvider tenantIdRef={tenantIdRef} recarregarRef={recarregarRef}>
    <ConfigProvider tenantIdRef={tenantIdRef}>
      <CatalogoProvider pontesRef={pontesRef}>
        <ComandasProvider pontesRef={pontesRef} lockIndisponivelRef={lockIndisponivelRef}>
          <CaixaProvider pontesRef={pontesRef}>
            <AppProviderInterno tenantIdRef={tenantIdRef} pontesRef={pontesRef} lockIndisponivelRef={lockIndisponivelRef} recarregarRef={recarregarRef}>
              {children}
            </AppProviderInterno>
          </CaixaProvider>
        </ComandasProvider>
      </CatalogoProvider>
    </ConfigProvider>
    </OfflineProvider>
  );
}

function AppProviderInterno({ children, tenantIdRef, pontesRef, lockIndisponivelRef, recarregarRef }) {
  // ── Estado local ─────────────────────────────────────────────
  const [users,       setUsersLocal]       = useState([]);
  // F005 — sangrias e suprimentos da sessão de caixa (trilha de auditoria).
  const [tenant,          setTenantLocal]         = useState(null); // Fase 1 — camada de comercialização (ADR-005)
  // Matriz de permissões por cargo do tenant (role → mapa efetivo, já
  // mesclado sobre o default do roles.js). Vazio até o bootstrap carregar;
  // enquanto isso, o resto do app cai no getPermissions(role) do roles.js.
  const [rolePermissions, setRolePermissionsLocal] = useState({});
  const [loading,       setLoading]          = useState(true);
  // IDs de comandas com pedido lançado na sessão atual (sobrevive troca de aba)

  // ── Offline-first (Leva 11) ──────────────────────────────────
  // O offline (rede, fila, notas pendentes) mora no OfflineProvider desde a
  // tarefa 2.9. Daqui sai só a DRENAGEM, que reenvia todos os assuntos.
  const { redeOnline, abriuSemInternet, pendenciasOffline, pendenciasFiscais, enfileirarOffline } = useOffline();
  const cargaOffline = useOfflineCarga();
  const drenandoRef = useRef(false);
  // A configuração (pagamento, TEF, taxa, ponte, alertas) mora no
  // ConfigProvider desde a tarefa 2.9; daqui só se lê e se hidrata na carga.
  const {
    meiosPagamento, metodosCustom, metodosTef, taxaServico, ponteEndereco, ponteLocalAtiva,
    diasAlertaValidade, limiteSangria, setMeiosPagamento, setMetodosCustom, setMetodosTef,
    setTaxaServico, setPonteEndereco, setPonteLocalAtiva, setDiasAlertaValidade, setLimiteSangria,
  } = useConfig();
  const cargaConfig = useConfigCarga();
  // O catálogo (produtos, saldos, grupos) mora no CatalogoProvider desde a
  // tarefa 2.9. As ações dele leem o usuário e a fila offline daqui, por
  // `pontesRef`, até a sessão e o offline também mudarem de lugar.
  const {
    products, estoque, estoqueMinimos, gruposCategoria, categoriaGrupos, categoriaGrupoMap,
    addProduct, updateProduct, removeProduct, recarregarProdutos, updateEstoque, baixarEstoque,
    entradaEstoque, baixarEstoqueSubproduto, setMinimoEstoque, recarregarEstoque, setCategoriaGrupo,
  } = useCatalogo();
  const cargaCatalogo = useCatalogoCarga();
  // As comandas em aberto moram no ComandasProvider desde a tarefa 2.9.
  const {
    pending, lancadas, addPending, removePending, updatePending,
    adquirirTrava, liberarTrava, renovarTrava, addLancada,
  } = useComandas();
  const cargaComandas = useComandasCarga();
  // O caixa (vendas, fechamentos, fundo, abertura, movimentos) mora no
  // CaixaProvider desde a tarefa 2.9.
  const {
    sales, fechamentos, fundoAtual, caixaAberto, sessaoAbertaEm, movimentosCaixa,
    addSale, cancelarVendaFechada, addFechamento, registrarMovimentoCaixa,
    setFundoAtual, setCaixaAberto, setSessaoAbertaEm,
  } = useCaixa();
  const cargaCaixa = useCaixaCarga();

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

  const isMobile = useIsMobile();

  // Os dois cronômetros de segurança abaixo precisam de um callback com
  // identidade ESTÁVEL: quando ela troca, o efeito remonta e a contagem volta
  // ao zero. O callback antigo dependia de `currentUser`, que troca de
  // identidade a cada refresh da lista de usuários (efeito [users]) — então num
  // turno movimentado os 30 minutos de inatividade nunca chegavam ao fim.
  // O ref sempre aponta para o `logout` da última renderização.
  const logoutRef = useRef(null);
  const logoutCallback = useCallback(() => { logoutRef.current?.(); }, []);
  // Aviso 2 minutos antes de a inatividade derrubar a sessão. O callback é
  // estável pela mesma razão do `logoutCallback`: se mudar de identidade, o
  // cronômetro reinicia e ninguém nunca chega aos 30 minutos.
  const [avisoSessaoVisivel, setAvisoSessaoVisivel] = useState(false);
  const aoAvisarSessao = useCallback((visivel) => setAvisoSessaoVisivel(visivel), []);
  useIdleTimer(logoutCallback, IDLE_MS, !!currentUser, aoAvisarSessao, AVISO_INATIVIDADE_MS);

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
    obterSessaoAuth().then(async ({ data: { session } }) => {
      if (session && lerSessao().estado === "expirada") {
        // Teto de 8 horas vencido. O refresh token do Supabase vive muito mais
        // que isso, então sem este ramo bastava dar F5 para o `saveSession`
        // logo abaixo carimbar um `at` novo e o teto nunca valer nada. Derruba
        // a sessão do Auth também, senão o próximo carregamento reabre tudo.
        tenantIdRef.current = null;
        setCurrentUser(null);
        clearSession();
        await sairDoAuth();
        setLoading(false);
        return;
      }
      if (session) {
        tenantIdRef.current = session.user?.app_metadata?.tenant_id ?? null;
        const { usuario: userData, erro: erroPerfil } = await buscarDadosUsuario(session.user.id);
        if (userData) {
          setCurrentUser(userData);
          // Preserva o relógio quando esta aba já tem sessão; só carimba um
          // `at` novo quando é aba nova (aí é começo de sessão de verdade).
          if (!atualizarUsuarioSessao(userData)) saveSession(userData);
          await bootstrap();
        } else if (loadSession() && (isErroDeRede(erroPerfil) || (typeof navigator !== "undefined" && navigator.onLine === false))) {
          // Sem internet a busca do usuário falha mesmo com sessão válida.
          // A sessão local basta para operar: o bootstrap hidrata do
          // snapshot e o app segue offline em vez de travar no login.
          //
          // São dois sinais porque só o do navegador não pega o caso mais
          // comum do restaurante: roteador de pé e link do provedor caído. Aí
          // `navigator.onLine` continua `true` e quem denuncia a queda é o
          // próprio erro desta leitura, que saiu pelo mesmo caminho de rede
          // que todas as outras. Sem isso o app parava aqui, o bootstrap nunca
          // rodava e nada carimbava "abriu sem internet".
          //
          // Erro que NÃO é de rede (o banco respondeu, só não achou usuário
          // ativo) segue caindo nos ramos de baixo: este ramo nunca decide
          // conta desativada, e falha de rede nunca vira logout.
          await bootstrap();
        } else if (perfilInativoConfirmado(erroPerfil)) {
          // O JWT ainda vale, mas o banco respondeu com CERTEZA que não há
          // usuário ativo para ele: a conta foi desativada (ou apagada) desde
          // o login. Antes este ramo só fazia `setLoading(false)` — e como o
          // `currentUser` é semeado do sessionStorage lá em cima, a pessoa
          // desativada seguia com a tela montada e as permissões antigas até
          // fechar a aba (o PrivateRoute só olha `currentUser`). Derrubar o
          // token junto é o que impede o F5 de reabrir tudo.
          tenantIdRef.current = null;
          setCurrentUser(null);
          clearSession();
          await sairDoAuth();
          setLoading(false);
        } else {
          // Não deu para ler o perfil (rede/servidor). Não dá para afirmar que
          // a conta caiu, então a sessão fica de pé — derrubar aqui viraria
          // logout aleatório no meio do turno.
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

    const { data: { subscription } } = aoMudarSessaoAuth(async (event) => {
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
  // Devolve `{ usuario, erro }` em vez de só o usuário: sem o erro, quem chama
  // não consegue separar "não existe usuário ativo com este auth_id" (conta
  // desativada → derrubar a sessão) de "a leitura falhou" (rede instável →
  // manter). Ver `perfilInativoConfirmado`.
  async function buscarDadosUsuario(authId) {
    const selecionar = (cols) =>
      buscarUsuarioAtivoPorAuth(authId, cols);
    let { data, error } = await selecionar("id,name,username,role,auth_id,permissions");
    if (error?.code === "42703") {
      permsColunaIndisponivelRef.current = true;
      ({ data, error } = await selecionar("id,name,username,role,auth_id"));
    }
    if (!data) return { usuario: null, erro: error ?? null };
    const override = data.permissions ?? null;
    return {
      usuario: {
        ...data,
        permissoesOverride: override,
        permissions: mesclarPermissoes(getPermissions(data.role), override),
      },
      erro: null,
    };
  }

  // TD009 (etapa 2) — leituras vêm de vendas/venda_itens/venda_pagamentos
  // (remontadas no shape legado via montarVendaLegada). Etapa 3: `sales` não
  // recebe mais escrita nenhuma; a query antiga fica só como fallback de
  // resiliência, e cobre o período anterior ao corte.
  async function buscarSalesData() {
    const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const COLUNAS_BASE = "id,comanda,mesa,subtotal,taxa_servico,valor_taxa,valor_ajuste,total,cashier,at";
      const lerVendas = (colunas) => listarVendasDesde(colunas, desde);

      let { data: vendasData, error: eVendas } = await lerVendas(
        `${COLUNAS_BASE},cancelada,motivo_cancelamento,cancelada_por,cancelada_em`
      );
      // Migration 20260920 ainda não aplicada: relê sem as colunas de
      // cancelamento em vez de cair no fallback de `sales`, que hoje só tem
      // o histórico antigo — sem isso, um banco desatualizado sumiria com as
      // vendas do dia na tela do caixa.
      if (eVendas?.code === PG_COLUNA_INEXISTENTE) {
        console.warn("[bootstrap] colunas de cancelamento ausentes em vendas (migration 20260920 pendente)");
        ({ data: vendasData, error: eVendas } = await lerVendas(COLUNAS_BASE));
      }
      if (eVendas) throw eVendas;

      const ids = (vendasData ?? []).map(v => v.id);
      let itensData = [], pagamentosData = [];
      if (ids.length > 0) {
        const [itensRes, pagamentosRes] = await Promise.all([
          listarItensDasVendas(ids),
          listarPagamentosDasVendas(ids),
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
      const { data: salesData, error: eSales } = await listarVendasLegadasDesde(desde);
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
    const res = await listarComandas(`${COLUNAS_PENDING},${COLUNAS_TRAVA}`);
    if (res.error?.code === "42703") {
      lockIndisponivelRef.current = true;
      return listarComandas(COLUNAS_PENDING);
    }
    return res;
  }

  // Usuários do tenant. Tenta incluir a coluna de override (permissions); se
  // a migration 20260828 ainda não rodou (42703), marca a coluna como
  // indisponível e repete sem ela — o bootstrap não pode quebrar por causa
  // de uma feature opcional (mesmo padrão de buscarPendingData/Leva 14).
  const COLUNAS_USERS = "id,name,username,role,auth_id,active";
  // Colunas de retorno das ESCRITAS em `users`. `.select()` sem argumento é
  // `select *`, que o CLAUDE.md proíbe em tabela sensível: trazia de volta
  // tudo que a linha tiver, incluindo o que a tela nem usa (hoje `tenant_id`,
  // amanhã o que a próxima migration acrescentar). `permissions` entra só
  // quando a migration 20260828 já rodou, mesmo critério de `buscarUsers`.
  const colunasRetornoUsers = () =>
    permsColunaIndisponivelRef.current ? COLUNAS_USERS : `${COLUNAS_USERS},permissions`;
  async function buscarUsers() {
    const res = await listarUsuariosAtivos(`${COLUNAS_USERS},permissions`);
    if (res.error?.code === "42703") {
      permsColunaIndisponivelRef.current = true;
      return listarUsuariosAtivos(COLUNAS_USERS);
    }
    return res;
  }

  // Matriz de permissões por cargo do tenant. Qualquer erro (tabela ausente
  // antes da migration, RLS, rede) resolve para lista vazia → o app usa o
  // default do roles.js. Nunca lança, nunca bloqueia o bootstrap.
  async function buscarRolePermissions() {
    try {
      const res = await listarPermissoesDosCargos();
      if (res.error) return { data: [] };
      return res;
    } catch {
      return { data: [] };
    }
  }

  // ── Fetch inicial do Supabase (só roda autenticado) ───────────
  // O `loading` liga AQUI, e não só no `useState(true)` da montagem. No login
  // o app já tinha aberto sem sessão e desligado o loading; o bootstrap então
  // rodava com a tela montada e `loading === false`, e quem lê isso como
  // "terminou de abrir" (a aba Pedidos sem Internet) anunciava "não deu para
  // carregar o ajuste" com o ajuste ainda a caminho. Nas outras três chamadas
  // — restauração de sessão ao carregar a página — o loading já está ligado,
  // então lá isto não muda nada e nenhuma tela pisca no meio da sessão.
  // O `finally` é o que garante a volta: bootstrap que lance no meio (storage
  // bloqueado, promessa rejeitada) não pode deixar o caixa preso em
  // "Conectando ao caixa…" nem a tela da Ponte em "Carregando…" para sempre.
  async function bootstrap() {
    setLoading(true);
    // Cada carga recomeça sem o carimbo de "abriu sem internet": um bootstrap
    // que agora deu certo (login depois de a conexão voltar) não pode deixar a
    // tela dizendo que o estabelecimento está sem rede.
    cargaOffline.definirAbriuSemInternet(false);
    try {
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
        { data: movimentosData, error: eMovimentos },
      ] = await Promise.all([
        listarProdutosAtivos(),
        buscarPendingData(),
        // Bootstrap limitado a 90 dias — relatórios de período maior devem consultar sob demanda.
        buscarSalesData(),
        buscarUsers(),
        listarFechamentos(),
        lerConfigDaAbertura(),
        listarSaldos(),
        // Fases 1-2 — camada de comercialização (ADR-005): nunca lança, então nunca bloqueia o resto do bootstrap.
        buscarBootstrapTenant(),
        // C3 — grupos de categoria (Radar de Oportunidades no Palm)
        listarGruposCategoria(),
        listarCategoriaGrupos(),
        // Permissões por cargo do tenant (matriz editável, decisão 017).
        buscarRolePermissions(),
        // F005 — sangrias/suprimentos. Campos nomeados: tabela de caixa não
        // aceita `select *`. Só a janela recente interessa (a conta é sempre
        // da sessão aberta), então limita em vez de arrastar o histórico.
        listarMovimentosRecentes(200),
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
      if (eMovimentos) console.error("[bootstrap] caixa_movimentos error:", eMovimentos);

      // ── Offline (Leva 11): sem internet, hidrata do último snapshot ──
      // e deixa o PDV operar; os pedidos entram na fila local.
      if (isErroDeRede(eProducts) || isErroDeRede(ePending)) {
        // Quem viu a rede cair foi AQUI, não o `navigator.onLine`: é este erro
        // que manda o app operar com o que já estava salvo. Marca antes de
        // olhar o snapshot porque o fato vale mesmo quando não há snapshot
        // nenhum para hidratar — em ambos os casos o banco ficou fora de
        // alcance e o que não veio agora não vem sozinho.
        //
        // Chegar até aqui com o roteador de pé e o link do provedor caído
        // depende do ramo lá em cima que chama o bootstrap quando a leitura do
        // perfil falha por rede e existe sessão local salva — sem ele a
        // restauração parava antes e este trecho nunca rodava nesse cenário.
        cargaOffline.definirAbriuSemInternet(true);
        const snapshot = lerSnapshot(window.localStorage, tenantIdRef.current);
        if (snapshot) {
          if (snapshot.products?.length) cargaCatalogo.definirProdutos(snapshot.products);
          if (snapshot.pending)          cargaComandas.definirComandas(snapshot.pending);
          if (snapshot.estoque)          cargaCatalogo.definirSaldos(snapshot.estoque);
          if (snapshot.estoqueMinimos)   cargaCatalogo.definirMinimos(snapshot.estoqueMinimos);
          const config = snapshot.config ?? {};
          if (config.caixaAberto !== undefined) cargaCaixa.definirCaixaAberto(!!config.caixaAberto);
          if (config.sessaoAbertaEm)            cargaCaixa.definirSessaoAbertaEm(config.sessaoAbertaEm);
          if (config.fundoAtual !== undefined)  cargaCaixa.definirFundo(Number(config.fundoAtual));
          cargaConfig.hidratarDoSnapshot(config);
        }
        return; // o `finally` lá embaixo é quem desliga o loading
      }

      if (gruposData)   cargaCatalogo.definirGruposCategoria(gruposData);
      if (catGrupoData) cargaCatalogo.definirCategoriaGrupos(catGrupoData);
      if (movimentosData) cargaCaixa.definirMovimentos(movimentosData);

      if (productsData?.length)    cargaCatalogo.definirProdutos(productsData);
      if (pendingData)             cargaComandas.definirComandas(pendingData);
      if (salesData)               cargaCaixa.definirVendas(salesData);
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
      if (fechamentosData)         cargaCaixa.definirFechamentos(fechamentosData.map(r => r.data));

      const qtds = {}, minimos = {};
      if (estoqueData) {
        for (const row of estoqueData) {
          qtds[row.produto_id]    = Number(row.quantidade);
          minimos[row.produto_id] = Number(row.minimo);
        }
        cargaCatalogo.definirSaldos(qtds);
        cargaCatalogo.definirMinimos(minimos);
      }

      if (configData) {
        const fundo  = configData.find(c => c.key === "fundo_atual");
        const caixa  = configData.find(c => c.key === "caixa_aberto");
        const sessao = configData.find(c => c.key === "sessao_aberta_em");
        if (fundo)   cargaCaixa.definirFundo(Number(fundo.value));
        if (caixa)   cargaCaixa.definirCaixaAberto(caixa.value === true || caixa.value === "true");
        if (sessao?.value) cargaCaixa.definirSessaoAbertaEm(sessao.value);
        cargaConfig.hidratarDaCarga(configData);
      }

      if (tenantData) {
        setTenantLocal(tenantData);
        // Observabilidade: registra o UUID do tenant (NUNCA nome/marca/PII)
        // para taguear os eventos do Sentry por estabelecimento (multi-tenant).
        setTenantObservabilidade(tenantData.id ?? null);
        // Fase 4 — camada de comercialização (ADR-006): sincroniza o CACHE
        // de status no banco (telas administrativas). Continua sem bloquear
        // o bootstrap, mas a RESPOSTA agora é adotada: o status que veio do
        // `buscarBootstrapTenant` foi calculado no navegador, então depende
        // do relógio da máquina do caixa; o do banco é o que a RLS usa. Só
        // depois desta confirmação o `PrivateRoute` pode mostrar a tela de
        // bloqueio — era daqui que vinha o bloqueio falso logo após o login,
        // que sumia ao recarregar.
        if (tenantData.id) {
          sincronizarStatusAssinatura(tenantData.id)
            .then(({ data: statusServidor, error }) => {
              if (error) console.error("[bootstrap] falha ao sincronizar status da assinatura:", error);
              setTenantLocal((anterior) => {
                if (!anterior?.assinatura) return anterior;
                return {
                  ...anterior,
                  assinatura: {
                    ...anterior.assinatura,
                    status: statusServidor ?? anterior.assinatura.status,
                    statusConfirmado: true,
                  },
                };
              });
            })
            .catch((err) => {
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
            ponteLocalAtiva: configMap.ponte_local_ativa === true || configMap.ponte_local_ativa === "true",
          },
        }, tenantData?.id ?? tenantIdRef.current);
      }
    } finally {
      setLoading(false);
    }
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

  // ── Offline-first (Leva 11): reenvio da fila local ───────────
  // Replay de uma operação guardada. Insert vira UPSERT por id: se a
  // primeira tentativa gravou mas a resposta se perdeu na queda de rede,
  // reenviar não duplica nem estoura chave única.
  const executarOpOffline = (op) => {
    if (op.tipo === "insert") return regravarComanda(op.payload);
    // A operação dormiu no localStorage até a rede voltar, e o navegador deixa
    // qualquer um editar o localStorage. Filtrar de novo na saída custa nada e
    // garante que o que volta da fila tem a mesma forma do que entrou nela.
    if (op.tipo === "update") {
      const { campos } = separarCampos(op.changes, COLUNAS_REPLAY_PENDING);
      return atualizarComanda(op.id, campos);
    }
    if (op.tipo === "delete") return excluirComanda(op.id);
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
      return baixarEstoqueNoBanco(op.produtoId, op.qtd, op.opId ?? null);
    }
    if (op.tipo === "rpc_baixar_estoque_subproduto") {
      return baixarEstoqueSubprodutoNoBanco(op.subprodutoId, op.qtd, op.opId ?? null);
    }
    if (op.tipo === "insert_lancamento") return criarLancamento(op.dados, op.usuario);
    // Nota que não saiu (rede caiu, SEFAZ fora do ar, Edge indisponível) não
    // pode sumir: a venda está registrada e a obrigação fiscal continua de pé.
    if (op.tipo === "emitir_nfce") return reemitirNfceOffline(op);
    return Promise.resolve({ error: null }); // tipo desconhecido — descarta
  };

  // Reemissão da NFC-e de uma venda cuja primeira tentativa nem chegou ao
  // servidor. Seguro repetir: a emissão é IDEMPOTENTE por vendaId no servidor
  // (ver nfceIdempotencia) — venda com nota já autorizada recebe a mesma nota
  // de volta, nunca sai uma segunda.
  const reemitirNfceOffline = async (op) => {
    const resultado = await emitirDocumentoFiscal(op.venda, { usuario: op.usuario });
    // Desfecho conclusivo (autorizada, rejeitada, ou pendente em contingência):
    // a nota tem destino e agora existe em nfce_emitidas — sai da fila.
    if (["autorizada", "rejeitada", "pendente"].includes(resultado?.status)) return { error: null };
    // "erro" (rede/servidor) e "sem_chave" (config fiscal incompleta): a nota
    // FICA na fila. Devolve um erro que `isErroDeRede` reconhece para o dreno
    // parar aqui em vez de descartar a nota como falha definitiva — insistir a
    // cada tentativa é justamente o que se quer de uma pendência fiscal.
    return { error: { message: "fetch failed", motivo_fiscal: resultado?.status ?? "erro" } };
  };

  // TD009 (etapa 3) — o reenvio grava só nas tabelas relacionais. `sales`
  // não recebe mais venda nenhuma.
  //
  // Idempotência (fecha a pendência 6 do ADR-013): o cabeçalho em `vendas`
  // bate em violação de unicidade quando a venda já subiu, e as filhas não
  // são reinseridas. Antes, o `upsert` protegia a LINHA mas não o EVENTO —
  // cada passada do dreno reemitia `venda.finalizada` e o Jarvas via a
  // mesma venda várias vezes. Agora o evento só sai quando a venda foi
  // gravada de fato.
  const reenviarVendaOffline = async (op) => {
    const sale = op.payload.data;
    const resultado = await gravarVendaNormalizada(sale, {
      onFalha: ({ etapa, error: e, venda_id }) => {
        // Rede caiu no meio do dreno: a op fica na fila e volta na próxima
        // passada. Isso é o dreno funcionando, não inconsistência de dado.
        if (isErroDeRede(e)) return;
        console.error(`gravação de venda (${etapa}) venda ${venda_id}:`, e);
        reportarFalha(e, { acao: "persistirVendaNormalizada", etapa, tabela: "vendas", venda_id, origem: "reenvioOffline" });
        emitirEvento("venda.gravacao.incompleta", "pdv", {
          venda_id,
          etapa,
          erro: e?.message ?? e?.code ?? String(e),
        }, currentUser?.username);
      },
    });

    // Cabeçalho não gravou = a venda não existe. Devolve o erro para o dreno
    // decidir: erro de rede para a fila inteira e preserva a venda; erro
    // definitivo (RLS, constraint) tira a op e vira aviso na tela.
    if (!resultado.cabecalhoGravado) {
      return { error: resultado.falhas[0]?.error ?? { message: "falha ao gravar a venda reenviada" } };
    }

    // Cabeçalho gravou e alguma filha falhou: a venda EXISTE e está
    // incompleta. Manter na fila reprocessaria só o cabeçalho (unicidade),
    // sem nunca consertar a filha — então a op sai e a inconsistência já
    // foi registrada pelo onFalha acima.
    if (!resultado.jaExistia) {
      emitirEvento("venda.finalizada", "pdv", {
        venda_id: sale.id,
        total: sale.total ?? null,
        metodo: sale.metodo ?? sale.payment ?? null,
        itens: Array.isArray(sale.items) ? sale.items.length : null,
      }, currentUser?.username);
    }
    return { error: null };
  };

  const drenarPendenciasOffline = async () => {
    if (drenandoRef.current || filaOffline.tamanho() === 0) return;
    drenandoRef.current = true;
    try {
      const { falhas } = await drenarFila({ fila: filaOffline, executar: executarOpOffline, isErroDeRede, tenantAtual: tenantIdRef.current });
      // Um drain que descarta várias baixas de uma vez é a cara da falha
      // sistêmica: o lote junta tudo num alerta só em vez de encher o painel
      // do Jarvas com um cartão por produto da fila.
      iniciarLoteDeBaixas();
      try {
        for (const { op, error } of falhas) {
          console.error("[offline] operação descartada no reenvio:", op.tipo, error?.message);
          // Falha NÃO-rede ao drenar: a op foi descartada (não é reenfileirada)
          // e aqui mora a não-idempotência do estoque / evento reemitido. É bug
          // silencioso — reporta com o tipo da op (drenarFila já separou rede).
          reportarFalha(error, { acao: "drenarPendenciasOffline", op: op?.tipo });
          // Baixa recusada no reenvio é o MESMO furo de inventário do TD012: a
          // venda saiu, o estoque não desceu, e a op foi descartada de vez. Sem
          // este alerta o buraco só aparece na contagem física — Sentry e evento
          // são para quem desenvolve, o Jarvas é o que o gestor abre.
          if (op?.tipo === "rpc_baixar_estoque") {
            const produto = products.find(p => String(p.id) === String(op.produtoId));
            void gerarAlertaBaixaFalhou(
              { produtoId: op.produtoId, nome: produto?.name ?? null, quantidade: op.qtd, erro: error },
              currentUser?.username,
            );
          } else if (op?.tipo === "rpc_baixar_estoque_subproduto") {
            void gerarAlertaBaixaFalhou(
              { subprodutoId: op.subprodutoId, nome: op.nome ?? null, quantidade: op.qtd, erro: error },
              currentUser?.username,
            );
          }
        }
      } finally {
        void fecharLoteDeBaixas(currentUser?.username);
      }
    } finally {
      drenandoRef.current = false;
      cargaOffline.definirPendencias(filaOffline.tamanho());
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

    // O contador local responde na hora e não custa viagem, então ele continua
    // sendo a primeira parada. Ele não é mais a barreira, é o eco da última
    // resposta do servidor: quem limpar o storage passa daqui e esbarra na
    // consulta abaixo, que é a que decide de verdade (TD008).
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

    // A barreira de verdade: o contador do banco, que o navegador não alcança.
    // Vem antes do `signInWithPassword` para bloqueio não gastar viagem à rede
    // de auth. Se a RPC não responder, `disponivel` vem false e o login segue
    // pelo contador local, como era antes (falha aberta, decisão do spec).
    const bloqueio = await consultarBloqueio(email);
    if (bloqueio.disponivel && bloqueio.bloqueado) {
      setAttempts(clean, { count: MAX_ATTEMPTS, lockedUntil: Date.now() + bloqueio.segundos * 1000 });
      return { error: `Conta bloqueada. Aguarde ${bloqueio.segundos}s.` };
    }

    const { data: authData, error: authError } = await entrarComSenha(email, sanitizeInput(password, 100));

    if (authError) {
      // Quem conta é o servidor; o local só guarda o que ele respondeu, para os
      // pips da tela terem o número certo antes da próxima ida ao banco.
      const servidor = await registrarFalha(email);
      const count = servidor.disponivel && servidor.restantes !== null
        ? MAX_ATTEMPTS - servidor.restantes
        : (att.count || 0) + 1;
      const lockedUntil = servidor.disponivel
        ? (servidor.bloqueado ? Date.now() + servidor.segundos * 1000 : null)
        : (count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null);

      setAttempts(clean, { count, lockedUntil });
      if (lockedUntil) return { error: "Muitas tentativas. Bloqueado por 2 minutos." };
      return { error: `Usuário ou senha incorretos. ${Math.max(MAX_ATTEMPTS - count, 0)} tentativa(s) restante(s).` };
    }

    // Senha certa: zera o contador do servidor. Só agora dá para chamar, porque
    // a função tira a identidade do token da sessão que acabou de nascer.
    registrarSucesso();

    const { usuario: userData } = await buscarDadosUsuario(authData.user.id);
    if (!userData) {
      await sairDoAuth();
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
    const { error } = await sairDoAuth();
    if (error) esquecerTokenAuthLocal();
    return { error: error ?? null };
  };
  // É por aqui que os cronômetros de inatividade e do teto de 8h chamam o
  // logout: eles guardam um callback estável e leem sempre a versão atual.
  logoutRef.current = logout;

  // ── Actions: Users ────────────────────────────────────────────
  const addUser = async (user) => {
    // omite id (gerado pelo banco). `permissions` agora É persistido: é o
    // OVERRIDE do funcionário (parcial; null = segue o cargo). Se a coluna
    // ainda não existe (migration 20260828 pendente), some do payload
    // (fail-open) e o usuário nasce seguindo o cargo.
    // A allowlist substitui o `const { id: _ignored, ...payload }` que havia
    // aqui: tirar só o `id` deixava passar qualquer outra chave que o objeto
    // trouxesse, `tenant_id` inclusive. Ver src/lib/camposPermitidos.js.
    const { campos: payload, ignorados } = separarCampos(user, COLUNAS_ESCRITA_USERS);
    if (ignorados.length > 0) {
      reportarInconsistencia("escrita com coluna fora da allowlist", { acao: "addUser", tabela: "users", ignorados });
    }
    if (permsColunaIndisponivelRef.current) delete payload.permissions;
    const { data, error } = await criarUsuario(payload, colunasRetornoUsers());
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
    const { campos: payload, ignorados } = separarCampos(changes, COLUNAS_ESCRITA_USERS);
    if (ignorados.length > 0) {
      reportarInconsistencia("escrita com coluna fora da allowlist", { acao: "updateUser", tabela: "users", id, ignorados });
    }
    if (permsColunaIndisponivelRef.current) delete payload.permissions;
    // .select() após o update: PostgREST retorna sucesso HTTP com 0 linhas
    // quando a RLS filtra tudo (ex.: editor aberto para gerente, mas a
    // policy users_update exige admin) OU quando o id não bate. Sem checar
    // as linhas retornadas, a UI "atualizava" o estado local e fingia
    // sucesso sem nada persistir no banco.
    const { data, error } = await atualizarUsuario(id, payload, colunasRetornoUsers());
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "updateUser", tabela: "users", id });
      return {
        error: {
          code: "no_rows_updated",
          message: "Nenhuma linha atualizada, sem permissão (apenas admin edita usuários) ou usuário inexistente.",
        },
      };
    }
    setUsersLocal(prev => prev.map(u => {
      if (u.id !== id) return u;
      // Espelha o que FOI ao banco (payload), não o que o chamador pediu
      // (changes): com a allowlist, os dois podem diferir, e a tela mostrando
      // campo que não foi gravado é o "sucesso falso" que o resto desta
      // função existe para evitar.
      const merged = { ...u, ...payload };
      // Se o override veio nesta edição, adota-o (null = volta a seguir o
      // cargo); senão, preserva o override que o usuário já tinha.
      const override = Object.prototype.hasOwnProperty.call(payload, "permissions")
        ? (payload.permissions ?? null)
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
    const { data, error } = await excluirUsuario(id);
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "removeUser", tabela: "users", id });
      return { error: { code: "no_rows_deleted", message: "Nenhuma linha removida, sem permissão (apenas admin remove usuários) ou usuário inexistente." } };
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
    if (!tenant?.id) return { error: { message: "Estabelecimento ainda carregando, tente de novo." } };
    const payload = {
      tenant_id: tenant.id,
      role,
      permissions: permissoesCompletas,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await salvarPermissoesDoCargo(payload);
    if (error) return { error };
    if (!data || data.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "salvarPermissoesCargo", tabela: "role_permissions", role });
      return { error: { code: "no_rows_updated", message: "Nenhuma linha gravada, só um administrador edita permissões de cargo." } };
    }
    const efetivoCargo = mesclarPermissoes(getPermissions(role), permissoesCompletas);
    const novoMapa = { ...rolePermissions, [role]: efetivoCargo };
    setRolePermissionsLocal(novoMapa);
    setUsersLocal(prev => prev.map(u => (
      u.role !== role ? u : { ...u, permissions: mesclarPermissoes(efetivoCargo, u.permissoesOverride) }
    )));
    return { error: null };
  };

  // Pontes para os provedores de fora (ver AppProvider). Layout effect: as
  // ações só são chamadas depois do render, quando isto já está atualizado.
  useLayoutEffect(() => {
    pontesRef.current = { currentUser };
    recarregarRef.current = bootstrap;
  });

  // ── Context value ─────────────────────────────────────────────

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

  // Aplica a identidade recém-salva sem refazer o bootstrap (S1-3).
  // Mescla SÓ `tema`: a linha crua que a RPC devolve não tem o que o
  // `buscarBootstrapTenant` enriquece (assinatura, módulos do plano,
  // add-ons). Trocar o objeto inteiro apagaria isso e derrubaria o gating
  // de módulo e a aba "Minha assinatura" até o próximo F5.
  const aplicarTenantSalvo = useCallback((linhaDoTenant) => {
    if (!linhaDoTenant || typeof linhaDoTenant !== "object") return;
    setTenantLocal((anterior) => (anterior ? { ...anterior, tema: linhaDoTenant.tema ?? null } : anterior));
  }, []);

  // ── Fatia da sessão (tarefa 2.2) ──────────────────────────────
  // Valor memorizado: só muda quando muda um DADO da sessão. As ações têm
  // identidade fixa (useFuncaoEstavel) e chamam sempre a versão atual.
  const loginEstavel                 = useFuncaoEstavel(login);
  const logoutEstavel                = useFuncaoEstavel(logout);
  const addUserEstavel               = useFuncaoEstavel(addUser);
  const updateUserEstavel            = useFuncaoEstavel(updateUser);
  const removeUserEstavel            = useFuncaoEstavel(removeUser);
  const salvarPermissoesCargoEstavel = useFuncaoEstavel(salvarPermissoesCargo);
  const moduloHabilitadoEstavel      = useFuncaoEstavel(moduloHabilitadoNoPlano);
  const addonHabilitadoEstavel       = useFuncaoEstavel(addonHabilitadoNoTenant);
  const valorSessao = useMemo(() => ({
    // `loading` é a carga do estabelecimento depois do login; `isMobile`, a
    // largura da tela. Os dois valem para o app inteiro e mudam raramente.
    loading, isMobile,
    currentUser, users, tenant,
    assinatura: tenant?.assinatura ?? null,
    rolePermissions,
    // Mudam junto com `tenant`, que está nas dependências: quem consulta o
    // plano é redesenhado quando o plano muda.
    moduloHabilitado: moduloHabilitadoEstavel,
    addonHabilitado: addonHabilitadoEstavel,
    aplicarTenantSalvo,
    login: loginEstavel, logout: logoutEstavel,
    addUser: addUserEstavel, updateUser: updateUserEstavel, removeUser: removeUserEstavel,
    salvarPermissoesCargo: salvarPermissoesCargoEstavel,
  }), [loading, isMobile, currentUser, users, tenant, rolePermissions, aplicarTenantSalvo,
    moduloHabilitadoEstavel, addonHabilitadoEstavel, loginEstavel, logoutEstavel,
    addUserEstavel, updateUserEstavel, removeUserEstavel, salvarPermissoesCargoEstavel]);

  const value = {
    loading,
    // dados
    products, pending, sales, users, fechamentos, fundoAtual, caixaAberto, sessaoAbertaEm, meiosPagamento, estoque, estoqueMinimos,
    tenant, moduloHabilitado: moduloHabilitadoNoPlano, addonHabilitado: addonHabilitadoNoTenant,
    // Aplica no estado o tenant que a RPC de identidade acabou de devolver
    // (S1-3). Sem isto, o dono salvaria o logo e a sidebar continuaria com a
    // marca antiga até um F5 — parecendo que não salvou. O efeito de tema
    // depende de `tenant`, então a troca repinta sozinha.
    aplicarTenantSalvo,
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
    movimentosCaixa, registrarMovimentoCaixa,
    limiteSangria, setLimiteSangria,
    // C3 — grupos de categoria (radar do Palm + mapeamento em Configurações)
    gruposCategoria, categoriaGrupos, categoriaGrupoMap, setCategoriaGrupo,
    metodosCustom, setMetodosCustom,
    metodosTef, setMetodosTef,
    // offline-first (Leva 11)
    // `abriuSemInternet` = a última carga caiu no caminho offline (o banco não
    // respondeu). Vale junto com o `redeOnline`, nunca no lugar dele: o
    // navegador se diz online com o link do provedor caído.
    redeOnline, abriuSemInternet, pendenciasOffline, enfileirarOffline, pendenciasFiscais,
    // Refaz a carga do estabelecimento a pedido de uma pessoa — é o mesmo
    // caminho da abertura do sistema. Serve para quando o link do provedor
    // volta sem este computador ter perdido a rede: o navegador não avisa
    // nada, então quem avisa é o dono, pela tela. Zera o carimbo no começo e
    // só o religa se a leitura esbarrar em rede de novo. Nada a chama sozinho.
    recarregarDadosDoEstabelecimento: bootstrap,
    // ponte local (Leva 13)
    ponteEndereco, setPonteEndereco,
    // `null` enquanto o bootstrap não respondeu = "ainda não sei".
    ponteLocalAtiva, setPonteLocalAtiva,
  };

  return (
    <AppContext.Provider value={value}>
      <SessaoContext.Provider value={valorSessao}>
      {children}
      <IndicadorRede online={redeOnline} pendencias={pendenciasOffline} visivel={!!currentUser} />
      {/* O clique no botão já conta como atividade (o useIdleTimer escuta
          `click` na captura, o que zera a contagem); esconder aqui é só para o
          aviso sumir na hora, sem depender da propagação do evento. */}
      <AvisoSessao
        visivel={!!currentUser && avisoSessaoVisivel}
        totalMs={AVISO_INATIVIDADE_MS}
        onContinuar={() => setAvisoSessaoVisivel(false)}
      />
      <PonteLocalBridge />
      <ImpressaoLancamentosBridge />
      </SessaoContext.Provider>
    </AppContext.Provider>
  );
}

// Movido para o CatalogoProvider na tarefa 2.9; reexportado por causa do teste.
export { aplicarNumeroRemoto } from "./CatalogoProvider";

// Os ganchos de cada assunto (fase 2 do plano de refatoração). As telas
// importam daqui, para continuar existindo uma porta só para o contexto e os
// testes continuarem dublando um módulo só.
export { useSessao } from "./SessaoContext";
export { useOffline } from "./OfflineContext";
export { useConfig } from "./ConfigContext";
export { useCatalogo } from "./CatalogoContext";
export { useComandas } from "./ComandasContext";
export { useCaixa } from "./CaixaContext";

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp deve ser usado dentro de <AppProvider>");
  return ctx;
};
