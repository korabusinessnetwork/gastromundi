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
import { useSessao, useCatalogo } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import MODULOS from "@/constants/modulos";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LuBike, LuTruck, LuStore, LuPower, LuPowerOff, LuClock, LuExternalLink, LuTriangleAlert } from "react-icons/lu";
import {
  carregarConfigDelivery, salvarConfigDelivery, listarProdutosDelivery, produtosParaImportar
} from "@/features/delivery/deliveryAdmin";
import { ajusteAutomaticoAbertura, resumoHorario } from "@/features/delivery/regras/deliveryHorario";
// TD015: as faixas de taxa entram e saem do meio da lista, então a chave de
// renderização não pode ser a posição. O `uid` vive só no state desta tela:
// `sanitizarConfig` reconstrói cada faixa antes de gravar, então ele morre na
// fronteira do save sem precisar de limpeza explícita.
import "./DeliveryView.css";

const ABAS = [
  { id: "pedidos",      label: "Pedidos" },
  { id: "cardapio",     label: "Cardápio" },
  { id: "complementos", label: "Complementos" },
  { id: "entrega",      label: "Entrega e taxas" },
];

import AbaPedidos from "./AbaPedidos";
import AbaCardapio from "./AbaCardapio";
import AbaComplementos from "./AbaComplementos";
import AbaEntrega from "./AbaEntrega";
import { ehGerencia } from "@/constants/roles";

export default function DeliveryView({ notify } = {}) {
  const { tenant, currentUser, moduloHabilitado } = useSessao();
  const { products, addProduct, updateProduct, recarregarProdutos } = useCatalogo();

  // Modo derivado do plano: tem PDV → addon; só delivery → standalone.
  const ehAddon = moduloHabilitado(MODULOS.PDV);

  // Endereço da prévia: leva o slug DESTE estabelecimento. Sem slug (bootstrap
  // que falhou, banco antigo), abre a vitrine sem parâmetro — degrada para o
  // comportamento anterior em vez de sumir com o botão.
  const urlDaPrevia = tenant?.slug
    ? `/cardapio?loja=${encodeURIComponent(tenant.slug)}`
    : "/cardapio";

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

  const isAdmin = ehGerencia(currentUser);

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

  // ── Reconciliação da abertura automática (config_delivery.horario) ──
  // Sem cron no servidor (fase de custo zero): enquanto o agendamento
  // governa (horario.auto), é o app do operador aberto que mantém o flag
  // `aberto` casado com o horário. Roda ao montar e a cada 30s. Ref evita
  // reiniciar o intervalo a cada re-render (só depende de auto ligar/desligar).
  const configRef = useRef(configDelivery);
  useEffect(() => { configRef.current = configDelivery; }, [configDelivery]);

  const reconciliarAuto = useCallback(async () => {
    const cfg = configRef.current;
    if (!isAdmin || !tenant?.id || !cfg?.horario?.auto) return;
    const { mudar, aberto } = ajusteAutomaticoAbertura(cfg, new Date());
    if (!mudar) return;
    const proximo = { ...cfg, aberto };
    const { data, error } = await salvarConfigDelivery(tenant.id, proximo);
    if (error) return; // silencioso: tenta de novo no próximo tick
    setConfigDelivery(data || proximo);
    logAction(currentUser?.username, "delivery:auto", {
      msg: aberto ? "Delivery aberto automaticamente pelo horário" : "Delivery fechado automaticamente pelo horário",
      name: currentUser?.name,
      role: currentUser?.role,
    });
    aviso(aberto ? "Delivery aberto automaticamente pelo horário." : "Delivery fechado automaticamente pelo horário.", "info");
  }, [isAdmin, tenant, currentUser, aviso]);

  useEffect(() => {
    if (!isAdmin || !tenant?.id) return;
    reconciliarAuto(); // imediato ao montar / ao ligar o agendamento
    const t = setInterval(reconciliarAuto, 30000);
    return () => clearInterval(t);
  }, [isAdmin, tenant?.id, configDelivery?.horario?.auto, reconciliarAuto]);

  return (
    <div className="delivery-view">
      {/* Cabeçalho */}
      <div className="delivery-view__header">
        <div>
          <div className="delivery-view__titulo">
            <LuBike size={20} color={varColor(C.accent)} /> Delivery
          </div>
          <div className="delivery-view__sub">
            {itensCardapio.length} item{itensCardapio.length !== 1 ? "s" : ""} no cardápio online
          </div>
        </div>
        <div className="delivery-view__header-acoes">
          {/* Prévia clicável: abre o MESMO cardápio que o cliente final vê
              (rota pública /cardapio, por slug), em nova aba. Padrão "ver
              minha loja" — o dono confere na hora o resultado do cadastro.

              O `?loja=` NÃO é enfeite: sem subdomínio no ar (o domínio ainda
              não foi comprado), a vitrine resolveria o slug pelo fallback e
              mostraria a loja de OUTRO estabelecimento. Com subdomínio, ele
              ganha da query — ver `slugDaVitrine`. */}
          <button
            type="button"
            className="delivery-view__ver-cardapio"
            onClick={() => window.open(urlDaPrevia, "_blank", "noopener,noreferrer")}
            title="Abre, em uma nova aba, o cardápio exatamente como o cliente vê."
          >
            <LuExternalLink size={14} />
            Ver cardápio do cliente
          </button>

          <span
            className={`delivery-view__modo-tag delivery-view__modo-tag--${ehAddon ? "addon" : "standalone"}`}
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
            configDelivery.horario?.auto ? (
              // Agendamento no comando: badge de leitura (não brigar com a
              // reconciliação). Para ajustar, o dono vai em Configurações › Delivery.
              <span
                className={`delivery-view__auto-badge delivery-view__auto-badge--${
                  configDelivery.aberto ? "aberta" : "fechada"
                }`}
                title={
                  resumoHorario(configDelivery.horario)
                    ? `Abertura automática: ${resumoHorario(configDelivery.horario)}. Ajuste em Configurações › Delivery.`
                    : "Abertura automática ligada. Ajuste em Configurações › Delivery."
                }
              >
                <LuClock size={14} />
                {configDelivery.aberto ? "Aberto no automático" : "Fechado no automático"}
              </span>
            ) : (
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
            )
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="delivery-view__abas">
        {ABAS.map((a) => {
          const ativo = aba === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`delivery-view__aba${ativo ? " delivery-view__aba--ativa" : ""}`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="delivery-view__area">
        {erro && (
          <div className="delivery-view__aviso delivery-view__aviso--erro delivery-view__aviso--espacado">
            <LuTriangleAlert size={14} className="gm-icone-texto" aria-hidden="true" /> {erro}
          </div>
        )}

        {aba === "pedidos" && (
          <AbaPedidos isAdmin={isAdmin} ehAddon={ehAddon} aviso={aviso} currentUser={currentUser} />
        )}

        {aba === "cardapio" && (
          <AbaCardapio
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
          <AbaComplementos isAdmin={isAdmin} itens={itensCardapio} products={products} aviso={aviso} />
        )}

        {aba === "entrega" && (
          <AbaEntrega isAdmin={isAdmin} tenant={tenant} currentUser={currentUser} aviso={aviso} />
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
