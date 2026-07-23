// ──────────────────────────────────────────────────────────────────
// DeliveryView — painel do dono do delivery.
//
// CADASTRO SEPARADO do cadastro normal de produtos do PDV (pedido do
// dono): aqui o dono cuida SÓ do que o cliente final vê no cardápio
// online — foto, descrição, disponibilidade, complementos e as regras
// de entrega (taxa/horário/pedido mínimo).
//
// Dois modos, derivados do plano (F013/ADR-005) — sem o dono escolher:
//   • ADDON (o plano também tem PDV): o cardápio JÁ existe em Produtos.
//     Então aqui não se cria produto do zero — IMPORTA-SE o cardápio do
//     PDV de uma vez e enriquece cada item com foto/descrição. Assim o
//     delivery nasce sincronizado com o PDV, sem redigitar nada.
//   • STANDALONE (só delivery, sem PDV): este é o ÚNICO cadastro que o
//     estabelecimento tem — então aqui se cria o produto do zero
//     (nome/preço/categoria) já com a cara do delivery.
//
// Intuitividade (Princípio nº 1): uma aba por assunto (Cardápio,
// Complementos, Entrega), a próxima ação sempre em destaque, importação
// em um clique com contagem clara, e estados de vazio/carregando/erro
// com texto humano. Nada de jargão técnico na tela.
// ──────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { useResponsive, usePedidosDelivery } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import MODULOS from "@/constants/modulos";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import {
  LuBike,
  LuDownload,
  LuPencil,
  LuTrash2,
  LuX,
  LuPlus,
  LuCheck,
  LuImage,
  LuUtensils,
  LuTruck,
  LuStore,
  LuClipboardList,
  LuMapPin,
  LuPhone,
  LuMessageCircle,
  LuChevronRight,
  LuChevronDown,
  LuArrowLeft,
  LuSearch,
  LuBanknote,
  LuRefreshCw,
  LuBell,
  LuBellOff,
  LuPower,
  LuPowerOff,
} from "react-icons/lu";
import {
  statusLabel,
  statusCor,
  proximoStatus,
  rotuloAcao,
  ehTerminal,
  podeCancelar,
  agruparPorStatus,
  resumoEndereco,
  formatarTelefone,
  linkWhatsApp,
  resumoPagamento,
  tempoDecorrido,
  carregarItensPedido,
  atualizarStatusPedido,
  STATUS_CANCELADO,
} from "@/lib/deliveryPedidos";
import {
  detectarNovosPedidos,
  alertarPedidosNovos,
  permissaoNotificacao,
  pedirPermissaoNotificacao,
  notificacoesSuportadas,
} from "@/lib/deliveryAlertas";
import {
  carregarConfigDelivery,
  salvarConfigDelivery,
  listarProdutosDelivery,
  salvarProdutoDelivery,
  removerProdutoDelivery,
  importarProdutosDelivery,
  produtosParaImportar,
  filtrarProdutos,
  filtrarItensDelivery,
  alternarProdutoId,
  listarBibliotecaGrupos,
  vincularGrupoProduto,
  desvincularGrupoProduto,
  salvarGrupoComplemento,
  removerGrupoComplemento,
  salvarComplemento,
  removerComplemento,
  subgrupoCriaCiclo,
  vincularSubgrupo,
  desvincularSubgrupo,
  reordenarSubgrupos,
  faixaResumo,
  validarFaixa,
  formatarReais,
  formatarCep,
  temFaixasKm,
} from "@/lib/deliveryAdmin";
import MapaRaioEntrega from "./delivery/MapaRaioEntrega";
import ListaArrastavel from "@/components/shared/ListaArrastavel";
import { geocodificarEndereco } from "@/lib/delivery";
import { enviarFotoProduto, ACCEPT_IMAGEM } from "@/lib/deliveryFotos";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import "./DeliveryView.css";

const ABAS = [
  { id: "pedidos",      label: "Pedidos" },
  { id: "cardapio",     label: "Cardápio" },
  { id: "complementos", label: "Complementos" },
  { id: "entrega",      label: "Entrega e taxas" },
];

// Chaves de cor semânticas (statusCor) → token do design system OU cor de
// alerta literal (âmbar não é token de marca; ver colorAlfa.js). White-label
// respeitado: os tokens seguem o tema do tenant; o âmbar é semântico fixo.
const COR_STATUS = {
  blue:   C.blue,
  accent: C.accent,
  green:  C.green,
  red:    C.red,
  muted:  C.muted,
  amber:  "#f59e0b",
};
const baseCorStatus = (status) => COR_STATUS[statusCor(status)] || C.muted;
const cssCor = (base) =>
  typeof base === "string" && base.startsWith("--gm-") ? varColor(base) : base;

