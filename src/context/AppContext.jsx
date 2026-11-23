import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react";
import { getPermissions, mesclarPermissoes, ROLES } from "@/constants/roles";
import { SessaoProvider, useSessaoCarga, COLUNAS_USERS } from "./SessaoProvider";
import { useSessao } from "./SessaoContext";
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
  listarVendasDesde, listarItensDasVendas, listarPagamentosDasVendas, listarVendasLegadasDesde, gravarVendaNormalizada
} from "@/features/caixa/dados/vendas";
import { listarFechamentos, listarMovimentosRecentes } from "@/features/caixa/dados/caixa";
// Carga e reenvio da fila: o resto das comandas mora no ComandasProvider.
import { listarComandas, regravarComanda, atualizarComanda, excluirComanda } from "@/features/comandas/dados/comandas";
import { listarProdutosAtivos } from "@/features/cardapio/dados/produtos";
import { listarGruposCategoria, listarCategoriaGrupos } from "@/features/cardapio/dados/gruposCategoria";
import {
  listarUsuariosAtivos, listarPermissoesDosCargos
} from "@/features/sessao/dados/usuarios";
import { buscarBootstrapTenant } from "@/lib/tenant";
import { sincronizarStatusAssinatura } from "@/lib/assinatura";
import { emitirEvento } from "@/lib/jarvas";
import { executarAnaliseJarvas } from "@/lib/jarvasEngine";
import { montarVendaLegada } from "@/lib/vendas";
import { criarLancamento } from "@/lib/financeiro";
import { emitirDocumentoFiscal } from "@/lib/fiscal";
import { gerarAlertaBaixaFalhou, iniciarLoteDeBaixas, fecharLoteDeBaixas } from "@/lib/estoque";
import { isErroDeRede } from "@/lib/offline/rede";
import { reportarFalha, setTenantObservabilidade } from "@/lib/observabilidade";
import { separarCampos, COLUNAS_REPLAY_PENDING } from "@/lib/camposPermitidos";
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
import PonteLocalBridge from "@/components/shared/PonteLocalBridge";
import ImpressaoLancamentosBridge from "@/components/shared/ImpressaoLancamentosBridge";

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
  // Banco sem a coluna `users.permissions` (migration não aplicada): a carga
  // descobre, as escritas de usuário da sessão obedecem.
  const permsColunaIndisponivelRef = useRef(false);
  // "Recarregar os dados" é a carga da coordenação, lá dentro.
  const recarregarRef = useRef(() => {});
  // Banco sem as colunas da trava de edição (migration não aplicada): a carga
  // descobre, as travas das comandas obedecem.
  const lockIndisponivelRef = useRef(false);
  // De fora para dentro, cada um só depende dos que estão por fora dele. A
  // coordenação (carga, dreno da fila, Jarvas) fica no centro.
  return (
    <SessaoProvider tenantIdRef={tenantIdRef} carregarRef={recarregarRef} permsColunaIndisponivelRef={permsColunaIndisponivelRef}>
      <OfflineProvider tenantIdRef={tenantIdRef} recarregarRef={recarregarRef}>
        <ConfigProvider tenantIdRef={tenantIdRef}>
          <CatalogoProvider>
            <ComandasProvider lockIndisponivelRef={lockIndisponivelRef}>
              <CaixaProvider>
                <AppProviderInterno
                  tenantIdRef={tenantIdRef}
                  lockIndisponivelRef={lockIndisponivelRef}
                  recarregarRef={recarregarRef}
                  permsColunaIndisponivelRef={permsColunaIndisponivelRef}
                >
                  {children}
                </AppProviderInterno>
              </CaixaProvider>
            </ComandasProvider>
          </CatalogoProvider>
        </ConfigProvider>
      </OfflineProvider>
    </SessaoProvider>
  );
}

function AppProviderInterno({ children, tenantIdRef, lockIndisponivelRef, recarregarRef, permsColunaIndisponivelRef }) {
  // ── Estado local ─────────────────────────────────────────────
  // F005 — sangrias e suprimentos da sessão de caixa (trilha de auditoria).
  // Matriz de permissões por cargo do tenant (role → mapa efetivo, já
  // mesclado sobre o default do roles.js). Vazio até o bootstrap carregar;
  // enquanto isso, o resto do app cai no getPermissions(role) do roles.js.
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
  // tarefa 2.9.
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
  // A sessão (usuário logado, equipe, estabelecimento, permissões, login e
  // logout) mora no SessaoProvider desde a tarefa 2.9. Daqui sai a CARGA,
  // que o login e a restauração da sessão disparam por `recarregarRef`.
  const {
    loading, isMobile, currentUser, users, tenant, rolePermissions,
    moduloHabilitado: moduloHabilitadoNoPlano, addonHabilitado: addonHabilitadoNoTenant,
    aplicarTenantSalvo, login, logout, addUser, updateUser, removeUser, salvarPermissoesCargo,
  } = useSessao();
  const cargaSessao = useSessaoCarga();

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
    cargaSessao.definirCarregando(true);
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
      cargaSessao.definirPermissoesDosCargos(mapaCargos);
      if (usersData?.length)       cargaSessao.definirUsuarios(usersData.map(u => ({
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
        cargaSessao.definirTenant(tenantData);
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
              cargaSessao.definirTenant((anterior) => {
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
      cargaSessao.definirCarregando(false);
    }
  }

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

  // A carga, para quem está de fora (login, restauração, "recarregar"). Layout
  // effect: roda antes dos efeitos dos provedores de fora e de qualquer clique.
  useLayoutEffect(() => {
    recarregarRef.current = bootstrap;
  });

  // ── Context value ─────────────────────────────────────────────

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
      {children}
      <IndicadorRede online={redeOnline} pendencias={pendenciasOffline} visivel={!!currentUser} />
      <PonteLocalBridge />
      <ImpressaoLancamentosBridge />
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
