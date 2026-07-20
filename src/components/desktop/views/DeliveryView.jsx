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
  LuBanknote,
  LuRefreshCw,
  LuBell,
  LuBellOff,
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
  alternarProdutoId,
  listarBibliotecaGrupos,
  vincularGrupoProduto,
  desvincularGrupoProduto,
  salvarGrupoComplemento,
  removerGrupoComplemento,
  salvarComplemento,
  removerComplemento,
  faixaResumo,
  validarFaixa,
  formatarReais,
  formatarCep,
} from "@/lib/deliveryAdmin";
import { enviarFotoProduto, ACCEPT_IMAGEM } from "@/lib/deliveryFotos";
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

  return (
    <div className="delivery-view" style={{ background: varColor(C.bg), color: varColor(C.text) }}>
      {/* Cabeçalho */}
      <div className="delivery-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div>
          <div className="delivery-view__titulo" style={{ fontSize: sz.fontLg }}>
            <LuBike size={20} color={varColor(C.accent)} /> Delivery
          </div>
          <div className="delivery-view__sub" style={{ fontSize: sz.fontSm }}>
            {itensCardapio.length} item{itensCardapio.length !== 1 ? "s" : ""} no cardápio online
          </div>
        </div>
        <span
          className="delivery-view__modo-tag"
          style={{
            fontSize: sz.fontSm,
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
                fontSize: sz.fontBase,
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
            style={{ background: alfa(C.red, "12"), color: varColor(C.red), border: `1px solid ${alfa(C.red, "33")}`, marginBottom: 12, fontSize: sz.fontSm }}
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
        <div className="delivery-view__pedidos-resumo" style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>
          {carregando
            ? "Carregando pedidos…"
            : abertos > 0
              ? `${abertos} pedido${abertos !== 1 ? "s" : ""} em andamento`
              : "Nenhum pedido em andamento"}
        </div>
        <div className="delivery-view__pedidos-acoes">
          <button
            onClick={alternarAvisos}
            className="delivery-view__btn"
            style={{
              background: avisosLigados ? alfa(C.green, "16") : alfa(C.muted, "12"),
              color: avisosLigados ? varColor(C.green) : varColor(C.muted),
              padding: "6px 12px",
              fontSize: sz.fontSm,
            }}
            title={avisosLigados ? "Avisos de pedido novo ligados (som + alerta na tela). Toque para desligar." : "Ligar avisos de pedido novo (som + alerta na tela)."}
            aria-pressed={avisosLigados}
          >
            {avisosLigados ? <LuBell size={13} /> : <LuBellOff size={13} />}
            {avisosLigados ? "Avisos ligados" : "Ativar avisos"}
          </button>
          <button
            onClick={recarregar}
            className="delivery-view__btn"
            style={{ background: alfa(C.accent, "12"), color: varColor(C.accent), padding: "6px 12px", fontSize: sz.fontSm }}
            title="Atualizar a lista de pedidos"
          >
            <LuRefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {carregando ? (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div style={{ fontSize: 40, opacity: 0.4 }}>⏳</div>
          <div style={{ fontSize: sz.fontBase }}>Carregando pedidos…</div>
        </div>
      ) : erro ? (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div style={{ fontSize: 44, opacity: 0.3 }}>📡</div>
          <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>Não conseguimos carregar os pedidos</div>
          <div style={{ fontSize: sz.fontSm }}>Verifique a conexão e toque em “Atualizar”.</div>
        </div>
      ) : colunas.length === 0 ? (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div style={{ fontSize: 44, opacity: 0.3 }}>🛵</div>
          <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>Nenhum pedido por aqui ainda</div>
          <div style={{ fontSize: sz.fontSm }}>
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
                  style={{ fontSize: sz.fontSm, color: cssCor(base) }}
                >
                  <span className="delivery-view__coluna-bolinha" style={{ background: cssCor(base) }} />
                  {col.label}
                  <span
                    className="delivery-view__coluna-contador"
                    style={{ background: alfa(base, "1f"), color: cssCor(base), fontSize: sz.fontSm - 1 }}
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
        <span className="delivery-view__pedido-num" style={{ fontSize: sz.fontBase, color: varColor(C.text) }}>
          <LuClipboardList size={14} color={cssCor(base)} /> {pedido.numero}
        </span>
        <span className="delivery-view__pedido-tempo" style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>
          {tempoDecorrido(pedido.created_at)}
        </span>
      </div>

      {/* Cliente */}
      <div className="delivery-view__pedido-cliente" style={{ fontSize: sz.fontBase, color: varColor(C.text) }}>
        {pedido.cliente_nome || "Cliente"}
      </div>

      {/* Telefone → WhatsApp (só toque; número é do cliente) */}
      {pedido.cliente_telefone && (
        <div className="delivery-view__pedido-linha" style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>
          <LuPhone size={13} /> {formatarTelefone(pedido.cliente_telefone)}
          {zap && (
            <a
              href={zap}
              target="_blank"
              rel="noopener noreferrer"
              className="delivery-view__zap"
              style={{ color: varColor(C.green), fontSize: sz.fontSm }}
              title="Falar com o cliente no WhatsApp"
            >
              <LuMessageCircle size={13} /> WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Endereço */}
      {endereco && (
        <div className="delivery-view__pedido-linha" style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>
          <LuMapPin size={13} /> {endereco}
        </div>
      )}

      {/* Pagamento */}
      <div className="delivery-view__pedido-linha" style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>
        <LuBanknote size={13} /> {resumoPagamento(pedido)}
      </div>

      {/* Itens (sob demanda) */}
      <button
        onClick={toggleItens}
        className="delivery-view__pedido-itens-toggle"
        style={{ fontSize: sz.fontSm, color: varColor(C.accent) }}
      >
        {aberto ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
        {aberto ? "Ocultar itens" : "Ver itens"}
      </button>
      {aberto && (
        <div className="delivery-view__pedido-itens" style={{ fontSize: sz.fontSm, color: varColor(C.text) }}>
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
      <div className="delivery-view__pedido-total" style={{ fontSize: sz.fontBase, color: varColor(C.text) }}>
        Total <strong>{formatarReais(pedido.total)}</strong>
      </div>

      {/* Ações — só admin/gerente toca o pedido */}
      {isAdmin && !ehTerminal(pedido.status) && (
        <div className="delivery-view__pedido-acoes">
          {acao && (
            <button
              onClick={onAvancar}
              className="delivery-view__btn"
              style={{ background: cssCor(base), color: "#fff", padding: "8px 12px", fontSize: sz.fontSm, flex: 1 }}
            >
              {acao}
            </button>
          )}
          {podeCancelar(pedido.status) && (
            confirmarCancelar ? (
              <>
                <button
                  onClick={onCancelar}
                  className="delivery-view__btn"
                  style={{ background: varColor(C.red), color: "#fff", padding: "8px 12px", fontSize: sz.fontSm }}
                >
                  Cancelar mesmo
                </button>
                <button
                  onClick={() => setConfirmarCancelar(false)}
                  className="delivery-view__btn"
                  style={{ background: alfa(C.muted, "15"), color: varColor(C.muted), padding: "8px 12px", fontSize: sz.fontSm }}
                >
                  Voltar
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmarCancelar(true)}
                className="delivery-view__btn"
                style={{ background: alfa(C.red, "12"), color: varColor(C.red), padding: "8px 10px", fontSize: sz.fontSm }}
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
  products, linhas, addProduct, updateProduct, recarregarProdutos, currentUser, aviso, recarregar,
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
            <div className="delivery-view__import-titulo" style={{ fontSize: sz.fontBase }}>
              <LuDownload size={16} color={varColor(C.blue)} /> Importar cardápio do PDV
            </div>
            <div className="delivery-view__import-desc" style={{ fontSize: sz.fontSm }}>
              {faltamImportar.length > 0
                ? `Traz de uma vez os ${faltamImportar.length} produto(s) do sistema que ainda não estão no delivery. Depois é só colocar foto e descrição.`
                : "Tudo em dia — todos os produtos do PDV já estão no delivery."}
            </div>
          </div>
          <button
            onClick={importar}
            disabled={importando || faltamImportar.length === 0}
            className="delivery-view__btn"
            style={{ background: varColor(C.blue), color: "#fff", padding: `10px ${sz.pad}px`, fontSize: sz.fontBase }}
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
            style={{ background: varColor(C.accent), color: "#fff", padding: `10px ${sz.pad}px`, fontSize: sz.fontBase }}
          >
            <LuPlus size={15} /> Novo produto
          </button>
        </div>
      )}

      {/* Lista / estados */}
      {carregando ? (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div style={{ fontSize: 40, opacity: 0.4 }}>⏳</div>
          <div style={{ fontSize: sz.fontBase }}>Carregando o cardápio…</div>
        </div>
      ) : itens.length === 0 ? (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div style={{ fontSize: 44, opacity: 0.3 }}>🛵</div>
          <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>Nenhum produto no delivery ainda</div>
          <div style={{ fontSize: sz.fontSm }}>
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
      {item.foto_url ? (
        <img className="delivery-view__card-foto" src={item.foto_url} alt={nome} />
      ) : (
        <div className="delivery-view__card-emoji" style={{ background: alfa(C.accent, "12") }}>{emoji}</div>
      )}
      <div className="delivery-view__card-corpo">
        <div className="delivery-view__card-nome" style={{ fontSize: sz.fontBase }}>{nome}</div>
        {item.descricao ? (
          <div className="delivery-view__card-desc" style={{ fontSize: sz.fontSm }}>{item.descricao}</div>
        ) : (
          <div className="delivery-view__card-desc" style={{ fontSize: sz.fontSm, fontStyle: "italic", opacity: 0.6 }}>
            Sem descrição — clique em editar para caprichar.
          </div>
        )}
        <div className="delivery-view__card-linha">
          {preco != null && (
            <span className="delivery-view__pill" style={{ fontSize: sz.fontSm, background: alfa(C.accent, "12"), color: varColor(C.accent) }}>
              {formatarReais(preco)}
            </span>
          )}
          <button
            onClick={onToggle}
            disabled={!isAdmin}
            className="delivery-view__pill"
            style={{
              border: "none", cursor: isAdmin ? "pointer" : "default", fontSize: sz.fontSm,
              background: alfa(item.disponivel ? C.green : C.muted, "15"),
              color: varColor(item.disponivel ? C.green : C.muted),
            }}
            title="Ligar/desligar no cardápio"
          >
            {item.disponivel ? "Disponível" : "Indisponível"}
          </button>
        </div>
        {isAdmin && (
          <div className="delivery-view__card-linha">
            <button onClick={onEditar} className="delivery-view__btn" style={{ background: alfa(C.accent, "12"), color: varColor(C.accent), padding: "6px 12px", fontSize: sz.fontSm }}>
              <LuPencil size={13} /> Editar
            </button>
            {confirmar ? (
              <>
                <span style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>Remover?</span>
                <button onClick={onRemover} className="delivery-view__btn" style={{ background: varColor(C.red), color: "#fff", padding: "6px 12px", fontSize: sz.fontSm }}>Sim</button>
                <button onClick={() => setConfirmar(false)} className="delivery-view__btn" style={{ background: alfa(C.muted, "15"), color: varColor(C.muted), padding: "6px 12px", fontSize: sz.fontSm }}>Não</button>
              </>
            ) : (
              <button onClick={() => setConfirmar(true)} className="delivery-view__btn" style={{ background: alfa(C.red, "10"), color: varColor(C.red), padding: "6px 12px", fontSize: sz.fontSm }}>
                <LuTrash2 size={13} /> {ehAddon ? "Tirar do delivery" : "Excluir"}
              </button>
            )}
          </div>
        )}
      </div>
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
    <div className="delivery-view__overlay" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="delivery-view__modal" style={{ background: varColor(C.card), color: varColor(C.text) }}>
        <div className="delivery-view__modal-topo">
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>
            {modo === "novo" ? "Novo produto do delivery" : "Editar produto do delivery"}
          </div>
          <button onClick={onFechar} className="delivery-view__modal-fechar" style={{ color: varColor(C.muted) }}>
            <LuX size={18} />
          </button>
        </div>

        {/* Standalone: dados do produto. Addon: só referência do PDV. */}
        {ehAddon ? (
          <div className="delivery-view__aviso" style={{ background: alfa(C.blue, "0c"), border: `1px solid ${alfa(C.blue, "22")}`, fontSize: sz.fontSm }}>
            <strong>{prod?.name || "Produto"}</strong>
            {prod?.price != null ? ` · ${formatarReais(prod.price)}` : ""} — nome e preço vêm do
            cadastro do PDV. Aqui você ajusta como ele aparece no delivery.
          </div>
        ) : (
          <>
            <div className="delivery-view__campo">
              <label className="delivery-view__label" style={{ fontSize: sz.fontSm }}>Nome *</label>
              <input className="delivery-view__input" style={inputStyle(sz)} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: X-Salada" maxLength={60} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div className="delivery-view__campo" style={{ flex: 1 }}>
                <label className="delivery-view__label" style={{ fontSize: sz.fontSm }}>Preço (R$) *</label>
                <input className="delivery-view__input" style={inputStyle(sz)} type="number" min="0" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
              </div>
              <div className="delivery-view__campo" style={{ width: 88 }}>
                <label className="delivery-view__label" style={{ fontSize: sz.fontSm }}>Emoji</label>
                <input className="delivery-view__input" style={{ ...inputStyle(sz), textAlign: "center" }} value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🍔" maxLength={4} />
              </div>
            </div>
            <div className="delivery-view__campo">
              <label className="delivery-view__label" style={{ fontSize: sz.fontSm }}>Categoria</label>
              <input className="delivery-view__input" style={inputStyle(sz)} value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ex: Lanches" maxLength={40} list="delivery-cats" />
              <datalist id="delivery-cats">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
          </>
        )}

        {/* Camada de delivery (ambos os modos) — foto do produto (upload) */}
        <div className="delivery-view__campo">
          <label className="delivery-view__label" style={{ fontSize: sz.fontSm }}>
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
                className="delivery-view__btn"
                style={{ background: alfa(C.accent, "12"), color: varColor(C.accent), padding: "9px 14px", fontSize: sz.fontSm }}
              >
                <LuImage size={14} /> {temFoto ? "Trocar foto" : "Escolher foto"}
              </button>
              {temFoto && (
                <button
                  type="button"
                  onClick={removerFoto}
                  className="delivery-view__btn"
                  style={{ background: alfa(C.red, "10"), color: varColor(C.red), padding: "9px 14px", fontSize: sz.fontSm }}
                >
                  <LuTrash2 size={14} /> Remover
                </button>
              )}
              <span style={{ fontSize: sz.fontSm - 1, color: varColor(C.muted) }}>
                Tire do celular ou escolha da galeria. Ajustamos o tamanho automaticamente.
              </span>
            </div>
          </div>
        </div>
        <div className="delivery-view__campo">
          <label className="delivery-view__label" style={{ fontSize: sz.fontSm }}>Descrição</label>
          <textarea className="delivery-view__textarea" style={inputStyle(sz)} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: Pão, hambúrguer, queijo, alface e tomate." maxLength={280} />
        </div>
        <label className="delivery-view__switch" style={{ fontSize: sz.fontBase }}>
          <span>Disponível no cardápio</span>
          <input type="checkbox" checked={disponivel} onChange={(e) => setDisponivel(e.target.checked)} style={{ width: 20, height: 20 }} />
        </label>

        {erro && (
          <div className="delivery-view__aviso" style={{ background: alfa(C.red, "12"), color: varColor(C.red), border: `1px solid ${alfa(C.red, "33")}`, fontSize: sz.fontSm }}>
            ⚠️ {erro}
          </div>
        )}

        <div className="delivery-view__modal-botoes">
          <button onClick={onFechar} className="delivery-view__btn" style={{ background: alfa(C.muted, "15"), color: varColor(C.muted), padding: "11px 0", fontSize: sz.fontBase }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="delivery-view__btn" style={{ background: varColor(C.accent), color: "#fff", padding: "11px 0", fontSize: sz.fontBase }}>
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
    const { error } = await salvarGrupoComplemento({ nome, min_escolhas: 0, max_escolhas: 1, ordem: grupos.length });
    setSalvandoGrupo(false);
    if (error) return aviso("Não foi possível criar o grupo.", "err");
    setNovoGrupo("");
    await carregar();
  };

  if (carregando) {
    return <div style={{ color: varColor(C.muted), fontSize: sz.fontBase, padding: 16 }}>Carregando…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: sz.fontSm, color: varColor(C.muted), marginBottom: 2 }}>
        Crie um grupo uma vez (ex.: “Adicionais”, “Molhos”) e marque em quais produtos ele aparece. O mesmo grupo pode ser usado em vários itens.
      </div>

      {grupos.length === 0 && (
        <div className="delivery-view__vazio" style={{ color: varColor(C.muted) }}>
          <div style={{ fontSize: 44, opacity: 0.3 }}>🧩</div>
          <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>Nenhum grupo ainda</div>
          <div style={{ fontSize: sz.fontSm }}>Crie o primeiro grupo (ex.: “Adicionais”) e escolha em quais produtos ele aparece.</div>
        </div>
      )}

      {grupos.map((g) => (
        <GrupoCard
          key={g.id}
          sz={sz}
          isAdmin={isAdmin}
          grupo={g}
          products={products}
          itensCardapio={itens}
          aviso={aviso}
          recarregar={carregar}
        />
      ))}

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
          <button onClick={addGrupo} disabled={!novoGrupo.trim() || salvandoGrupo} className="delivery-view__btn" style={{ background: varColor(C.accent), color: "#fff", padding: "10px 16px", fontSize: sz.fontBase }}>
            <LuPlus size={14} /> Grupo
          </button>
        </div>
      )}
    </div>
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
            <div style={{ padding: "10px 12px", fontSize: sz.fontSm, color: varColor(C.muted) }}>
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
                  fontSize: sz.fontBase, color: varColor(C.text), textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {p.emoji && <span style={{ fontSize: sz.fontBase + 2 }}>{p.emoji}</span>}
                <span style={{ flex: 1 }}>{p.name}</span>
                <span style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>
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

function GrupoCard({ sz, isAdmin, grupo, products, itensCardapio = [], aviso, recarregar }) {
  const [nome, setNome] = useState(grupo.nome);
  const [min, setMin] = useState(String(grupo.min_escolhas ?? 0));
  const [max, setMax] = useState(String(grupo.max_escolhas ?? 1));
  // Item do grupo agora vem de um produto JÁ CRIADO, escolhido na busca.
  const [selecionadoProd, setSelecionadoProd] = useState(null);
  const [novoPreco, setNovoPreco] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  // Produtos onde este grupo aparece (checklist). Estado local otimista:
  // marca/desmarca na hora e persiste via produto_grupos; reverte no erro.
  const [produtoIds, setProdutoIds] = useState(grupo.produtoIds ?? []);
  const [vinculando, setVinculando] = useState(false);

  const salvarGrupo = async () => {
    setSalvando(true);
    const { error } = await salvarGrupoComplemento({
      id: grupo.id, nome: nome.trim() || grupo.nome,
      min_escolhas: Number(min) || 0, max_escolhas: Number(max) || 1, ordem: grupo.ordem,
    });
    setSalvando(false);
    if (error) return aviso("Não foi possível salvar o grupo.", "err");
    await recarregar();
  };

  const alternarProduto = async (produtoId) => {
    if (vinculando) return;
    const jaTem = produtoIds.some((x) => String(x) === String(produtoId));
    const antes = produtoIds;
    setProdutoIds(alternarProdutoId(produtoIds, produtoId));
    setVinculando(true);
    const { error } = jaTem
      ? await desvincularGrupoProduto(grupo.id, produtoId)
      : await vincularGrupoProduto(grupo.id, produtoId);
    setVinculando(false);
    if (error) {
      setProdutoIds(antes); // reverte a marcação otimista
      return aviso("Não foi possível atualizar onde o grupo aparece.", "err");
    }
  };

  // produto_id já presentes neste grupo — não deixa adicionar o mesmo duas vezes.
  const idsNoGrupo = (grupo.itens || []).map((it) => it.produto_id).filter((x) => x != null);

  const escolherProduto = (prod) => {
    setSelecionadoProd(prod);
    // Pré-preenche o preço com o do PDV, mas fica editável (preço do
    // delivery pode ser diferente do balcão — decisão do dono).
    setNovoPreco(prod?.price != null ? String(prod.price) : "");
  };

  const addItem = async () => {
    if (!selecionadoProd || adicionando) return;
    setAdicionando(true);
    const { error } = await salvarComplemento({
      grupo_id: grupo.id,
      produto_id: selecionadoProd.id,
      nome: selecionadoProd.name,
      preco: parseFloat(String(novoPreco).replace(",", ".")) || 0,
      disponivel: true, ordem: (grupo.itens?.length || 0),
    });
    setAdicionando(false);
    if (error) return aviso("Não foi possível adicionar o item.", "err");
    setSelecionadoProd(null);
    setNovoPreco("");
    await recarregar();
  };

  return (
    <div style={{ border: `1px solid ${varColor(C.border)}`, borderRadius: 14, padding: 14, background: varColor(C.card) }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="delivery-view__input"
          style={{ ...inputStyle(sz), flex: 1, minWidth: 160, fontWeight: 700 }}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={!isAdmin}
          maxLength={60}
        />
        <label style={{ fontSize: sz.fontSm, color: varColor(C.muted), display: "flex", alignItems: "center", gap: 4 }}>
          mín
          <input className="delivery-view__input" style={{ ...inputStyle(sz), width: 56 }} type="number" min="0" value={min} onChange={(e) => setMin(e.target.value)} disabled={!isAdmin} />
        </label>
        <label style={{ fontSize: sz.fontSm, color: varColor(C.muted), display: "flex", alignItems: "center", gap: 4 }}>
          máx
          <input className="delivery-view__input" style={{ ...inputStyle(sz), width: 56 }} type="number" min="1" value={max} onChange={(e) => setMax(e.target.value)} disabled={!isAdmin} />
        </label>
        {isAdmin && (
          <>
            <button onClick={salvarGrupo} disabled={salvando} className="delivery-view__btn" style={{ background: alfa(C.accent, "15"), color: varColor(C.accent), padding: "8px 12px", fontSize: sz.fontSm }}>Salvar</button>
            <button
              onClick={async () => {
                const { error } = await removerGrupoComplemento(grupo.id);
                if (error) return aviso("Não foi possível remover o grupo.", "err");
                await recarregar();
              }}
              className="delivery-view__btn"
              style={{ background: alfa(C.red, "10"), color: varColor(C.red), padding: "8px 10px", fontSize: sz.fontSm }}
            >
              <LuTrash2 size={13} />
            </button>
          </>
        )}
      </div>
      <div style={{ fontSize: sz.fontSm - 1, color: varColor(C.muted), marginTop: 4 }}>
        {Number(min) > 0 ? "Obrigatório" : "Opcional"} · escolhe de {min || 0} a {max || 1}
      </div>

      {/* Itens do grupo */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
        {(grupo.itens || []).map((it) => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: varColor(C.surface) }}>
            <span style={{ flex: 1, fontSize: sz.fontBase }}>{it.nome}</span>
            <span style={{ fontSize: sz.fontSm, color: varColor(C.accent), fontWeight: 600 }}>
              {Number(it.preco) > 0 ? `+ ${formatarReais(it.preco)}` : "Grátis"}
            </span>
            {isAdmin && (
              <button
                onClick={async () => {
                  const { error } = await removerComplemento(it.id);
                  if (error) return aviso("Não foi possível remover o item.", "err");
                  await recarregar();
                }}
                className="delivery-view__modal-fechar"
                style={{ color: varColor(C.muted) }}
              >
                <LuX size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          {selecionadoProd ? (
            // Produto escolhido: mostra o item + preço (editável) + confirmar.
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180, padding: "8px 10px", borderRadius: 8, background: alfa(C.accent, "12"), color: varColor(C.accent), fontSize: sz.fontBase, fontWeight: 600 }}>
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
              <button onClick={addItem} disabled={adicionando} className="delivery-view__btn" style={{ background: varColor(C.accent), color: "#fff", padding: "8px 14px", fontSize: sz.fontSm }}>
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

      {/* Onde este grupo aparece — checklist dos produtos do cardápio. */}
      {isAdmin && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${alfa(C.border, "60")}` }}>
          <div style={{ fontSize: sz.fontSm, fontWeight: 600, color: varColor(C.text), marginBottom: 6 }}>
            <LuUtensils size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} /> Aparece nestes produtos
          </div>
          {itensCardapio.length === 0 ? (
            <div style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>
              Adicione produtos ao cardápio para vincular este grupo a eles.
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {itensCardapio.map((it) => {
                const marcado = produtoIds.some((x) => String(x) === String(it.produto_id));
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => alternarProduto(it.produto_id)}
                    disabled={vinculando}
                    className="delivery-view__btn"
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 10px", borderRadius: 999, fontSize: sz.fontSm,
                      cursor: "pointer",
                      background: marcado ? alfa(C.accent, "15") : varColor(C.surface),
                      color: marcado ? varColor(C.accent) : varColor(C.muted),
                      border: `1px solid ${marcado ? alfa(C.accent, "40") : varColor(C.border)}`,
                      fontWeight: marcado ? 600 : 400,
                    }}
                  >
                    {marcado ? <LuCheck size={12} /> : <LuPlus size={12} />}
                    {it.produto?.name || "(produto)"}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
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

  // nova faixa em edição
  const [faixaTipo, setFaixaTipo] = useState("bairro");
  const [faixaBairro, setFaixaBairro] = useState("");
  const [faixaCepIni, setFaixaCepIni] = useState("");
  const [faixaCepFim, setFaixaCepFim] = useState("");
  const [faixaTaxa, setFaixaTaxa] = useState("");

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data, error } = await carregarConfigDelivery();
      if (!ativo) return;
      setCarregando(false);
      if (error) return aviso("Não foi possível carregar as configurações.", "err");
      setConfig(
        data || { aberto: false, pedido_minimo: 0, tempo_preparo_min: 30, horario: {}, faixas_taxa: [] }
      );
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

  const addFaixa = () => {
    const nova =
      faixaTipo === "cep"
        ? { tipo: "cep", cep_ini: faixaCepIni, cep_fim: faixaCepFim, taxa: parseFloat(String(faixaTaxa).replace(",", ".")) || 0 }
        : { tipo: "bairro", bairro: faixaBairro, taxa: parseFloat(String(faixaTaxa).replace(",", ".")) || 0 };
    if (!validarFaixa(nova)) {
      return aviso(faixaTipo === "cep" ? "Preencha os dois CEPs (8 dígitos, início ≤ fim)." : "Informe o nome do bairro.", "err");
    }
    const faixas = [...(config.faixas_taxa || []), nova];
    setFaixaBairro(""); setFaixaCepIni(""); setFaixaCepFim(""); setFaixaTaxa("");
    salvar({ faixas_taxa: faixas });
  };

  const removerFaixa = (idx) => {
    const faixas = (config.faixas_taxa || []).filter((_, i) => i !== idx);
    salvar({ faixas_taxa: faixas });
  };

  if (carregando || !config) {
    return <div style={{ color: varColor(C.muted), fontSize: sz.fontBase, padding: 16 }}>Carregando…</div>;
  }

  const readOnly = !isAdmin;

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Loja aberta */}
      <label className="delivery-view__switch" style={{ fontSize: sz.fontBase, padding: "12px 14px", borderRadius: 12, background: varColor(C.card), border: `1px solid ${varColor(C.border)}` }}>
        <span>
          <strong>Delivery aberto agora</strong>
          <div style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>
            {config.aberto ? "Clientes conseguem fazer pedidos." : "O cardápio aparece, mas sem aceitar pedidos."}
          </div>
        </span>
        <input type="checkbox" checked={!!config.aberto} disabled={readOnly} onChange={(e) => salvar({ aberto: e.target.checked })} style={{ width: 22, height: 22 }} />
      </label>

      {/* Pedido mínimo + tempo de preparo */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div className="delivery-view__campo" style={{ flex: "1 1 180px" }}>
          <label className="delivery-view__label" style={{ fontSize: sz.fontSm }}>Pedido mínimo (R$)</label>
          <input className="delivery-view__input" style={inputStyle(sz)} type="number" min="0" step="0.01" value={config.pedido_minimo ?? 0} disabled={readOnly} onChange={(e) => set({ pedido_minimo: e.target.value })} onBlur={() => salvar()} />
        </div>
        <div className="delivery-view__campo" style={{ flex: "1 1 180px" }}>
          <label className="delivery-view__label" style={{ fontSize: sz.fontSm }}>Tempo de preparo (min)</label>
          <input className="delivery-view__input" style={inputStyle(sz)} type="number" min="0" value={config.tempo_preparo_min ?? 30} disabled={readOnly} onChange={(e) => set({ tempo_preparo_min: e.target.value })} onBlur={() => salvar()} />
        </div>
      </div>

      {/* Faixas de taxa por distância */}
      <div>
        <div style={{ fontWeight: 700, fontSize: sz.fontBase, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <LuTruck size={16} color={varColor(C.accent)} /> Taxa de entrega
        </div>
        <div style={{ fontSize: sz.fontSm, color: varColor(C.muted), marginBottom: 10 }}>
          Cobre por bairro ou por faixa de CEP. Quem estiver fora de todas as faixas não consegue pedir para entrega.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {(config.faixas_taxa || []).length === 0 && (
            <div style={{ fontSize: sz.fontSm, color: varColor(C.muted) }}>Nenhuma faixa cadastrada ainda.</div>
          )}
          {(config.faixas_taxa || []).map((f, idx) => (
            <div key={idx} className="delivery-view__faixa" style={{ background: varColor(C.surface) }}>
              <span className="delivery-view__faixa-texto" style={{ fontSize: sz.fontBase }}>{faixaResumo(f)}</span>
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
            <div style={{ display: "flex", gap: 6 }}>
              {["bairro", "cep"].map((t) => (
                <button
                  key={t}
                  onClick={() => setFaixaTipo(t)}
                  className="delivery-view__btn"
                  style={{
                    padding: "7px 14px", fontSize: sz.fontSm,
                    background: faixaTipo === t ? varColor(C.accent) : alfa(C.muted, "12"),
                    color: faixaTipo === t ? "#fff" : varColor(C.muted),
                  }}
                >
                  {t === "bairro" ? "Por bairro" : "Por CEP"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {faixaTipo === "bairro" ? (
                <input className="delivery-view__input" style={{ ...inputStyle(sz), flex: "1 1 160px" }} value={faixaBairro} onChange={(e) => setFaixaBairro(e.target.value)} placeholder="Bairro" maxLength={60} />
              ) : (
                <>
                  <input className="delivery-view__input" style={{ ...inputStyle(sz), flex: "1 1 120px" }} value={formatarCep(faixaCepIni)} onChange={(e) => setFaixaCepIni(e.target.value)} placeholder="CEP inicial" />
                  <input className="delivery-view__input" style={{ ...inputStyle(sz), flex: "1 1 120px" }} value={formatarCep(faixaCepFim)} onChange={(e) => setFaixaCepFim(e.target.value)} placeholder="CEP final" />
                </>
              )}
              <input className="delivery-view__input" style={{ ...inputStyle(sz), width: 110 }} type="number" min="0" step="0.01" value={faixaTaxa} onChange={(e) => setFaixaTaxa(e.target.value)} placeholder="Taxa R$" />
              <button onClick={addFaixa} disabled={salvando} className="delivery-view__btn" style={{ background: varColor(C.accent), color: "#fff", padding: "10px 16px", fontSize: sz.fontBase }}>
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
    fontSize: sz.fontBase,
  };
}
