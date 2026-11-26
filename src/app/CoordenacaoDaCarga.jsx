import { useEffect, useLayoutEffect } from "react";
import { getPermissions, mesclarPermissoes, ROLES } from "@/constants/roles";
import { useSessaoCarga, COLUNAS_USERS } from "@/context/SessaoProvider";
import { useSessao } from "@/context/SessaoContext";
import { useOfflineCarga } from "@/context/OfflineProvider";
import { useOffline } from "@/context/OfflineContext";
import { useConfigCarga } from "@/context/ConfigProvider";
import { useCatalogoCarga } from "@/context/CatalogoProvider";
import { useCatalogo } from "@/context/CatalogoContext";
import { useComandasCarga } from "@/context/ComandasProvider";
import { useCaixaCarga } from "@/context/CaixaProvider";
import { useCaixa } from "@/context/CaixaContext";
import { lerConfigDaAbertura } from "@/features/configuracoes/dados/config";
import { listarSaldos } from "@/features/estoque/dados/saldos";
import {
  listarVendasDesde, listarItensDasVendas, listarPagamentosDasVendas, listarVendasLegadasDesde
} from "@/features/caixa/dados/vendas";
import { listarFechamentos, listarMovimentosRecentes } from "@/features/caixa/dados/caixa";
import { listarComandas } from "@/features/comandas/dados/comandas";
import { listarProdutos } from "@/features/cardapio/dados/produtos";
import { listarGruposCategoria, listarCategoriaGrupos } from "@/features/cardapio/dados/gruposCategoria";
import {
  listarUsuariosAtivos, listarPermissoesDosCargos
} from "@/features/sessao/dados/usuarios";
import { buscarBootstrapTenant } from "@/features/tenant/dados/tenant";
import { sincronizarStatusAssinatura } from "@/features/assinatura/dados/assinatura";
import { executarAnaliseJarvas } from "@/features/jarvas/dados/jarvasEngine";
import { montarVendaLegada } from "@/features/caixa/regras/vendas";
import { isErroDeRede } from "@/lib/offline/rede";
import { setTenantObservabilidade } from "@/lib/observabilidade";
import { salvarSnapshot, lerSnapshot } from "@/lib/offline/snapshot";
import IndicadorRede from "@/components/shared/IndicadorRede";
import PonteLocalBridge from "@/components/shared/PonteLocalBridge";
import ImpressaoLancamentosBridge from "@/components/shared/ImpressaoLancamentosBridge";
// Carga e reenvio da fila: o resto do estoque mora no CatalogoProvider.
// Carga e reenvio da fila: o resto das vendas mora no CaixaProvider.
// Carga e reenvio da fila: o resto das comandas mora no ComandasProvider.
// Fila local de operações offline (Leva 11) — singleton de módulo sobre o
// IndexedDB (F021 fatia 2): sobrevive a reload/fechamento do app e é
// compartilhada por todas as instâncias do provider (só existe uma no app
// real) e pela tela de notas emitidas, que conta as pendências fiscais
// guardadas nela. O banco responde depois do primeiro render, por isso o
// contador reassina em `assinarFilaOffline`.
import { useDrenoFilaOffline } from "./useDrenoFilaOffline";


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
 * A coordenação do app (tarefa 2.10 do plano de refatoração): a CARGA do
 * estabelecimento (`bootstrap`), o DRENO da fila offline, a análise do Jarvas
 * e as pontes de impressão. É o que atravessa todos os assuntos ao mesmo
 * tempo, por isso fica no centro, dentro de todos os provedores: lê cada um
 * pelo gancho dele e hidrata cada um pelo canal interno `use*Carga()`.
 *
 * Não tem estado de assunto nenhum. Quem monta é o `AppProvider`.
 */
export function CoordenacaoDaCarga({ children, tenantIdRef, lockIndisponivelRef, recarregarRef, permsColunaIndisponivelRef }) {
  // ── Estado local ─────────────────────────────────────────────
  // F005 — sangrias e suprimentos da sessão de caixa (trilha de auditoria).
  // Matriz de permissões por cargo do tenant (role → mapa efetivo, já
  // mesclado sobre o default do roles.js). Vazio até o bootstrap carregar;
  // enquanto isso, o resto do app cai no getPermissions(role) do roles.js.
  // IDs de comandas com pedido lançado na sessão atual (sobrevive troca de aba)

  // ── Offline-first (Leva 11) ──────────────────────────────────
  // O offline (rede, fila, notas pendentes) mora no OfflineProvider desde a
  // tarefa 2.9. Daqui sai só a DRENAGEM, que reenvia todos os assuntos.
  const {
    redeOnline, pendenciasOffline,
  } = useOffline();
  const cargaOffline = useOfflineCarga();
  // A configuração (pagamento, TEF, taxa, ponte, alertas) mora no
  // ConfigProvider desde a tarefa 2.9; daqui só se lê e se hidrata na carga.

  const cargaConfig = useConfigCarga();
  // O catálogo (produtos, saldos, grupos) mora no CatalogoProvider desde a
  // tarefa 2.9.
  const {
    products, estoque, estoqueMinimos,
  } = useCatalogo();
  const cargaCatalogo = useCatalogoCarga();
  // As comandas em aberto moram no ComandasProvider desde a tarefa 2.9.

  const cargaComandas = useComandasCarga();
  // O caixa (vendas, fechamentos, fundo, abertura, movimentos) mora no
  // CaixaProvider desde a tarefa 2.9.
  const {
    sales, fechamentos,
  } = useCaixa();
  const cargaCaixa = useCaixaCarga();
  // A sessão (usuário logado, equipe, estabelecimento, permissões, login e
  // logout) mora no SessaoProvider desde a tarefa 2.9. Daqui sai a CARGA,
  // que o login e a restauração da sessão disparam por `recarregarRef`.
  const {
    loading, currentUser,
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
        listarProdutos(),
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

  // ── Offline-first (Leva 11): reenvio da fila local, em useDrenoFilaOffline ──
  useDrenoFilaOffline({ cargaOffline, currentUser, loading, pendenciasOffline, products, redeOnline, tenantIdRef });

  // A carga, para quem está de fora (login, restauração, "recarregar"). Layout
  // effect: roda antes dos efeitos dos provedores de fora e de qualquer clique.
  useLayoutEffect(() => {
    recarregarRef.current = bootstrap;
  });

  return (
    <>
      {children}
      <IndicadorRede online={redeOnline} pendencias={pendenciasOffline} visivel={!!currentUser} />
      <PonteLocalBridge />
      <ImpressaoLancamentosBridge />
    </>
  );
}