export default function DeliveryView({ notify } = {}) {
  const { products, tenant, currentUser, moduloHabilitado, addProduct, updateProduct, recarregarProdutos } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);

  // Modo derivado do plano: tem PDV → addon; só delivery → standalone.
  const ehAddon = moduloHabilitado(MODULOS.PDV);

  const [aba, setAba] = useState("pedidos");
  const [linhas, setLinhas] = useState([]);      // produto_delivery do tenant
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Estado da loja (config_delivery.aberto): controla se a vitrine pública
  // aceita pedidos. Espelhado aqui pra dar o botão de abrir/fechar no topo,
  // sem obrigar o operador a entrar na aba "Entrega e taxas".
  const [configDelivery, setConfigDelivery] = useState(null);
  const [salvandoAberto, setSalvandoAberto] = useState(false);

  const aviso = useCallback(
    (msg, tipo) => (typeof notify === "function" ? notify(msg, tipo) : undefined),
    [notify]
  );

  const carregarLinhas = useCallback(async () => {
    const { data, error } = await listarProdutosDelivery();
    if (error) {
      setErro("Não conseguimos carregar o cardápio do delivery. Tente novamente.");
      return;
    }
    setErro("");
    setLinhas(data);
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      await carregarLinhas();
      if (ativo) setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, [carregarLinhas]);

  // Carrega a config só pra saber se a loja está aberta (botão do topo).
  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data, error } = await carregarConfigDelivery();
      if (!ativo || error) return;
      setConfigDelivery(
        data || { aberto: false, pedido_minimo: 0, tempo_preparo_min: 30, horario: {}, faixas_taxa: [] }
      );
    })();
    return () => { ativo = false; };
  }, []);

  // Junta cada linha de delivery com o produto (nome/preço/emoji vêm de products).
  const porProdutoId = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.id), p);
    return m;
  }, [products]);

  const itensCardapio = useMemo(
    () =>
      linhas.map((l) => ({
        ...l,
        produto: porProdutoId.get(String(l.produto_id)) || null,
      })),
    [linhas, porProdutoId]
  );

  const faltamImportar = useMemo(
    () => (ehAddon ? produtosParaImportar(products, linhas) : []),
    [ehAddon, products, linhas]
  );

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gerente";

  // Abrir/fechar a loja direto do topo. Otimista: vira na hora e reverte se
  // o Supabase recusar. Só admin/gerente mexe.
  const alternarAberto = useCallback(async () => {
    if (!isAdmin || salvandoAberto || !configDelivery) return;
    if (!tenant?.id) return aviso("Estabelecimento não identificado.", "err");
    const anterior = configDelivery;
    const proximo = { ...configDelivery, aberto: !configDelivery.aberto };
    setConfigDelivery(proximo);
    setSalvandoAberto(true);
    const { data, error } = await salvarConfigDelivery(tenant.id, proximo);
    setSalvandoAberto(false);
    if (error) {
      setConfigDelivery(anterior);
      return aviso("Não foi possível mudar o status da loja.", "err");
    }
    setConfigDelivery(data || proximo);
    logAction(currentUser?.username, "delivery:config", {
      msg: proximo.aberto ? "Delivery aberto" : "Delivery fechado",
      name: currentUser?.name,
      role: currentUser?.role,
    });
    aviso(proximo.aberto ? "Delivery aberto." : "Delivery fechado.", "ok");
  }, [isAdmin, salvandoAberto, configDelivery, tenant, currentUser, aviso]);

  return (
    <div className="delivery-view" style={{ background: varColor(C.bg), color: varColor(C.text) }}>
      {/* Cabeçalho */}
      <div className="delivery-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div>
          <div className="delivery-view__titulo">
            <LuBike size={20} color={varColor(C.accent)} /> Delivery
          </div>
          <div className="delivery-view__sub">
            {itensCardapio.length} item{itensCardapio.length !== 1 ? "s" : ""} no cardápio online
          </div>
        </div>
        <div className="delivery-view__header-acoes">
          <span
            className="delivery-view__modo-tag"
            style={{
              background: alfa(ehAddon ? C.blue : C.green, "15"),
              color: varColor(ehAddon ? C.blue : C.green),
              border: `1px solid ${alfa(ehAddon ? C.blue : C.green, "33")}`,
            }}
            title={
              ehAddon
                ? "Seu plano tem PDV: o delivery usa o mesmo cardápio do sistema."
                : "Plano só de delivery: este é o seu cadastro de produtos."
            }
          >
            {ehAddon ? <LuStore size={13} /> : <LuTruck size={13} />}
            {ehAddon ? "Integrado ao PDV" : "Delivery independente"}
          </span>

          {isAdmin && configDelivery && (
            <button
              type="button"
              onClick={alternarAberto}
              disabled={salvandoAberto}
              className={`delivery-view__toggle-loja delivery-view__toggle-loja--${
                configDelivery.aberto ? "aberta" : "fechada"
              }`}
              title={
                configDelivery.aberto
                  ? "A loja está aceitando pedidos. Clique para fechar."
                  : "A loja não está aceitando pedidos. Clique para abrir."
              }
            >
              {configDelivery.aberto ? <LuPowerOff size={14} /> : <LuPower size={14} />}
              {salvandoAberto
                ? "Salvando…"
                : configDelivery.aberto
                  ? "Fechar delivery"
                  : "Abrir delivery"}
            </button>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="delivery-view__abas" style={{ padding: `0 ${sz.pad}px` }}>
        {ABAS.map((a) => {
          const ativo = aba === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className="delivery-view__aba"
              style={{
                borderBottom: ativo ? `2px solid var(${C.accent})` : "2px solid transparent",
                color: ativo ? varColor(C.accent) : varColor(C.muted),
                fontWeight: ativo ? 700 : 500,
              }}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="delivery-view__area" style={{ padding: sz.pad }}>
        {erro && (
          <div
            className="delivery-view__aviso"
            style={{ background: alfa(C.red, "12"), color: varColor(C.red), border: `1px solid ${alfa(C.red, "33")}`, marginBottom: 12 }}
          >
            ⚠️ {erro}
          </div>
        )}

        {aba === "pedidos" && (
          <AbaPedidos sz={sz} isAdmin={isAdmin} ehAddon={ehAddon} aviso={aviso} currentUser={currentUser} />
        )}

        {aba === "cardapio" && (
          <AbaCardapio
            sz={sz}
            isAdmin={isAdmin}
            ehAddon={ehAddon}
            carregando={carregando}
            itens={itensCardapio}
            faltamImportar={faltamImportar}
            products={products}
            linhas={linhas}
            tenant={tenant}
            addProduct={addProduct}
            updateProduct={updateProduct}
            recarregarProdutos={recarregarProdutos}
            currentUser={currentUser}
            aviso={aviso}
            recarregar={carregarLinhas}
          />
        )}

        {aba === "complementos" && (
          <AbaComplementos sz={sz} isAdmin={isAdmin} itens={itensCardapio} products={products} aviso={aviso} />
        )}

        {aba === "entrega" && (
          <AbaEntrega sz={sz} isAdmin={isAdmin} tenant={tenant} currentUser={currentUser} aviso={aviso} />
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ABA 0 — Pedidos (operação: acompanha e toca o pedido até a entrega)
// ════════════════════════════════════════════════════════════════
//
// Superfície de OPERAÇÃO do delivery. O pedido que o cliente enviou pela
// vitrine já foi gravado (RPC criar_pedido_delivery) em `delivery_pedidos`
// e espelhado em `pending`. Aqui o operador ACOMPANHA e AVANÇA o status
// (recebido → em preparo → saiu → entregue) até a entrega.
//
// Dinheiro: esta aba só mexe no CICLO DE VIDA (delivery_pedidos.status).
// Nunca cria venda — no addon a venda é fechada na frente de caixa (a
// comanda "Delivery NNN" nasce em `pending`); relatórios leem `sales`.
// Sem contagem dupla. No standalone, `delivery_pedidos` é o registro.
//
// Intuitividade (Princípio nº 1): colunas por etapa (kanban) do fluxo, a
// próxima ação em destaque no cartão, contato do cliente a um toque
// (WhatsApp), e estados de vazio/carregando/erro com texto humano.
// Preferência de avisos por navegador (não é dado de negócio → localStorage).
const CHAVE_AVISOS = "kora.delivery.avisos";
const lerPrefAvisos = () => {
  try {
    return localStorage.getItem(CHAVE_AVISOS) === "1";
  } catch {
    return false;
  }
};

function AbaPedidos({ sz, isAdmin, ehAddon, aviso, currentUser }) {
  const { pedidos, carregando, erro, recarregar } = usePedidosDelivery();
  const [tick, setTick] = useState(0); // recalcula "há X min" de tempos em tempos

  // Avisos de pedido novo (Fase 5, Nível 1): som + Notification API. Só
  // alerta o que chega DEPOIS que a tela já carregou a lista base.
  const [avisosLigados, setAvisosLigados] = useState(lerPrefAvisos);
  const idsVistosRef = useRef(null); // null = ainda não semeou (1ª carga)

  // Relógio leve só pro rótulo de tempo respirar (1 min). Sem custo de rede.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // Detecta pedidos novos a cada mudança da lista. A 1ª carga só SEMEIA os ids
  // conhecidos (sem alertar retroativo); as próximas comparam e alertam.
  useEffect(() => {
    if (carregando) return;
    if (idsVistosRef.current === null) {
      idsVistosRef.current = new Set(pedidos.map((p) => String(p.id)));
      return;
    }
    const novos = detectarNovosPedidos(idsVistosRef.current, pedidos);
    for (const p of pedidos) idsVistosRef.current.add(String(p.id));
    if (avisosLigados && novos.length > 0) {
      alertarPedidosNovos(novos, { som: true, notificar: true });
    }
  }, [pedidos, carregando, avisosLigados]);

  const alternarAvisos = useCallback(async () => {
    if (avisosLigados) {
      setAvisosLigados(false);
      try { localStorage.setItem(CHAVE_AVISOS, "0"); } catch { /* ok */ }
      return;
    }
    // Ligar: pede permissão de notificação (gesto do usuário). O som funciona
    // mesmo sem permissão — a notificação é o extra que precisa de consentimento.
    if (notificacoesSuportadas() && permissaoNotificacao() === "default") {
      await pedirPermissaoNotificacao();
    }
    setAvisosLigados(true);
    try { localStorage.setItem(CHAVE_AVISOS, "1"); } catch { /* ok */ }
    if (notificacoesSuportadas() && permissaoNotificacao() === "denied") {
      aviso("Avisos ligados (com som). Para o alerta na tela, libere as notificações no navegador.", "info");
    } else {
      aviso("Avisos de pedido novo ligados.", "ok");
    }
  }, [avisosLigados, aviso]);

  const colunas = useMemo(() => agruparPorStatus(pedidos), [pedidos, tick]);
  const abertos = useMemo(
    () => pedidos.filter((p) => !ehTerminal(p?.status ?? "recebido")).length,
    [pedidos]
  );

  const avancar = useCallback(
    async (pedido) => {
      const proximo = proximoStatus(pedido.status);
      if (!proximo) return;
      const { error } = await atualizarStatusPedido(pedido.id, proximo, {
        de: pedido.status,
        operador: currentUser?.username,
        numero: pedido.numero,
      });
      if (error) return aviso("Não foi possível atualizar o pedido. Tente novamente.", "err");
      aviso(`Pedido ${pedido.numero}: ${statusLabel(proximo).toLowerCase()}.`, "ok");
      await recarregar();
    },
    [aviso, recarregar, currentUser]
  );

  const cancelar = useCallback(
    async (pedido) => {
      const { error } = await atualizarStatusPedido(pedido.id, STATUS_CANCELADO, {
        de: pedido.status,
        operador: currentUser?.username,
        numero: pedido.numero,
      });
      if (error) return aviso("Não foi possível cancelar. Tente novamente.", "err");
      aviso(`Pedido ${pedido.numero} cancelado.`, "ok");
      await recarregar();
    },
    [aviso, recarregar, currentUser]
  );

  return (
    <>
      {/* Barra de topo: resumo + recarregar manual (fallback sem realtime) */}
      <div className="delivery-view__pedidos-topo">
        <div className="delivery-view__pedidos-resumo" style={{ color: varColor(C.muted) }}>
          {carregando
            ? "Carregando pedidos…"
            : abertos > 0
              ? `${abertos} pedido${abertos !== 1 ? "s" : ""} em andamento`
              : "Nenhum pedido em andamento"}
        </div>
        <div className="delivery-view__pedidos-acoes">
          <button
            onClick={alternarAvisos}
            className="delivery-view__btn delivery-view__btn--sm"
            style={{
              background: avisosLigados ? alfa(C.green, "16") : alfa(C.muted, "12"),
              color: avisosLigados ? varColor(C.green) : varColor(C.muted),
              padding: "6px 12px",
            }}
            title={avisosLigados ? "Avisos de pedido novo ligados (som + alerta na tela). Toque para desligar." : "Ligar avisos de pedido novo (som + alerta na tela)."}
            aria-pressed={avisosLigados}
          >
            {avisosLigados ? <LuBell size={13} /> : <LuBellOff size={13} />}
            {avisosLigados ? "Avisos ligados" : "Ativar avisos"}
          </button>
          <button
            onClick={recarregar}
            className="delivery-view__btn delivery-view__btn--sm"
            style={{ background: alfa(C.accent, "12"), color: varColor(C.accent), padding: "6px 12px" }}
            title="Atualizar a lista de pedidos"
          >
            <LuRefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {carregando ? (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div className="delivery-view__vazio-emoji" style={{ opacity: 0.4 }}>⏳</div>
          <div className="delivery-view__carregando">Carregando pedidos…</div>
        </div>
      ) : erro ? (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div className="delivery-view__vazio-emoji" style={{ opacity: 0.3 }}>📡</div>
          <div className="delivery-view__vazio-titulo" style={{ fontWeight: 600 }}>Não conseguimos carregar os pedidos</div>
          <div className="delivery-view__vazio-desc">Verifique a conexão e toque em “Atualizar”.</div>
        </div>
      ) : colunas.length === 0 ? (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div className="delivery-view__vazio-emoji" style={{ opacity: 0.3 }}>🛵</div>
          <div className="delivery-view__vazio-titulo" style={{ fontWeight: 600 }}>Nenhum pedido por aqui ainda</div>
          <div className="delivery-view__vazio-desc">
            Quando um cliente pedir pelo cardápio online, o pedido aparece aqui na hora.
          </div>
        </div>
      ) : (
        <div className="delivery-view__kanban">
          {colunas.map((col) => {
            const base = baseCorStatus(col.status);
            return (
              <div key={col.status} className="delivery-view__coluna">
                <div
                  className="delivery-view__coluna-titulo"
                  style={{ color: cssCor(base) }}
                >
                  <span className="delivery-view__coluna-bolinha" style={{ background: cssCor(base) }} />
                  {col.label}
                  <span
                    className="delivery-view__coluna-contador"
                    style={{ background: alfa(base, "1f"), color: cssCor(base) }}
                  >
                    {col.pedidos.length}
                  </span>
                </div>
                <div className="delivery-view__coluna-cards">
                  {col.pedidos.map((p) => (
                    <CardPedido
                      key={p.id}
                      sz={sz}
                      pedido={p}
                      isAdmin={isAdmin}
                      ehAddon={ehAddon}
                      onAvancar={() => avancar(p)}
                      onCancelar={() => cancelar(p)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function CardPedido({ sz, pedido, isAdmin, ehAddon, onAvancar, onCancelar }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState(null); // null = ainda não buscou
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);

  const base = baseCorStatus(pedido.status);
  const acao = rotuloAcao(pedido.status);
  const endereco = resumoEndereco(pedido);
  const zap = linkWhatsApp(
    pedido.cliente_telefone,
    `Olá! Aqui é do delivery, sobre o seu pedido ${pedido.numero}.`
  );

  const toggleItens = async () => {
    const proximo = !aberto;
    setAberto(proximo);
    if (proximo && itens === null && !carregandoItens) {
      setCarregandoItens(true);
      const { data } = await carregarItensPedido(pedido.id);
      setItens(Array.isArray(data) ? data : []);
      setCarregandoItens(false);
    }
  };

  return (
    <div
      className="delivery-view__pedido"
      style={{ background: varColor(C.card), border: `1px solid ${varColor(C.border)}`, borderLeft: `3px solid ${cssCor(base)}` }}
    >
      {/* Cabeçalho: número + tempo */}
      <div className="delivery-view__pedido-topo">
        <span className="delivery-view__pedido-num" style={{ color: varColor(C.text) }}>
          <LuClipboardList size={14} color={cssCor(base)} /> {pedido.numero}
        </span>
        <span className="delivery-view__pedido-tempo" style={{ color: varColor(C.muted) }}>
          {tempoDecorrido(pedido.created_at)}
        </span>
      </div>

      {/* Cliente */}
      <div className="delivery-view__pedido-cliente" style={{ color: varColor(C.text) }}>
        {pedido.cliente_nome || "Cliente"}
      </div>

      {/* Telefone → WhatsApp (só toque; número é do cliente) */}
      {pedido.cliente_telefone && (
        <div className="delivery-view__pedido-linha" style={{ color: varColor(C.muted) }}>
          <LuPhone size={13} /> {formatarTelefone(pedido.cliente_telefone)}
          {zap && (
            <a
              href={zap}
              target="_blank"
              rel="noopener noreferrer"
              className="delivery-view__zap"
              style={{ color: varColor(C.green) }}
              title="Falar com o cliente no WhatsApp"
            >
              <LuMessageCircle size={13} /> WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Endereço */}
      {endereco && (
        <div className="delivery-view__pedido-linha" style={{ color: varColor(C.muted) }}>
          <LuMapPin size={13} /> {endereco}
        </div>
      )}

      {/* Pagamento */}
      <div className="delivery-view__pedido-linha" style={{ color: varColor(C.muted) }}>
        <LuBanknote size={13} /> {resumoPagamento(pedido)}
      </div>

      {/* Itens (sob demanda) */}
      <button
        onClick={toggleItens}
        className="delivery-view__pedido-itens-toggle"
        style={{ color: varColor(C.accent) }}
      >
        {aberto ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
        {aberto ? "Ocultar itens" : "Ver itens"}
      </button>
      {aberto && (
        <div className="delivery-view__pedido-itens" style={{ color: varColor(C.text) }}>
          {carregandoItens ? (
            <div style={{ color: varColor(C.muted) }}>Carregando itens…</div>
          ) : itens && itens.length > 0 ? (
            itens.map((it) => (
              <div key={it.id} className="delivery-view__pedido-item">
                <span>{it.qtd}× {it.nome}</span>
                {it.obs && <span className="delivery-view__pedido-item-obs" style={{ color: varColor(C.muted) }}> — {it.obs}</span>}
              </div>
            ))
          ) : (
            <div style={{ color: varColor(C.muted) }}>Sem itens detalhados.</div>
          )}
        </div>
      )}

      {/* Total */}
      <div className="delivery-view__pedido-total" style={{ color: varColor(C.text) }}>
        Total <strong>{formatarReais(pedido.total)}</strong>
      </div>

      {/* Ações — só admin/gerente toca o pedido */}
      {isAdmin && !ehTerminal(pedido.status) && (
        <div className="delivery-view__pedido-acoes">
          {acao && (
            <button
              onClick={onAvancar}
              className="delivery-view__btn delivery-view__btn--sm"
              style={{ background: cssCor(base), color: "#fff", padding: "8px 12px", flex: 1 }}
            >
              {acao}
            </button>
          )}
          {podeCancelar(pedido.status) && (
            confirmarCancelar ? (
              <>
                <button
                  onClick={onCancelar}
                  className="delivery-view__btn delivery-view__btn--sm"
                  style={{ background: varColor(C.red), color: "#fff", padding: "8px 12px" }}
                >
                  Cancelar mesmo
                </button>
                <button
                  onClick={() => setConfirmarCancelar(false)}
                  className="delivery-view__btn delivery-view__btn--sm"
                  style={{ background: alfa(C.muted, "15"), color: varColor(C.muted), padding: "8px 12px" }}
                >
                  Voltar
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmarCancelar(true)}
                className="delivery-view__btn delivery-view__btn--sm"
                style={{ background: alfa(C.red, "12"), color: varColor(C.red), padding: "8px 10px" }}
                title="Cancelar este pedido"
              >
                <LuX size={13} />
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ABA 1 — Cardápio (importação no addon / cadastro no standalone)
// ════════════════════════════════════════════════════════════════
function AbaCardapio({
  sz, isAdmin, ehAddon, carregando, itens, faltamImportar,
  products, linhas, tenant, addProduct, updateProduct, recarregarProdutos, currentUser, aviso, recarregar,
}) {
  const [importando, setImportando] = useState(false);
  const [modal, setModal] = useState(null); // { modo:'novo'|'editar', item? }

  const importar = async () => {
    if (importando || faltamImportar.length === 0) return;
    setImportando(true);
    const { data, error } = await importarProdutosDelivery(products, linhas);
    setImportando(false);
    if (error) {
      aviso("Não foi possível importar agora. Tente novamente.", "err");
      return;
    }
    logAction(currentUser?.username, "delivery:importar", {
      msg: `Importou ${data.importados} produto(s) do PDV para o delivery`,
      name: currentUser?.name, role: currentUser?.role,
    });
    aviso(`${data.importados} produto(s) importado(s) para o delivery.`, "ok");
    await recarregar();
  };

  return (
    <>
      {/* Ação principal por modo */}
      {isAdmin && ehAddon && (
        <div
          className="delivery-view__import"
          style={{ background: alfa(C.blue, "0c"), border: `1px solid ${alfa(C.blue, "33")}`, marginBottom: 16 }}
        >
          <div className="delivery-view__import-texto">
            <div className="delivery-view__import-titulo">
              <LuDownload size={16} color={varColor(C.blue)} /> Importar cardápio do PDV
            </div>
            <div className="delivery-view__import-desc">
              {faltamImportar.length > 0
                ? `Traz de uma vez os ${faltamImportar.length} produto(s) do sistema que ainda não estão no delivery. Depois é só colocar foto e descrição.`
                : "Tudo em dia — todos os produtos do PDV já estão no delivery."}
            </div>
          </div>
          <button
            onClick={importar}
            disabled={importando || faltamImportar.length === 0}
            className="delivery-view__btn"
            style={{ background: varColor(C.blue), color: "#fff", padding: `10px ${sz.pad}px` }}
          >
            <LuDownload size={15} />
            {importando ? "Importando…" : faltamImportar.length > 0 ? `Importar ${faltamImportar.length}` : "Importado"}
          </button>
        </div>
      )}

      {isAdmin && !ehAddon && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setModal({ modo: "novo" })}
            className="delivery-view__btn"
            style={{ background: varColor(C.accent), color: "#fff", padding: `10px ${sz.pad}px` }}
          >
            <LuPlus size={15} /> Novo produto
          </button>
        </div>
      )}

      {/* Lista / estados */}
      {carregando ? (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div className="delivery-view__vazio-emoji" style={{ opacity: 0.4 }}>⏳</div>
          <div className="delivery-view__carregando">Carregando o cardápio…</div>
        </div>
      ) : itens.length === 0 ? (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div className="delivery-view__vazio-emoji" style={{ opacity: 0.3 }}>🛵</div>
          <div className="delivery-view__vazio-titulo" style={{ fontWeight: 600 }}>Nenhum produto no delivery ainda</div>
          <div className="delivery-view__vazio-desc">
            {ehAddon
              ? "Use “Importar cardápio do PDV” acima para trazer seus produtos."
              : "Clique em “Novo produto” para começar seu cardápio online."}
          </div>
        </div>
      ) : (
        <div className="delivery-view__cards">
          {itens.map((it) => (
            <CardProduto
              key={it.id}
              sz={sz}
              item={it}
              isAdmin={isAdmin}
              ehAddon={ehAddon}
              onEditar={() => setModal({ modo: "editar", item: it })}
              onRemover={async () => {
                const { error } = await removerProdutoDelivery(it.id);
                if (error) return aviso("Não foi possível remover.", "err");
                aviso("Removido do delivery.", "ok");
                await recarregar();
              }}
              onToggle={async () => {
                const { error } = await salvarProdutoDelivery({
                  id: it.id, produto_id: it.produto_id,
                  foto_url: it.foto_url, descricao: it.descricao,
                  disponivel: !it.disponivel, ordem: it.ordem,
                });
                if (error) return aviso("Não foi possível atualizar.", "err");
                await recarregar();
              }}
            />
          ))}
        </div>
      )}

      {modal && (
        <ModalProduto
          sz={sz}
          modo={modal.modo}
          item={modal.item}
          ehAddon={ehAddon}
          products={products}
          tenant={tenant}
          currentUser={currentUser}
          addProduct={addProduct}
          updateProduct={updateProduct}
          recarregarProdutos={recarregarProdutos}
          aviso={aviso}
          onFechar={() => setModal(null)}
          onSalvo={async () => {
            setModal(null);
            await recarregar();
          }}
        />
      )}
    </>
  );
}

function CardProduto({ sz, item, isAdmin, ehAddon, onEditar, onRemover, onToggle }) {
  const nome = item.produto?.name || "(produto removido do PDV)";
  const preco = item.produto?.price;
  const emoji = item.produto?.emoji || "🍽️";
  const [confirmar, setConfirmar] = useState(false);

  return (
    <div className="delivery-view__card" style={{ background: varColor(C.card), border: `1px solid ${varColor(C.border)}` }}>
      <div className="delivery-view__card-topo">
        {item.foto_url ? (
          <img className="delivery-view__card-foto" src={item.foto_url} alt={nome} />
        ) : (
          <div className="delivery-view__card-emoji" style={{ background: alfa(C.accent, "12") }}>{emoji}</div>
        )}
        <div className="delivery-view__card-corpo">
          <div className="delivery-view__card-nome">{nome}</div>
          {item.descricao ? (
            <div className="delivery-view__card-desc">{item.descricao}</div>
          ) : (
            <div className="delivery-view__card-desc" style={{ fontStyle: "italic", opacity: 0.6 }}>
              Sem descrição — clique em editar para caprichar.
            </div>
          )}
        </div>
      </div>

      <div className="delivery-view__card-divisor" style={{ borderTop: `1px solid ${varColor(C.border)}` }} />

      <div className="delivery-view__card-preco-linha">
        <span className="delivery-view__card-preco">
          {preco != null ? formatarReais(preco) : "—"}
        </span>
        <button
          onClick={onToggle}
          disabled={!isAdmin}
          className="delivery-view__pill"
          style={{
            border: "none", cursor: isAdmin ? "pointer" : "default",
            background: alfa(item.disponivel ? C.green : C.muted, "15"),
            color: varColor(item.disponivel ? C.green : C.muted),
          }}
          title="Ligar/desligar no cardápio"
        >
          <span
            className="delivery-view__card-dot"
            style={{ background: varColor(item.disponivel ? C.green : C.muted) }}
          />
          {item.disponivel ? "Disponível" : "Indisponível"}
        </button>
      </div>

      {isAdmin && (
        <div className="delivery-view__card-acoes">
          {confirmar ? (
            <>
              <button
                onClick={onRemover}
                className="delivery-view__card-editar delivery-view__card-editar--perigo"
              >
                <LuTrash2 size={15} /> Confirmar remoção
              </button>
              <button
                onClick={() => setConfirmar(false)}
                className="delivery-view__card-remover delivery-view__card-remover--neutro"
                title="Cancelar"
              >
                <LuX size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onEditar}
                className="delivery-view__card-editar"
                style={{ borderColor: varColor(C.border), color: varColor(C.text) }}
              >
                <LuPencil size={15} /> Editar
              </button>
              <button
                onClick={() => setConfirmar(true)}
                className="delivery-view__card-remover"
                title={ehAddon ? "Tirar do delivery" : "Excluir"}
              >
                <LuTrash2 size={16} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Modal criar/editar item do delivery.
// Addon: só a camada de delivery (foto/descrição/disponível/ordem) —
//   nome/preço vêm do PDV e aparecem só para referência.
// Standalone: nome/preço/categoria + a camada de delivery, tudo junto.
function ModalProduto({
  sz, modo, item, ehAddon, products, tenant, currentUser, addProduct, updateProduct, recarregarProdutos, aviso, onFechar, onSalvo,
}) {
  const prod = item?.produto || null;
  const [nome, setNome] = useState(prod?.name || "");
  const [preco, setPreco] = useState(prod?.price != null ? String(prod.price) : "");
  const [categoria, setCategoria] = useState(prod?.category || "");
  const [emoji, setEmoji] = useState(prod?.emoji || "");
  const [descricao, setDescricao] = useState(item?.descricao || "");
  // Foto: a URL já gravada (edição) e, quando o dono escolhe uma nova, o
  // File local + a prévia (object URL). O upload só acontece no salvar,
  // quando o produto_id já existe (standalone "novo" cria o produto antes).
  const [fotoUrl, setFotoUrl] = useState(item?.foto_url || "");
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState("");
  const fotoInputRef = useRef(null);
  const [disponivel, setDisponivel] = useState(item?.disponivel ?? true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Libera o object URL da prévia ao trocar/fechar (evita vazamento).
  useEffect(() => {
    return () => { if (fotoPreview) URL.revokeObjectURL(fotoPreview); };
  }, [fotoPreview]);

  const escolherFoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (!file) return;
    if (!file.type?.startsWith("image/")) return setErro("Escolha um arquivo de imagem.");
    setErro("");
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const removerFoto = () => {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    setFotoPreview("");
    setFotoFile(null);
    setFotoUrl("");
  };

  const temFoto = !!(fotoPreview || fotoUrl);

  const categorias = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products]
  );

  const salvar = async () => {
    if (salvando) return;
    // Standalone precisa de nome+preço (o produto é criado aqui).
    if (!ehAddon) {
      if (!nome.trim()) return setErro("Informe o nome do produto.");
      const p = parseFloat(String(preco).replace(",", "."));
      if (isNaN(p) || p <= 0) return setErro("Preço deve ser maior que zero.");
    }
    setSalvando(true);
    setErro("");

    let produtoId = item?.produto_id;

    // Standalone: cria/atualiza o produto em products (este é o cadastro dele).
    if (!ehAddon) {
      const payload = {
        name: nome.trim().toUpperCase(),
        price: parseFloat(String(preco).replace(",", ".")),
        category: categoria.trim() || "Delivery",
        emoji: emoji || null,
      };
      if (modo === "novo") {
        const { data, error } = await addProduct(payload);
        if (error || !data?.id) {
          setSalvando(false);
          return setErro(error?.message || "Não foi possível criar o produto.");
        }
        produtoId = data.id;
        logAction(currentUser?.username, "delivery:produto:criar", { msg: `Produto de delivery criado: ${payload.name}`, name: currentUser?.name, role: currentUser?.role });
      } else {
        const { error } = await updateProduct(item.produto_id, payload);
        if (error) {
          setSalvando(false);
          return setErro(error.message || "Não foi possível salvar o produto.");
        }
      }
    }

    // Foto: se o dono escolheu uma nova, sobe agora (produto_id já existe).
    let fotoFinal = fotoUrl.trim() || null;
    if (fotoFile) {
      const { url, error: eFoto } = await enviarFotoProduto({
        file: fotoFile,
        tenantId: tenant?.id,
        produtoId,
      });
      if (eFoto) {
        setSalvando(false);
        return setErro(eFoto.message || "Não foi possível enviar a foto.");
      }
      fotoFinal = url;
    }

    // Camada de delivery (sempre).
    const { error } = await salvarProdutoDelivery({
      id: item?.id,
      produto_id: produtoId,
      foto_url: fotoFinal,
      descricao: descricao.trim() || null,
      disponivel,
      ordem: item?.ordem ?? 0,
    });
    setSalvando(false);
    if (error) return setErro(error.message || "Não foi possível salvar no delivery.");

    if (!ehAddon) await recarregarProdutos();
    aviso(modo === "novo" ? "Produto adicionado ao delivery." : "Alterações salvas.", "ok");
    onSalvo();
  };

  return createPortal(
    <div className="delivery-view__overlay" {...fecharAoClicarFora(onFechar)}>
      <div className="delivery-view__modal" style={{ background: varColor(C.card), color: varColor(C.text) }}>
        <div className="delivery-view__modal-topo">
          <div className="delivery-view__modal-titulo" style={{ fontWeight: 800 }}>
            {modo === "novo" ? "Novo produto do delivery" : "Editar produto do delivery"}
          </div>
          <button onClick={onFechar} className="delivery-view__modal-fechar" style={{ color: varColor(C.muted) }}>
            <LuX size={18} />
          </button>
        </div>

        {/* Standalone: dados do produto. Addon: só referência do PDV. */}
        {ehAddon ? (
          <div className="delivery-view__aviso" style={{ background: alfa(C.blue, "0c"), border: `1px solid ${alfa(C.blue, "22")}` }}>
            <strong>{prod?.name || "Produto"}</strong>
            {prod?.price != null ? ` · ${formatarReais(prod.price)}` : ""} — nome e preço vêm do
            cadastro do PDV. Aqui você ajusta como ele aparece no delivery.
          </div>
        ) : (
          <>
            <div className="delivery-view__campo">
              <label className="delivery-view__label">Nome *</label>
              <input className="delivery-view__input" style={inputStyle(sz)} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: X-Salada" maxLength={60} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div className="delivery-view__campo" style={{ flex: 1 }}>
                <label className="delivery-view__label">Preço (R$) *</label>
                <input className="delivery-view__input" style={inputStyle(sz)} type="number" min="0" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
              </div>
              <div className="delivery-view__campo" style={{ width: 88 }}>
                <label className="delivery-view__label">Emoji</label>
                <input className="delivery-view__input" style={{ ...inputStyle(sz), textAlign: "center" }} value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🍔" maxLength={4} />
              </div>
            </div>
            <div className="delivery-view__campo">
              <label className="delivery-view__label">Categoria</label>
              <input className="delivery-view__input" style={inputStyle(sz)} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex: Lanches" maxLength={40} list="delivery-cats" />
              <datalist id="delivery-cats">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          </>
        )}

        {/* Camada de delivery (ambos os modos) — foto do produto (upload) */}
        <div className="delivery-view__campo">
          <label className="delivery-view__label">
            <LuImage size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            Foto do produto
          </label>
          <div className="delivery-view__foto-upload">
            {temFoto ? (
              <img className="delivery-view__foto-preview" src={fotoPreview || fotoUrl} alt="Prévia da foto do produto" style={{ border: `1px solid ${alfa(C.muted, "22")}` }} />
            ) : (
              <div className="delivery-view__foto-vazia" style={{ background: alfa(C.muted, "10"), color: varColor(C.muted) }}>
                <LuImage size={26} />
              </div>
            )}
            <div className="delivery-view__foto-acoes">
              <input
                ref={fotoInputRef}
                type="file"
                accept={ACCEPT_IMAGEM}
                onChange={escolherFoto}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                className="delivery-view__btn delivery-view__btn--sm"
                style={{ background: alfa(C.accent, "12"), color: varColor(C.accent), padding: "9px 14px" }}
              >
                <LuImage size={14} /> {temFoto ? "Trocar foto" : "Escolher foto"}
              </button>
              {temFoto && (
                <button
                  type="button"
                  onClick={removerFoto}
                  className="delivery-view__btn delivery-view__btn--sm"
                  style={{ background: alfa(C.red, "10"), color: varColor(C.red), padding: "9px 14px" }}
                >
                  <LuTrash2 size={14} /> Remover
                </button>
              )}
              <span className="delivery-view__hint" style={{ color: varColor(C.muted) }}>
                Tire do celular ou escolha da galeria. Ajustamos o tamanho automaticamente.
              </span>
            </div>
          </div>
        </div>
        <div className="delivery-view__campo">
          <label className="delivery-view__label">Descrição</label>
          <textarea className="delivery-view__textarea" style={inputStyle(sz)} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Pão, hambúrguer, queijo, alface e tomate." maxLength={280} />
        </div>
        <label className="delivery-view__switch">
          <span>Disponível no cardápio</span>
          <input type="checkbox" checked={disponivel} onChange={(e) => setDisponivel(e.target.checked)} style={{ width: 20, height: 20 }} />
        </label>

        {erro && (
          <div className="delivery-view__aviso" style={{ background: alfa(C.red, "12"), color: varColor(C.red), border: `1px solid ${alfa(C.red, "33")}` }}>
            ⚠️ {erro}
          </div>
        )}

        <div className="delivery-view__modal-botoes">
          <button onClick={onFechar} className="delivery-view__btn" style={{ background: alfa(C.muted, "15"), color: varColor(C.muted), padding: "11px 0" }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="delivery-view__btn" style={{ background: varColor(C.accent), color: "#fff", padding: "11px 0" }}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ════════════════════════════════════════════════════════════════
// ABA 2 — Complementos (BIBLIOTECA de grupos reutilizáveis)
//
// Intuitivo: um só lugar onde o dono cria um grupo UMA vez (ex.:
// "Adicionais") e marca, num checklist, em quais produtos ele aparece —
// em vez de recriar o mesmo grupo produto a produto. O mesmo grupo
// reaparece em todos os itens marcados; editar seus itens reflete em
// todos de uma vez. Nada some do cardápio: os grupos antigos foram
// migrados para essa biblioteca com seu produto já vinculado.
// ════════════════════════════════════════════════════════════════
function AbaComplementos({ sz, isAdmin, itens, products, aviso }) {
  const [grupos, setGrupos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novoGrupo, setNovoGrupo] = useState("");
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  // Qual grupo está aberto para edição. null = grade de cards.
  const [grupoAbertoId, setGrupoAbertoId] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await listarBibliotecaGrupos();
    setCarregando(false);
    if (error) return aviso("Não foi possível carregar os complementos.", "err");
    setGrupos(data);
  }, [aviso]);

  useEffect(() => { carregar(); }, [carregar]);

  const addGrupo = async () => {
    const nome = novoGrupo.trim();
    if (!nome || salvandoGrupo) return;
    setSalvandoGrupo(true);
    const { data, error } = await salvarGrupoComplemento({ nome, min_escolhas: 0, max_escolhas: 1, ordem: grupos.length });
    setSalvandoGrupo(false);
    if (error) return aviso("Não foi possível criar o grupo.", "err");
    setNovoGrupo("");
    await carregar();
    // Abre o grupo recém-criado direto na edição (caminho feliz: criou → já configura).
    if (data?.id) setGrupoAbertoId(data.id);
  };

  if (carregando) {
    return <div className="delivery-view__carregando" style={{ color: varColor(C.muted), padding: 16 }}>Carregando…</div>;
  }

  // ── Editor aberto: mostra só o grupo escolhido, limpo, com "voltar" ──
  const grupoAberto = grupoAbertoId ? grupos.find((g) => g.id === grupoAbertoId) : null;
  if (grupoAberto) {
    return (
      <GrupoEditor
        sz={sz}
        isAdmin={isAdmin}
        grupo={grupoAberto}
        biblioteca={grupos}
        products={products}
        itensCardapio={itens}
        aviso={aviso}
        recarregar={carregar}
        onVoltar={() => setGrupoAbertoId(null)}
        onRemovido={() => setGrupoAbertoId(null)}
      />
    );
  }

  // ── Grade de cards (visão padrão) ───────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div className="delivery-view__hint" style={{ flex: 1, minWidth: 200, color: varColor(C.muted) }}>
          Crie um grupo uma vez (ex.: “Adicionais”, “Molhos”) e marque em quais produtos ele aparece. Toque num card para editar.
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", maxWidth: 480 }}>
            <input
              className="delivery-view__input"
              style={inputStyle(sz)}
              value={novoGrupo}
              onChange={(e) => setNovoGrupo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGrupo()}
              placeholder="Novo grupo (ex.: Adicionais)"
              maxLength={60}
            />
            <button onClick={addGrupo} disabled={!novoGrupo.trim() || salvandoGrupo} className="delivery-view__btn" style={{ background: varColor(C.accent), color: "#fff", padding: "10px 16px", whiteSpace: "nowrap" }}>
              <LuPlus size={14} /> Grupo
            </button>
          </div>
        )}
      </div>

      {grupos.length === 0 ? (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div className="delivery-view__vazio-emoji" style={{ opacity: 0.3 }}>🧩</div>
          <div className="delivery-view__vazio-titulo" style={{ fontWeight: 600 }}>Nenhum grupo ainda</div>
          <div className="delivery-view__vazio-desc">Crie o primeiro grupo (ex.: “Adicionais”) e escolha em quais produtos ele aparece.</div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
            gap: 12,
          }}
        >
          {grupos.map((g) => (
            <GrupoCardMini
              key={g.id}
              sz={sz}
              grupo={g}
              onAbrir={() => setGrupoAbertoId(g.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Card médio, clicável, da grade da biblioteca. Só LEITURA: mostra o nome,
// resumo (obrigatório/opcional), quantos itens tem e em quantos produtos
// aparece. Tocar abre o editor. Nada de campo editável aqui — a edição
// mora no menu limpo (GrupoEditor), pra grade ficar fácil de escanear.
function GrupoCardMini({ sz, grupo, onAbrir }) {
  const nItens = (grupo.itens || []).length;
  const nProdutos = (grupo.produtoIds || []).length;
  const nSubgrupos = (grupo.subgrupoIds || []).length;
  const obrigatorio = Number(grupo.min_escolhas) > 0;

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="delivery-view__grupo-card"
      style={{
        display: "flex", flexDirection: "column", gap: 8, textAlign: "left",
        border: `1px solid ${varColor(C.border)}`, borderRadius: 14,
        padding: 14, background: varColor(C.card), cursor: "pointer",
        width: "100%", minHeight: 116,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="delivery-view__grupo-nome" style={{ flex: 1, fontWeight: 700, color: varColor(C.text) }}>
          {grupo.nome}
        </span>
        <LuChevronRight size={18} style={{ color: varColor(C.muted), flexShrink: 0 }} />
      </div>

      <span
        className="delivery-view__grupo-selo"
        style={{
          alignSelf: "flex-start", fontWeight: 600,
          padding: "2px 8px", borderRadius: 999,
          background: obrigatorio ? alfa(C.accent, "15") : varColor(C.surface),
          color: obrigatorio ? varColor(C.accent) : varColor(C.muted),
        }}
      >
        {obrigatorio ? "Obrigatório" : "Opcional"} · {grupo.min_escolhas ?? 0}–{grupo.max_escolhas ?? 1}
      </span>

      <div className="delivery-view__grupo-stats" style={{ marginTop: "auto", display: "flex", gap: 12, color: varColor(C.muted), flexWrap: "wrap" }}>
        <span>{nItens} {nItens === 1 ? "item" : "itens"}</span>
        <span>·</span>
        <span>{nProdutos} {nProdutos === 1 ? "produto" : "produtos"}</span>
        {nSubgrupos > 0 && (
          <>
            <span>·</span>
            <span>{nSubgrupos} {nSubgrupos === 1 ? "subgrupo" : "subgrupos"}</span>
          </>
        )}
      </div>
    </button>
  );
}

// Menu de busca para escolher um produto JÁ CRIADO como complemento.
// Digita → lista os itens do catálogo que casam (menos os já no grupo) →
// clica para escolher. Sem digitação técnica: só buscar e tocar.
function SeletorProdutoComplemento({ sz, products, idsExcluir, onEscolher }) {
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);

  const resultados = useMemo(
    () => filtrarProdutos(products, termo, idsExcluir),
    [products, termo, idsExcluir]
  );

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
      <input
        className="delivery-view__input"
        style={{ ...inputStyle(sz), width: "100%" }}
        value={termo}
        onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 120)}
        placeholder="Buscar item já criado…"
      />
      {aberto && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
            maxHeight: 240, overflowY: "auto",
            background: varColor(C.card), border: `1px solid ${varColor(C.border)}`,
            borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
          }}
        >
          {resultados.length === 0 ? (
            <div className="delivery-view__hint" style={{ padding: "10px 12px", color: varColor(C.muted) }}>
              {(products || []).length === 0
                ? "Nenhum produto criado ainda."
                : "Nenhum item encontrado."}
            </div>
          ) : (
            resultados.map((p) => (
              <button
                key={p.id}
                type="button"
                // onMouseDown (antes do blur) garante que o clique registra.
                onMouseDown={(e) => { e.preventDefault(); onEscolher(p); setTermo(""); setAberto(false); }}
                className="delivery-view__btn"
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "10px 12px", background: "transparent", border: "none",
                  borderBottom: `1px solid ${alfa(C.border, "60")}`,
                  color: varColor(C.text), textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {p.emoji && <span className="delivery-view__opcao-emoji">{p.emoji}</span>}
                <span style={{ flex: 1 }}>{p.name}</span>
                <span className="delivery-view__opcao-meta" style={{ color: varColor(C.muted) }}>
                  {formatarReais(p.price)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Menu de busca para anexar um grupo JÁ CRIADO como subgrupo (aninhamento
// reciclável estilo iFood). Digita → lista os grupos candidatos (a lista já
// vem sem ele mesmo, sem os já anexados e sem os que criariam ciclo) →
// clica pra anexar. Mesmo padrão do seletor de produto: só buscar e tocar.
function SeletorSubgrupo({ sz, candidatos, onEscolher }) {
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);

  const resultados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    const base = Array.isArray(candidatos) ? candidatos : [];
    if (!t) return base;
    return base.filter((g) => String(g.nome || "").toLowerCase().includes(t));
  }, [candidatos, termo]);

  return (
    <div style={{ position: "relative", maxWidth: 420 }}>
      <LuSearch
        size={15}
        style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: varColor(C.muted), pointerEvents: "none" }}
      />
      <input
        className="delivery-view__input"
        style={{ ...inputStyle(sz), width: "100%", paddingLeft: 32 }}
        value={termo}
        onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 120)}
        placeholder="Buscar grupo para anexar como subgrupo…"
      />
      {aberto && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
            maxHeight: 240, overflowY: "auto",
            background: varColor(C.card), border: `1px solid ${varColor(C.border)}`,
            borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
          }}
        >
          {resultados.length === 0 ? (
            <div className="delivery-view__hint" style={{ padding: "10px 12px", color: varColor(C.muted) }}>
              Nenhum grupo encontrado.
            </div>
          ) : (
            resultados.map((g) => {
              const nSub = (g.itens || []).length;
              return (
                <button
                  key={g.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); onEscolher(g); setTermo(""); setAberto(false); }}
                  className="delivery-view__btn"
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "10px 12px", background: "transparent", border: "none",
                    borderBottom: `1px solid ${alfa(C.border, "60")}`,
                    color: varColor(C.text), textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <LuPlus size={13} style={{ color: varColor(C.accent), flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{g.nome}</span>
                  <span className="delivery-view__opcao-meta" style={{ color: varColor(C.muted) }}>
                    {nSub} {nSub === 1 ? "item" : "itens"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// Menu de edição LIMPO de um grupo. Abre a partir de um card da grade
// (GrupoCardMini). Header com "voltar" + nome; corpo com regras (mín/máx),
// itens do grupo e a busca multi-seleção de "aparece nestes produtos".
function GrupoEditor({ sz, isAdmin, grupo, biblioteca = [], products, itensCardapio = [], aviso, recarregar, onVoltar, onRemovido }) {
  // ── Rascunho local — NADA persiste até "Salvar" ─────────────────────
  // Todo o editor é um rascunho: nome, mín/máx, itens e "aparece nestes
  // produtos" ficam só na memória. "Salvar" grava tudo de uma vez; "Voltar"
  // com pendências pede confirmação. Assim o dono nunca altera um grupo sem
  // querer — o que estava salvo fica intacto até ele confirmar.
  const mapItem = (it) => ({ id: it.id, produto_id: it.produto_id, nome: it.nome, preco: it.preco });
  const [nome, setNome] = useState(grupo.nome);
  const [min, setMin] = useState(String(grupo.min_escolhas ?? 0));
  const [max, setMax] = useState(String(grupo.max_escolhas ?? 1));
  const [itens, setItens] = useState(() => (grupo.itens || []).map(mapItem));
  const [produtoIds, setProdutoIds] = useState(grupo.produtoIds ?? []);
  // Subgrupos aninhados (estilo iFood): ids dos grupos-filho, em ordem.
  const [subgrupoIds, setSubgrupoIds] = useState(() => (grupo.subgrupoIds ?? []).map(String));
  const [selecionadoProd, setSelecionadoProd] = useState(null);
  const [novoPreco, setNovoPreco] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmarVoltar, setConfirmarVoltar] = useState(false);
  const [confirmarRemover, setConfirmarRemover] = useState(false);

  // Ressincroniza o rascunho quando o grupo é recarregado do servidor (só
  // acontece após salvar/remover — durante a edição a referência do grupo é
  // estável, então edições em andamento nunca são perdidas por re-render).
  useEffect(() => {
    setNome(grupo.nome);
    setMin(String(grupo.min_escolhas ?? 0));
    setMax(String(grupo.max_escolhas ?? 1));
    setItens((grupo.itens || []).map(mapItem));
    setProdutoIds(grupo.produtoIds ?? []);
    setSubgrupoIds((grupo.subgrupoIds ?? []).map(String));
    setSelecionadoProd(null);
    setNovoPreco("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo]);

  // Há algo diferente do que está salvo? Controla o botão "Salvar" e o
  // aviso ao voltar.
  const sujo = useMemo(() => {
    if ((nome ?? "").trim() !== (grupo.nome ?? "")) return true;
    if ((Number(min) || 0) !== (Number(grupo.min_escolhas) || 0)) return true;
    if ((Number(max) || 1) !== (Number(grupo.max_escolhas) || 1)) return true;
    if (itens.some((i) => !i.id)) return true; // itens novos ainda não salvos
    // Ordem importa (reordenar arrastando também é alteração a salvar):
    // compara os ids preservando a sequência, não como conjunto ordenado.
    const idsOrig = (grupo.itens || []).map((i) => String(i.id));
    const idsAtual = itens.filter((i) => i.id).map((i) => String(i.id));
    if (idsOrig.length !== idsAtual.length) return true;
    if (idsOrig.some((v, k) => v !== idsAtual[k])) return true;
    const pOrig = (grupo.produtoIds || []).map(String).sort();
    const pAtual = produtoIds.map(String).sort();
    if (pOrig.length !== pAtual.length) return true;
    if (pOrig.some((v, k) => v !== pAtual[k])) return true;
    // Subgrupos: ordem também conta (arrastar reordena) → compara em sequência.
    const sOrig = (grupo.subgrupoIds || []).map(String);
    const sAtual = subgrupoIds.map(String);
    if (sOrig.length !== sAtual.length) return true;
    if (sOrig.some((v, k) => v !== sAtual[k])) return true;
    return false;
  }, [nome, min, max, itens, produtoIds, subgrupoIds, grupo]);

  // Marca/desmarca "aparece nestes produtos" — só no rascunho.
  const alternarProduto = (produtoId) => {
    setProdutoIds((prev) => alternarProdutoId(prev, produtoId));
  };

  // produto_id já no rascunho — não deixa adicionar o mesmo item duas vezes.
  const idsNoGrupo = itens.map((it) => it.produto_id).filter((x) => x != null);

  const escolherProduto = (prod) => {
    setSelecionadoProd(prod);
    // Pré-preenche o preço com o do PDV, mas fica editável (preço do
    // delivery pode ser diferente do balcão — decisão do dono).
    setNovoPreco(prod?.price != null ? String(prod.price) : "");
  };

  // Adiciona o item só ao rascunho (o id nasce quando "Salvar" gravar).
  const addItem = () => {
    if (!selecionadoProd) return;
    setItens((prev) => [
      ...prev,
      {
        _tempId: `novo-${Date.now()}`,
        produto_id: selecionadoProd.id,
        nome: selecionadoProd.name,
        preco: parseFloat(String(novoPreco).replace(",", ".")) || 0,
      },
    ]);
    setSelecionadoProd(null);
    setNovoPreco("");
  };

  // Remove o item do rascunho (some do banco só quando "Salvar" rodar).
  const removerItem = (item) => {
    setItens((prev) => prev.filter((x) => (x.id ?? x._tempId) !== (item.id ?? item._tempId)));
  };

  // Reordena os itens do rascunho pela nova ordem de ids (arrastar). Só
  // muda a sequência local; persiste ao "Salvar".
  const reordenarItens = (idsEmOrdem) => {
    setItens((prev) => {
      const chave = (x) => String(x.id ?? x._tempId);
      const porId = new Map(prev.map((x) => [chave(x), x]));
      return idsEmOrdem.map((id) => porId.get(String(id))).filter(Boolean);
    });
  };

  // ── Subgrupos (grupos aninhados, recicláveis) ───────────────────────
  // A biblioteca inteira, indexada por id, para resolver nome/resumo do
  // subgrupo a partir do id guardado no rascunho.
  const bibliotecaPorId = useMemo(() => {
    const m = new Map();
    for (const g of biblioteca || []) m.set(String(g.id), g);
    return m;
  }, [biblioteca]);

  // Anexa um grupo existente como subgrupo (só rascunho). O seletor já
  // exclui candidatos que criariam ciclo, mas revalidamos por garantia.
  const addSubgrupo = (grupoFilho) => {
    const fid = String(grupoFilho.id);
    setSubgrupoIds((prev) => {
      if (prev.includes(fid)) return prev;
      if (subgrupoCriaCiclo(biblioteca, grupo.id, fid)) return prev;
      return [...prev, fid];
    });
  };

  const removerSubgrupo = (filhoId) => {
    setSubgrupoIds((prev) => prev.filter((x) => x !== String(filhoId)));
  };

  const reordenarSubs = (idsEmOrdem) => {
    setSubgrupoIds(idsEmOrdem.map(String));
  };

  // Candidatos a subgrupo: todo grupo da biblioteca menos ele mesmo, os
  // já anexados e os que fechariam um ciclo (prevenção de erro > erro).
  const candidatosSubgrupo = useMemo(
    () =>
      (biblioteca || []).filter((g) => {
        const gid = String(g.id);
        if (gid === String(grupo.id)) return false;
        if (subgrupoIds.includes(gid)) return false;
        if (subgrupoCriaCiclo(biblioteca, grupo.id, gid)) return false;
        return true;
      }),
    [biblioteca, grupo.id, subgrupoIds]
  );

  // Grava TUDO de uma vez: config do grupo, itens (novos/removidos) e vínculos.
  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);

    // 1) Config do grupo (nome, mín, máx).
    const g = await salvarGrupoComplemento({
      id: grupo.id, nome: nome.trim() || grupo.nome,
      min_escolhas: Number(min) || 0, max_escolhas: Number(max) || 1, ordem: grupo.ordem,
    });
    if (g.error) { setSalvando(false); return aviso("Não foi possível salvar o grupo.", "err"); }

    // 2) Itens: remove os tirados, grava o resto NA ORDEM do rascunho.
    // Percorrer `itens` em ordem e gravar ordem = índice persiste tanto os
    // novos quanto a reordenação por arrasto (upsert atualiza os que já têm id).
    const idsAtuais = new Set(itens.filter((i) => i.id).map((i) => String(i.id)));
    const removidos = (grupo.itens || []).filter((o) => !idsAtuais.has(String(o.id)));
    for (const it of removidos) {
      const { error } = await removerComplemento(it.id);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar os itens.", "err"); }
    }
    for (let k = 0; k < itens.length; k++) {
      const it = itens[k];
      const { error } = await salvarComplemento({
        id: it.id, grupo_id: grupo.id, produto_id: it.produto_id, nome: it.nome,
        preco: it.preco, disponivel: true, ordem: k,
      });
      if (error) { setSalvando(false); return aviso("Não foi possível salvar os itens.", "err"); }
    }

    // 3) "Aparece nestes produtos": vincula os novos, desvincula os tirados.
    const pOrig = (grupo.produtoIds || []).map(String);
    const pAtual = produtoIds.map(String);
    for (const pid of pAtual.filter((x) => !pOrig.includes(x))) {
      const { error } = await vincularGrupoProduto(grupo.id, pid);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar onde o grupo aparece.", "err"); }
    }
    for (const pid of pOrig.filter((x) => !pAtual.includes(x))) {
      const { error } = await desvincularGrupoProduto(grupo.id, pid);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar onde o grupo aparece.", "err"); }
    }

    // 4) Subgrupos aninhados: desanexa os tirados, anexa os novos e grava
    // a ordem final (arrastar reordena). Diff por id, ordem = índice.
    const sOrig = (grupo.subgrupoIds || []).map(String);
    const sAtual = subgrupoIds.map(String);
    for (const fid of sOrig.filter((x) => !sAtual.includes(x))) {
      const { error } = await desvincularSubgrupo(grupo.id, fid);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar os subgrupos.", "err"); }
    }
    for (let k = 0; k < sAtual.length; k++) {
      const { error } = await vincularSubgrupo(grupo.id, sAtual[k], k);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar os subgrupos.", "err"); }
    }
    // Reforça a ordem dos que já existiam (o upsert com ignoreDuplicates
    // não atualiza a ordem de um vínculo pré-existente).
    if (sAtual.length > 0) {
      const { error } = await reordenarSubgrupos(grupo.id, sAtual);
      if (error) { setSalvando(false); return aviso("Não foi possível salvar os subgrupos.", "err"); }
    }

    setSalvando(false);
    aviso("Grupo salvo.", "ok");
    await recarregar(); // recarrega → o effect ressincroniza o rascunho.
  };

  // Voltar: se há rascunho pendente, confirma antes de descartar.
  const tentarVoltar = () => {
    if (sujo) { setConfirmarVoltar(true); return; }
    onVoltar();
  };

  // Remove o grupo inteiro (ação destrutiva — só após confirmar no modal).
  const removerGrupo = async () => {
    const { error } = await removerGrupoComplemento(grupo.id);
    if (error) return aviso("Não foi possível remover o grupo.", "err");
    setConfirmarRemover(false);
    await recarregar();
    onRemovido?.();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header do editor: voltar + título + Salvar (trava de tudo) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={tentarVoltar}
          className="delivery-view__btn delivery-view__btn--sm"
          style={{ display: "flex", alignItems: "center", gap: 6, background: varColor(C.surface), color: varColor(C.text), padding: "8px 12px", whiteSpace: "nowrap" }}
        >
          <LuArrowLeft size={15} /> Voltar
        </button>
        <span className="delivery-view__editor-titulo" style={{ flex: 1, fontWeight: 700, color: varColor(C.text) }}>
          <span style={{ fontWeight: 600, color: varColor(C.muted) }}>nome: </span>
          {nome || grupo.nome}
        </span>
        {isAdmin && (
          <>
            {sujo && (
              <span className="delivery-view__hint" style={{ color: varColor(C.red), fontWeight: 600, whiteSpace: "nowrap" }}>
                Alterações não salvas
              </span>
            )}
            <button
              type="button"
              onClick={salvar}
              disabled={!sujo || salvando}
              className="delivery-view__btn delivery-view__btn--sm"
              style={{ display: "flex", alignItems: "center", gap: 6, background: sujo ? varColor(C.accent) : alfa(C.muted, "20"), color: sujo ? "#fff" : varColor(C.muted), padding: "9px 16px", fontWeight: 700, whiteSpace: "nowrap", cursor: sujo && !salvando ? "pointer" : "default" }}
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </>
        )}
      </div>

    <div style={{ border: `1px solid ${varColor(C.border)}`, borderRadius: 14, padding: 16, background: varColor(C.card) }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="delivery-view__input"
          style={{ ...inputStyle(sz), flex: 1, minWidth: 160, fontWeight: 700 }}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={!isAdmin}
          maxLength={60}
        />
        {/* Obrigatório × Opcional — o cliente é obrigado a marcar este grupo?
            Seletor explícito no lugar do número cru "mín": opcional → min=0,
            obrigatório → min≥1. O dono escolhe em palavras, sem pensar em
            número (Princípio nº1 — intuitividade acima de densidade). */}
        <div
          role="group"
          aria-label="O cliente é obrigado a escolher neste grupo?"
          style={{ display: "inline-flex", borderRadius: 999, border: `1px solid ${varColor(C.border)}`, overflow: "hidden" }}
        >
          {[
            { obrig: false, texto: "Opcional" },
            { obrig: true, texto: "Obrigatório" },
          ].map((opt) => {
            const ativo = (Number(min) > 0) === opt.obrig;
            return (
              <button
                key={opt.texto}
                type="button"
                aria-pressed={ativo}
                disabled={!isAdmin}
                onClick={() => isAdmin && setMin(opt.obrig ? String(Math.max(1, Number(min) || 0)) : "0")}
                className="delivery-view__editor-toggle"
                style={{
                  padding: "8px 14px", fontWeight: 700, border: "none",
                  background: ativo ? varColor(C.accent) : "transparent",
                  color: ativo ? "#fff" : varColor(C.muted),
                  cursor: isAdmin ? "pointer" : "default", whiteSpace: "nowrap",
                }}
              >
                {opt.texto}
              </button>
            );
          })}
        </div>
        <label className="delivery-view__hint" style={{ color: varColor(C.muted), display: "flex", alignItems: "center", gap: 4 }}>
          máx
          <input className="delivery-view__input" style={{ ...inputStyle(sz), width: 56 }} type="number" min="1" value={max} onChange={(e) => setMax(e.target.value)} disabled={!isAdmin} />
        </label>
        {isAdmin && (
          <button
            onClick={() => setConfirmarRemover(true)}
            title="Remover grupo"
            className="delivery-view__btn delivery-view__btn--sm"
            style={{ background: alfa(C.red, "10"), color: varColor(C.red), padding: "8px 10px" }}
          >
            <LuTrash2 size={13} />
          </button>
        )}
      </div>
      <div className="delivery-view__hint" style={{ color: varColor(C.muted), marginTop: 4 }}>
        {Number(min) > 0
          ? `Obrigatório — o cliente precisa escolher ${Number(max) > 1 ? `de ${min || 1} a ${max}` : "1 opção"}`
          : `Opcional — o cliente pode escolher ${Number(max) > 1 ? `até ${max}` : "1, se quiser"}`}
      </div>

      {/* Itens do grupo — arraste pela alça (⠿) para reordenar (cima/baixo).
          A ordem aqui é a mesma que o cliente vê na vitrine. */}
      <div style={{ marginTop: 10 }}>
        <ListaArrastavel
          itens={itens}
          idDe={(it) => it.id ?? it._tempId}
          onReordenar={reordenarItens}
          renderItem={(it, { alca }) => (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: varColor(C.surface), marginBottom: 6 }}>
              {isAdmin && <span {...alca}>⠿</span>}
              <span className="delivery-view__item-nome" style={{ flex: 1 }}>{it.nome}</span>
              <span className="delivery-view__item-preco" style={{ color: varColor(C.accent), fontWeight: 600 }}>
                {Number(it.preco) > 0 ? `+ ${formatarReais(it.preco)}` : "Grátis"}
              </span>
              {isAdmin && (
                <button
                  onClick={() => removerItem(it)}
                  className="delivery-view__modal-fechar"
                  style={{ color: varColor(C.muted) }}
                >
                  <LuX size={14} />
                </button>
              )}
            </div>
          )}
        />
      </div>

      {isAdmin && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          {selecionadoProd ? (
            // Produto escolhido: mostra o item + preço (editável) + confirmar.
            <>
              <div className="delivery-view__selecionado" style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180, padding: "8px 10px", borderRadius: 8, background: alfa(C.accent, "12"), color: varColor(C.accent), fontWeight: 600 }}>
                {selecionadoProd.emoji && <span>{selecionadoProd.emoji}</span>}
                <span style={{ flex: 1 }}>{selecionadoProd.name}</span>
                <button
                  type="button"
                  onClick={() => { setSelecionadoProd(null); setNovoPreco(""); }}
                  className="delivery-view__modal-fechar"
                  title="Trocar item"
                  style={{ color: varColor(C.accent) }}
                >
                  <LuX size={14} />
                </button>
              </div>
              <input className="delivery-view__input" style={{ ...inputStyle(sz), width: 96 }} type="number" min="0" step="0.01" value={novoPreco} onChange={(e) => setNovoPreco(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="R$ 0,00" />
              <button onClick={addItem} className="delivery-view__btn delivery-view__btn--sm" style={{ background: varColor(C.accent), color: "#fff", padding: "8px 14px" }}>
                <LuPlus size={13} /> Adicionar
              </button>
            </>
          ) : (
            // Ainda escolhendo: menu de busca dos produtos já criados.
            <SeletorProdutoComplemento
              sz={sz}
              products={products}
              idsExcluir={idsNoGrupo}
              onEscolher={escolherProduto}
            />
          )}
        </div>
      )}

      {/* Subgrupos aninhados (estilo iFood): anexa OUTROS grupos da
          biblioteca dentro deste. Cada subgrupo continua reutilizável
          sozinho — aqui só se reaproveita. Arraste pela alça pra ordenar. */}
      {isAdmin && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${alfa(C.border, "60")}` }}>
          <div className="delivery-view__secao-titulo" style={{ fontWeight: 600, color: varColor(C.text), marginBottom: 2 }}>
            <LuClipboardList size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Subgrupos deste grupo
          </div>
          <div className="delivery-view__hint" style={{ color: varColor(C.muted), marginBottom: 8 }}>
            Reaproveite grupos já criados aqui dentro. Cada subgrupo mantém suas próprias
            regras (obrigatório/opcional) e continua disponível sozinho em outros produtos.
          </div>

          {subgrupoIds.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <ListaArrastavel
                itens={subgrupoIds}
                idDe={(id) => id}
                onReordenar={reordenarSubs}
                renderItem={(id, { alca }) => {
                  const sub = bibliotecaPorId.get(String(id));
                  const nSub = (sub?.itens || []).length;
                  const obrig = Number(sub?.min_escolhas) > 0;
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: varColor(C.surface), marginBottom: 6 }}>
                      <span {...alca}>⠿</span>
                      <span className="delivery-view__item-nome" style={{ flex: 1, fontWeight: 600, color: varColor(C.text) }}>
                        {sub?.nome || "(grupo removido)"}
                      </span>
                      <span className="delivery-view__hint" style={{ color: varColor(C.muted) }}>
                        {obrig ? "Obrigatório" : "Opcional"} · {nSub} {nSub === 1 ? "item" : "itens"}
                      </span>
                      <button
                        onClick={() => removerSubgrupo(id)}
                        className="delivery-view__modal-fechar"
                        title="Remover subgrupo (não apaga o grupo)"
                        style={{ color: varColor(C.muted) }}
                      >
                        <LuX size={14} />
                      </button>
                    </div>
                  );
                }}
              />
            </div>
          )}

          {candidatosSubgrupo.length > 0 ? (
            <SeletorSubgrupo sz={sz} candidatos={candidatosSubgrupo} onEscolher={addSubgrupo} />
          ) : (
            <div className="delivery-view__hint" style={{ color: varColor(C.muted) }}>
              {biblioteca.length <= 1
                ? "Crie outros grupos na biblioteca para reaproveitá-los aqui como subgrupos."
                : "Nenhum outro grupo disponível para anexar aqui."}
            </div>
          )}
        </div>
      )}

      {/* Onde este grupo aparece — busca multi-seleção dos produtos do cardápio. */}
      {isAdmin && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${alfa(C.border, "60")}` }}>
          <div className="delivery-view__secao-titulo" style={{ fontWeight: 600, color: varColor(C.text), marginBottom: 6 }}>
            <LuUtensils size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Aparece nestes produtos
          </div>
          {itensCardapio.length === 0 ? (
            <div className="delivery-view__hint" style={{ color: varColor(C.muted) }}>
              Adicione produtos ao cardápio para vincular este grupo a eles.
            </div>
          ) : (
            <SeletorProdutosMulti
              sz={sz}
              itens={itensCardapio}
              produtoIds={produtoIds}
              vinculando={false}
              onAlternar={alternarProduto}
            />
          )}
        </div>
      )}
    </div>

      {/* Confirmação ao voltar com rascunho pendente (avisa e confirma) */}
      {confirmarVoltar && createPortal(
        <div className="delivery-view__overlay" {...fecharAoClicarFora(() => setConfirmarVoltar(false))}>
          <div className="delivery-view__modal" style={{ background: varColor(C.card), color: varColor(C.text), maxWidth: 420 }}>
            <div className="delivery-view__modal-topo">
              <div className="delivery-view__modal-titulo" style={{ fontWeight: 800 }}>Alterações não salvas</div>
              <button onClick={() => setConfirmarVoltar(false)} className="delivery-view__modal-fechar" style={{ color: varColor(C.muted) }}>
                <LuX size={18} />
              </button>
            </div>
            <div className="delivery-view__modal-texto" style={{ color: varColor(C.text) }}>
              Você tem alterações não salvas neste grupo. Se sair agora, elas serão descartadas e o grupo continua como estava.
            </div>
            <div className="delivery-view__modal-botoes">
              <button onClick={() => setConfirmarVoltar(false)} className="delivery-view__btn" style={{ background: alfa(C.muted, "15"), color: varColor(C.muted), padding: "11px 0" }}>
                Continuar editando
              </button>
              <button onClick={() => { setConfirmarVoltar(false); onVoltar(); }} className="delivery-view__btn" style={{ background: varColor(C.red), color: "#fff", padding: "11px 0" }}>
                Descartar e sair
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Confirmação da remoção do grupo inteiro (ação destrutiva) */}
      {confirmarRemover && createPortal(
        <div className="delivery-view__overlay" {...fecharAoClicarFora(() => setConfirmarRemover(false))}>
          <div className="delivery-view__modal" style={{ background: varColor(C.card), color: varColor(C.text), maxWidth: 420 }}>
            <div className="delivery-view__modal-topo">
              <div className="delivery-view__modal-titulo" style={{ fontWeight: 800 }}>Remover grupo</div>
              <button onClick={() => setConfirmarRemover(false)} className="delivery-view__modal-fechar" style={{ color: varColor(C.muted) }}>
                <LuX size={18} />
              </button>
            </div>
            <div className="delivery-view__modal-texto" style={{ color: varColor(C.text) }}>
              Remover o grupo <strong>{grupo.nome}</strong>? Ele deixará de aparecer em todos os produtos vinculados. Essa ação não pode ser desfeita.
            </div>
            <div className="delivery-view__modal-botoes">
              <button onClick={() => setConfirmarRemover(false)} className="delivery-view__btn" style={{ background: alfa(C.muted, "15"), color: varColor(C.muted), padding: "11px 0" }}>
                Cancelar
              </button>
              <button onClick={removerGrupo} className="delivery-view__btn" style={{ background: varColor(C.red), color: "#fff", padding: "11px 0" }}>
                Remover grupo
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Busca multi-seleção para "aparece nestes produtos". Em cima, os produtos
// já vinculados aparecem como chips removíveis; embaixo, uma busca lista os
// que ainda NÃO estão no combo — digita, filtra e toca pra adicionar (dá
// pra escolher vários). Substitui o antigo checklist de pílulas: com muitos
// produtos, procurar é mais intuitivo que varrer uma lista inteira.
function SeletorProdutosMulti({ sz, itens, produtoIds, vinculando, onAlternar }) {
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);

  // Chips: os itens do cardápio cujo produto_id está vinculado.
  const selecionados = useMemo(
    () => (itens || []).filter((it) => produtoIds.some((x) => String(x) === String(it.produto_id))),
    [itens, produtoIds]
  );

  // Busca: só os que ainda NÃO estão vinculados (exclui os já escolhidos).
  const resultados = useMemo(
    () => filtrarItensDelivery(itens, termo, produtoIds),
    [itens, termo, produtoIds]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Chips dos já vinculados */}
      {selecionados.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selecionados.map((it) => (
            <span
              key={it.id}
              className="delivery-view__chip-produto"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 8px 5px 10px", borderRadius: 999,
                background: alfa(C.accent, "15"), color: varColor(C.accent),
                border: `1px solid ${alfa(C.accent, "40")}`, fontWeight: 600,
              }}
            >
              {it.produto?.name || "(produto)"}
              <button
                type="button"
                onClick={() => onAlternar(it.produto_id)}
                disabled={vinculando}
                className="delivery-view__modal-fechar"
                title="Remover deste combo"
                style={{ color: varColor(C.accent), display: "inline-flex" }}
              >
                <LuX size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Busca para adicionar mais produtos */}
      <div style={{ position: "relative", maxWidth: 420 }}>
        <LuSearch
          size={15}
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: varColor(C.muted), pointerEvents: "none" }}
        />
        <input
          className="delivery-view__input"
          style={{ ...inputStyle(sz), width: "100%", paddingLeft: 32 }}
          value={termo}
          onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 120)}
          placeholder="Buscar produto para adicionar…"
        />
        {aberto && (
          <div
            style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
              maxHeight: 240, overflowY: "auto",
              background: varColor(C.card), border: `1px solid ${varColor(C.border)}`,
              borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
            }}
          >
            {resultados.length === 0 ? (
              <div className="delivery-view__hint" style={{ padding: "10px 12px", color: varColor(C.muted) }}>
                {termo.trim() ? "Nenhum produto encontrado." : "Todos os produtos já estão neste combo."}
              </div>
            ) : (
              resultados.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  disabled={vinculando}
                  // onMouseDown (antes do blur) garante que o clique registra.
                  onMouseDown={(e) => { e.preventDefault(); onAlternar(it.produto_id); setTermo(""); }}
                  className="delivery-view__btn"
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "10px 12px", background: "transparent", border: "none",
                    borderBottom: `1px solid ${alfa(C.border, "60")}`,
                    color: varColor(C.text), textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <LuPlus size={13} style={{ color: varColor(C.accent), flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{it.produto?.name || "(produto)"}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ABA 3 — Entrega e taxas (config_delivery)
// ════════════════════════════════════════════════════════════════
function AbaEntrega({ sz, isAdmin, tenant, currentUser, aviso }) {
  const [config, setConfig] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // modo da taxa: "area" (bairro/CEP) ou "km" (por distância).
  const [modoTaxa, setModoTaxa] = useState("area");

  // endereço do estabelecimento (origem do mapa por km). O texto fica
  // editável aqui; ao "Localizar", geocodifica (Nominatim, grátis) e
  // posiciona o pino — que segue arrastável para o ajuste fino.
  const [enderecoOrigem, setEnderecoOrigem] = useState("");
  const [geocodificando, setGeocodificando] = useState(false);

  // nova faixa em edição
  const [faixaTipo, setFaixaTipo] = useState("bairro");
  const [faixaBairro, setFaixaBairro] = useState("");
  const [faixaCepIni, setFaixaCepIni] = useState("");
  const [faixaCepFim, setFaixaCepFim] = useState("");
  const [faixaKmAte, setFaixaKmAte] = useState("");
  const [faixaTaxa, setFaixaTaxa] = useState("");

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data, error } = await carregarConfigDelivery();
      if (!ativo) return;
      setCarregando(false);
      if (error) return aviso("Não foi possível carregar as configurações.", "err");
      const cfg =
        data || { aberto: false, pedido_minimo: 0, tempo_preparo_min: 30, horario: {}, faixas_taxa: [] };
      setConfig(cfg);
      setEnderecoOrigem(cfg.endereco_origem || "");
      setModoTaxa(temFaixasKm(cfg.faixas_taxa) ? "km" : "area");
    })();
    return () => { ativo = false; };
  }, [aviso]);

  const set = (patch) => setConfig((c) => ({ ...c, ...patch }));

  const salvar = async (extra) => {
    if (!tenant?.id) return aviso("Estabelecimento não identificado.", "err");
    const alvo = { ...config, ...(extra || {}) };
    setSalvando(true);
    const { data, error } = await salvarConfigDelivery(tenant.id, alvo);
    setSalvando(false);
    if (error) return aviso("Não foi possível salvar.", "err");
    setConfig(data || alvo);
    logAction(currentUser?.username, "delivery:config", { msg: "Configurações de entrega atualizadas", name: currentUser?.name, role: currentUser?.role });
    aviso("Configurações salvas.", "ok");
  };

  const taxaNum = () => parseFloat(String(faixaTaxa).replace(",", ".")) || 0;

  const addFaixa = () => {
    let nova, erro;
    if (modoTaxa === "km") {
      nova = { tipo: "km", km_ate: parseFloat(String(faixaKmAte).replace(",", ".")) || 0, taxa: taxaNum() };
      erro = "Informe a distância do anel em km (maior que zero).";
    } else if (faixaTipo === "cep") {
      nova = { tipo: "cep", cep_ini: faixaCepIni, cep_fim: faixaCepFim, taxa: taxaNum() };
      erro = "Preencha os dois CEPs (8 dígitos, início ≤ fim).";
    } else {
      nova = { tipo: "bairro", bairro: faixaBairro, taxa: taxaNum() };
      erro = "Informe o nome do bairro.";
    }
    if (!validarFaixa(nova)) return aviso(erro, "err");
    const faixas = [...(config.faixas_taxa || []), nova];
    setFaixaBairro(""); setFaixaCepIni(""); setFaixaCepFim(""); setFaixaKmAte(""); setFaixaTaxa("");
    salvar({ faixas_taxa: faixas });
  };

  const removerFaixa = (idx) => {
    const alvo = faixasVisiveis[idx];
    const faixas = (config.faixas_taxa || []).filter((f) => f !== alvo);
    salvar({ faixas_taxa: faixas });
  };

  // Ao arrastar o pino no mapa, grava a origem do estabelecimento.
  const definirOrigem = (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    salvar({ origem_lat: lat, origem_lng: lng });
  };

  // Geocodifica o endereço digitado (Nominatim, grátis) e posiciona o
  // pino. Se o endereço não for encontrado, guarda o texto mesmo assim e
  // pede para arrastar o pino à mão — nunca trava por causa de terceiro.
  const localizarPeloEndereco = async () => {
    const texto = enderecoOrigem.trim();
    if (!texto) {
      // Limpou o endereço: apaga só o texto, mantém o pino onde está.
      salvar({ endereco_origem: null });
      return;
    }
    setGeocodificando(true);
    const { data } = await geocodificarEndereco(texto);
    setGeocodificando(false);
    if (data) {
      salvar({ endereco_origem: texto, origem_lat: data.lat, origem_lng: data.lng });
      aviso("Endereço localizado no mapa. Arraste o pino se quiser ajustar.", "ok");
    } else {
      salvar({ endereco_origem: texto });
      aviso("Não encontramos esse endereço. Ele foi salvo — marque o ponto arrastando o pino no mapa.", "err");
    }
  };

  if (carregando || !config) {
    return <div className="delivery-view__carregando" style={{ color: varColor(C.muted), padding: 16 }}>Carregando…</div>;
  }

  const readOnly = !isAdmin;

  // Só as faixas do modo atual aparecem na lista (não misturar — "só km").
  const faixasVisiveis = (config.faixas_taxa || []).filter((f) =>
    modoTaxa === "km" ? f?.tipo === "km" : f?.tipo !== "km"
  );
  const aneisKm = (config.faixas_taxa || []).filter((f) => f?.tipo === "km");
  const origem =
    Number.isFinite(Number(config.origem_lat)) && Number.isFinite(Number(config.origem_lng))
      ? { lat: Number(config.origem_lat), lng: Number(config.origem_lng) }
      : null;

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Pedido mínimo + tempo de preparo */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="delivery-view__campo" style={{ flex: "1 1 180px" }}>
          <label className="delivery-view__label">Pedido mínimo (R$)</label>
          <input className="delivery-view__input" style={inputStyle(sz)} type="number" min="0" step="0.01" value={config.pedido_minimo ?? 0} disabled={readOnly} onChange={(e) => set({ pedido_minimo: e.target.value })} onBlur={() => salvar()} />
        </div>
        <div className="delivery-view__campo" style={{ flex: "1 1 180px" }}>
          <label className="delivery-view__label">Tempo de preparo (min)</label>
          <input className="delivery-view__input" style={inputStyle(sz)} type="number" min="0" value={config.tempo_preparo_min ?? 30} disabled={readOnly} onChange={(e) => set({ tempo_preparo_min: e.target.value })} onBlur={() => salvar()} />
        </div>
      </div>

      {/* Taxa de entrega */}
      <div>
        <div className="delivery-view__entrega-titulo" style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <LuTruck size={16} color={varColor(C.accent)} /> Taxa de entrega
        </div>

        {/* Seletor de modo: por área (bairro/CEP) ou por distância (km) */}
        {isAdmin && (
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {[
              { id: "area", label: "Por bairro / CEP" },
              { id: "km", label: "Por distância (km)" },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setModoTaxa(m.id)}
                className="delivery-view__btn delivery-view__btn--sm"
                style={{
                  padding: "8px 14px",
                  background: modoTaxa === m.id ? varColor(C.accent) : alfa(C.muted, "12"),
                  color: modoTaxa === m.id ? "#fff" : varColor(C.muted),
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        <div className="delivery-view__hint" style={{ color: varColor(C.muted), marginBottom: 10 }}>
          {modoTaxa === "km"
            ? "Marque no mapa de onde você entrega e crie anéis por distância (ex.: até 2 km R$ 5, até 5 km R$ 8). Fora do maior anel, o cliente não consegue pedir."
            : "Cobre por bairro ou por faixa de CEP. Quem estiver fora de todas as faixas não consegue pedir para entrega."}
        </div>

        {/* Mapa visual (só no modo por distância) */}
        {modoTaxa === "km" && (
          <div style={{ marginBottom: 12 }}>
            {/* Endereço do estabelecimento → origem do mapa */}
            <div className="delivery-view__campo" style={{ marginBottom: 10 }}>
              <label className="delivery-view__label">
                Endereço do estabelecimento (ponto de partida das entregas)
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="delivery-view__input"
                  style={{ ...inputStyle(sz), flex: "1 1 240px" }}
                  type="text"
                  placeholder="Rua, número, bairro, cidade"
                  value={enderecoOrigem}
                  disabled={readOnly || geocodificando}
                  onChange={(e) => setEnderecoOrigem(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !readOnly) localizarPeloEndereco(); }}
                />
                {!readOnly && (
                  <button
                    onClick={localizarPeloEndereco}
                    disabled={geocodificando}
                    className="delivery-view__btn delivery-view__btn--sm"
                    style={{
                      padding: "8px 16px", whiteSpace: "nowrap",
                      background: varColor(C.accent), color: "#fff",
                      opacity: geocodificando ? 0.7 : 1,
                    }}
                  >
                    {geocodificando ? "Localizando…" : "Localizar no mapa"}
                  </button>
                )}
              </div>
              {!readOnly && (
                <div className="delivery-view__hint" style={{ color: varColor(C.muted), marginTop: 4 }}>
                  Digite o endereço e toque em "Localizar" — o pino vai para lá. Você ainda pode arrastá-lo para o ajuste fino.
                </div>
              )}
            </div>

            <MapaRaioEntrega
              origem={origem}
              aneis={aneisKm}
              onOrigemChange={definirOrigem}
              readOnly={readOnly}
            />
            {!origem && (
              <div className="delivery-view__hint" style={{ color: varColor(C.red), marginTop: 6 }}>
                Marque o ponto de partida no mapa — sem ele o cálculo por distância não funciona.
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {faixasVisiveis.length === 0 && (
            <div className="delivery-view__hint" style={{ color: varColor(C.muted) }}>Nenhuma faixa cadastrada ainda.</div>
          )}
          {faixasVisiveis.map((f, idx) => (
            <div key={idx} className="delivery-view__faixa" style={{ background: varColor(C.surface) }}>
              <span className="delivery-view__faixa-texto">{faixaResumo(f)}</span>
              {isAdmin && (
                <button onClick={() => removerFaixa(idx)} className="delivery-view__modal-fechar" style={{ color: varColor(C.muted) }}>
                  <LuTrash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div style={{ border: `1px dashed ${varColor(C.border)}`, borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {modoTaxa === "area" && (
              <div style={{ display: "flex", gap: 6 }}>
                {["bairro", "cep"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setFaixaTipo(t)}
                    className="delivery-view__btn delivery-view__btn--sm"
                    style={{
                      padding: "7px 14px",
                      background: faixaTipo === t ? varColor(C.accent) : alfa(C.muted, "12"),
                      color: faixaTipo === t ? "#fff" : varColor(C.muted),
                    }}
                  >
                    {t === "bairro" ? "Por bairro" : "Por CEP"}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {modoTaxa === "km" ? (
                <input className="delivery-view__input" style={{ ...inputStyle(sz), flex: "1 1 160px" }} type="number" min="0" step="0.1" value={faixaKmAte} onChange={(e) => setFaixaKmAte(e.target.value)} placeholder="Até quantos km" />
              ) : faixaTipo === "bairro" ? (
                <input className="delivery-view__input" style={{ ...inputStyle(sz), flex: "1 1 160px" }} value={faixaBairro} onChange={(e) => setFaixaBairro(e.target.value)} placeholder="Bairro" maxLength={60} />
              ) : (
                <>
                  <input className="delivery-view__input" style={{ ...inputStyle(sz), flex: "1 1 120px" }} value={formatarCep(faixaCepIni)} onChange={(e) => setFaixaCepIni(e.target.value)} placeholder="CEP inicial" />
                  <input className="delivery-view__input" style={{ ...inputStyle(sz), flex: "1 1 120px" }} value={formatarCep(faixaCepFim)} onChange={(e) => setFaixaCepFim(e.target.value)} placeholder="CEP final" />
                </>
              )}
              <input className="delivery-view__input" style={{ ...inputStyle(sz), width: 110 }} type="number" min="0" step="0.01" value={faixaTaxa} onChange={(e) => setFaixaTaxa(e.target.value)} placeholder="Taxa R$" />
              <button onClick={addFaixa} disabled={salvando} className="delivery-view__btn" style={{ background: varColor(C.accent), color: "#fff", padding: "10px 16px" }}>
                <LuPlus size={14} /> Adicionar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Estilo base de input, casado ao tema do tenant (var --gm-*).
function inputStyle(sz) {
  return {
    border: `1.5px solid ${varColor(C.border)}`,
    background: varColor(C.surface),
    color: varColor(C.text),
  };
}
