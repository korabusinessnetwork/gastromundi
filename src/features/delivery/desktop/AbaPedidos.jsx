import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { usePedidosDelivery } from "@/features/delivery/hooks/usePedidosDelivery";
import { LuRefreshCw, LuBell, LuBellOff, LuHourglass, LuWifiOff, LuBike } from "react-icons/lu";
import { statusLabel, ehTerminal, agruparPorStatus, avancarPedido, cancelarPedido, carregarItensPedido, linkWhatsAppDoPedido } from "@/features/delivery/dados/deliveryPedidos";
import {
  detectarNovosPedidos, alertarPedidosNovos, permissaoNotificacao, pedirPermissaoNotificacao, notificacoesSuportadas
} from "@/features/delivery/regras/deliveryAlertas";
import { baseCorStatus, cssCor } from "./corStatus";
import CardPedido from "./CardPedido";
import { atribuirEntregadorPedido, entregadoresAtivos } from "@/features/delivery/dados/entregadores";
import { carregarConfigDelivery } from "@/features/delivery/dados/admin";
import { useSessao } from "@/context/AppContext";

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

export default function AbaPedidos({ isAdmin, ehAddon, aviso, currentUser, entregadores = [] }) {
  const { pedidos, carregando, erro, recarregar } = usePedidosDelivery();
  const [tick, setTick] = useState(0); // recalcula "há X min" de tempos em tempos

  // A config do delivery decide duas coisas desta aba: se a confirmação
  // no WhatsApp abre ao aceitar, e quanto tempo de preparo prometer na
  // mensagem. Falha ao carregar não trava nada — as duas são opcionais.
  const { tenant } = useSessao();
  const [config, setConfig] = useState(null);
  useEffect(() => {
    let ativo = true;
    carregarConfigDelivery().then(({ data }) => {
      if (ativo) setConfig(data ?? null);
    });
    return () => { ativo = false; };
  }, []);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- o `tick` força o cálculo de tempos em tempos, para o "há X min" de cada cartão andar sem pedido novo
  const colunas = useMemo(() => agruparPorStatus(pedidos), [pedidos, tick]);
  const abertos = useMemo(
    () => pedidos.filter((p) => !ehTerminal(p?.status ?? "recebido")).length,
    [pedidos]
  );

  const avancar = useCallback(
    async (pedido) => {
      const { error, proximo, etapa } = await avancarPedido(pedido, currentUser?.username);
      if (!proximo) return;
      if (error && etapa === "venda") {
        return aviso("Não foi possível registrar a venda deste pedido. Ele continua em rota, tente de novo.", "err");
      }
      if (error) return aviso("Não foi possível atualizar o pedido. Tente novamente.", "err");

      // Aceitar é o momento em que o cliente ainda não sabe se a loja viu o
      // pedido dele — é a angústia dos primeiros minutos. A confirmação
      // abre escrita, para o operador conferir e enviar num toque. Só abre
      // quando o dono ligou a chave e quando há telefone utilizável: aba
      // que se abre sozinha sem nada dentro é pior que aba nenhuma.
      if (config?.whatsapp_no_aceite && (proximo === "em_preparo" || proximo === "saiu_entrega")) {
        // A mensagem é a do estado em que o pedido ACABOU de entrar, não a
        // do estado em que estava — quem acabou de sair para entrega não
        // pode receber "recebemos seu pedido".
        //
        // Os itens são buscados aqui: a confirmação vale muito mais com a
        // lista do que sem ela, e é justamente na confirmação que o cliente
        // pega o item trocado enquanto ainda dá para refazer na cozinha.
        // Falha ao buscar não impede o aviso — ele sai sem a lista.
        const { data: itensDoPedido } = await carregarItensPedido(pedido.id);
        const link = linkWhatsAppDoPedido(
          { ...pedido, status: proximo },
          {
            nome: tenant?.nome,
            tempoPreparo: config?.tempo_preparo_min,
            entregador: entregadores.find(
              (e) => String(e.id) === String(pedido.entregador_id),
            )?.nome,
          },
          itensDoPedido ?? [],
        );
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      }

      aviso(
        proximo === "entregue"
          ? `Pedido ${pedido.numero} entregue, venda registrada.`
          : `Pedido ${pedido.numero}: ${statusLabel(proximo).toLowerCase()}.`,
        "ok",
      );
      await recarregar();
    },
    [aviso, recarregar, currentUser, config, tenant, entregadores]
  );

  const cancelar = useCallback(
    async (pedido) => {
      const { error } = await cancelarPedido(pedido, currentUser?.username);
      if (error) return aviso("Não foi possível cancelar. Tente novamente.", "err");
      aviso(`Pedido ${pedido.numero} cancelado.`, "ok");
      await recarregar();
    },
    [aviso, recarregar, currentUser]
  );

  // Atribui/troca entregador (e valor fotografado) num pedido. entregadorId
  // nulo desatribui. Recarrega pra refletir na hora (o realtime também traz,
  // mas o clique do operador precisa de resposta imediata).
  const atribuir = useCallback(
    async (pedido, entregadorId, valor = null) => {
      const { error } = await atribuirEntregadorPedido(pedido.id, entregadorId || null, valor);
      if (error) return aviso("Não foi possível atribuir o entregador. Tente novamente.", "err");
      await recarregar();
    },
    [aviso, recarregar]
  );

  // Só os ativos no seletor, mas garantindo que o entregador já atribuído a um
  // pedido apareça mesmo se tiver sido desativado depois (senão o cartão
  // mostraria "sem entregador" para um pedido que tem um).
  const ativos = useMemo(() => entregadoresAtivos(entregadores), [entregadores]);

  return (
    <>
      {/* Barra de topo: resumo + recarregar manual (fallback sem realtime) */}
      <div className="delivery-view__pedidos-topo">
        <div className="delivery-view__pedidos-resumo">
          {carregando
            ? "Carregando pedidos…"
            : abertos > 0
              ? `${abertos} pedido${abertos !== 1 ? "s" : ""} em andamento`
              : "Nenhum pedido em andamento"}
        </div>
        <div className="delivery-view__pedidos-acoes">
          <button
            onClick={alternarAvisos}
            className={`delivery-view__btn delivery-view__btn--sm delivery-view__btn--avisos${avisosLigados ? " delivery-view__btn--avisos-ligados" : ""}`}
            title={avisosLigados ? "Avisos de pedido novo ligados (som + alerta na tela). Toque para desligar." : "Ligar avisos de pedido novo (som + alerta na tela)."}
            aria-pressed={avisosLigados}
          >
            {avisosLigados ? <LuBell size={13} /> : <LuBellOff size={13} />}
            {avisosLigados ? "Avisos ligados" : "Ativar avisos"}
          </button>
          <button
            onClick={recarregar}
            className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--atualizar"
            title="Atualizar a lista de pedidos"
          >
            <LuRefreshCw size={13} /> Atualizar
          </button>
        </div>
      </div>

      {carregando ? (
        <div className="delivery-view__vazio">
          <div className="delivery-view__vazio-emoji delivery-view__vazio-emoji--carregando"><LuHourglass aria-hidden="true" /></div>
          <div className="delivery-view__carregando">Carregando pedidos…</div>
        </div>
      ) : erro && pedidos.length === 0 ? (
        <div className="delivery-view__vazio">
          <div className="delivery-view__vazio-emoji"><LuWifiOff aria-hidden="true" /></div>
          <div className="delivery-view__vazio-titulo">Não conseguimos carregar os pedidos</div>
          {/* "Verifique a conexão" era um chute, e chute errado manda o
              operador procurar no lugar errado. O Postgres diz o motivo
              com todas as letras — repassar o texto dele é o que separa
              "a internet caiu" de "falta rodar a migração". */}
          <div className="delivery-view__vazio-desc">
            {erro?.message || "Verifique a conexão e toque em “Atualizar”."}
          </div>
          {/column .* does not exist/i.test(erro?.message ?? "") && (
            <div className="delivery-view__vazio-desc">
              O banco está atrás do sistema: falta rodar as migrações pendentes
              (supabase/APLICAR_MIGRACOES_PENDENTES.sql) no SQL Editor do Supabase.
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Falha COM pedidos na tela: aviso por cima, lista intacta. A tela
              de erro cheia trocava o kanban inteiro por um cartaz — o
              operador perdia de vista todos os pedidos em andamento por uma
              piscada de rede, inclusive o que ele acabou de aceitar. */}
          {erro && (
            <div className="delivery-view__faixa-erro" role="alert">
              <span className="delivery-view__faixa-erro-texto">
                Não conseguimos atualizar agora. Estes são os pedidos da última
                atualização que deu certo.
              </span>
              <button
                type="button"
                onClick={recarregar}
                className="delivery-view__faixa-erro-acao"
              >
                Tentar de novo
              </button>
            </div>
          )}
          {colunas.length === 0 ? (
            <div className="delivery-view__vazio">
              <div className="delivery-view__vazio-emoji"><LuBike aria-hidden="true" /></div>
              <div className="delivery-view__vazio-titulo">Nenhum pedido por aqui ainda</div>
              <div className="delivery-view__vazio-desc">
                Quando um cliente pedir pelo cardápio online, o pedido aparece aqui na hora.
              </div>
            </div>
          ) : (
            <div className="delivery-view__kanban">
              {colunas.map((col) => {
                const base = baseCorStatus(col.status);
                // A cor da etapa é calculada em runtime (6 status possíveis), então entra
                // uma vez como custom property e o CSS da coluna, da bolinha, do contador
                // e do cartão lê `var(--cor-status)`.
                return (
                  <div key={col.status} className="delivery-view__coluna" style={{ "--cor-status": cssCor(base) }}>
                    <div className="delivery-view__coluna-titulo">
                      <span className="delivery-view__coluna-bolinha" />
                      {col.label}
                      <span className="delivery-view__coluna-contador">
                        {col.pedidos.length}
                      </span>
                    </div>
                    <div className="delivery-view__coluna-cards">
                      {col.pedidos.map((p) => (
                        <CardPedido
                          key={p.id}
                          pedido={p}
                          isAdmin={isAdmin}
                          ehAddon={ehAddon}
                          entregadores={entregadores}
                          entregadoresAtivos={ativos}
                          loja={{ nome: tenant?.nome, tempoPreparo: config?.tempo_preparo_min }}
                          onAvancar={() => avancar(p)}
                          onCancelar={() => cancelar(p)}
                          onAtribuirEntregador={atribuir}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
