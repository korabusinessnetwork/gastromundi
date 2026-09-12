import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { listarPedidosDelivery } from "@/lib/deliveryPedidos";

// ── Realtime: ler o estado da assinatura ────────────────────────────────────
// O supabase-js entrega o estado do canal no callback de `subscribe()`, e
// ninguém lia: canal recusado pela RLS, token expirado ou servidor reiniciando
// morria em silêncio. Numa aba que fica 24 horas aberta o websocket cai por
// motivo banal (troca de Wi-Fi, máquina dormindo, deploy do servidor), e a
// tela seguia mostrando o dado da última vez que funcionou, sem avisar: a
// cozinha parava de receber pedido e ninguém percebia.
export const STATUS_CANAL_RUIM = ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"];

/**
 * Monta o callback de status de `subscribe()` de um canal.
 *
 * O que ele faz, em ordem de importância:
 *   • canal caiu → uma carga imediata, porque dali em diante nenhum evento
 *     chega e o que está na tela começa a envelhecer;
 *   • canal voltou (SUBSCRIBED depois de ter caído) → outra carga, porque o
 *     que aconteceu durante a queda não vai ser reenviado;
 *   • qualquer estado ruim fica REGISTRADO no console (é diagnóstico técnico,
 *     não dado sensível), que é o que faltava para a queda deixar rastro;
 *   • `setAoVivo` deixa a tela decidir se mostra o aviso.
 *
 * A carga só é disparada na TRANSIÇÃO de estado. O supabase-js tenta
 * reconectar sozinho e cada tentativa falha emite outro CHANNEL_ERROR: sem
 * isso, um servidor fora do ar viraria uma enxurrada de consultas.
 *
 * `estaVivo` existe porque `removeChannel` na limpeza do efeito também emite
 * CLOSED — sem o guard, desmontar a tela disparava uma carga inútil.
 *
 * @param {string} nome nome do canal (só para o registro)
 * @param {{ recarregar?: () => void, setAoVivo?: (ok: boolean) => void, estaVivo?: () => boolean }} opcoes
 * @returns {(status: string, err?: unknown) => void}
 */
export function tratarStatusCanal(nome, { recarregar, setAoVivo, estaVivo = () => true } = {}) {
  let caido = false;
  return (status, err) => {
    if (!estaVivo()) return;
    if (status === "SUBSCRIBED") {
      setAoVivo?.(true);
      if (caido) {
        caido = false;
        recarregar?.();
      }
      return;
    }
    if (!STATUS_CANAL_RUIM.includes(status)) return;
    setAoVivo?.(false);
    console.warn(`[realtime] canal "${nome}" em estado ${status}`, err ?? "");
    if (caido) return;
    caido = true;
    recarregar?.();
  };
}

/**
 * useLS — localStorage com fallback e sincronização
 * Substitua o valor por chamadas Supabase na migração
 */
export function useLS(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);

  return [value, setValue];
}

/**
 * useIsMobile — detecta tela mobile com atualização em resize
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);

  return isMobile;
}

/**
 * useResponsive — retorna largura da janela e flags de breakpoint
 * xl: 1920+ | lg: 1440+ | md: 1280+ | sm: 1024+
 */
export function useResponsive() {
  const [width, setWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    let raf;
    const handler = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener("resize", handler, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handler);
    };
  }, []);

  return {
    width,
    isXL: width >= 1920,
    isLG: width >= 1440,
    isMD: width >= 1280,
    isSM: width >= 1024,
  };
}

/**
 * useIdleTimer — dispara callback após X ms de inatividade
 *
 * Opcionalmente avisa ANTES de deslogar: passe `onAviso` (callback estável, que
 * recebe `true` ao entrar na reta final e `false` quando a pessoa volta) e
 * `avisoMs` (quanto antes do fim). Os dois cronômetros nascem do mesmo `reset`,
 * então aviso e logout nunca saem de sincronia.
 *
 * `onAviso` e `avisoMs` entram como argumentos soltos, e não num objeto de
 * opções, de propósito: um objeto literal muda de identidade a cada render, o
 * efeito remontaria e a contagem voltaria ao zero para sempre — que é
 * exatamente o bug que os 30 minutos de inatividade já tiveram.
 */
export function useIdleTimer(callback, delay, enabled = true, onAviso = null, avisoMs = 0) {
  // Carimbo da última atividade, por RELÓGIO. Ele existe porque o PDV não fecha
  // nunca e a máquina do balcão dorme: durante o sono os temporizadores não
  // correm, e no retorno os dois disparam atrasados e quase juntos, de modo que
  // o aviso de "vai bloquear" aparece no mesmo instante do bloqueio. Com o
  // carimbo, quem volta pode recalcular pelo tempo que passou de verdade, em vez
  // de confiar num `setTimeout` que ficou congelado.
  const ultimaAtividadeRef = useRef(Date.now());
  const reavaliarRef = useRef(() => {});

  useEffect(() => {
    if (!enabled) return;

    // Sem aviso quando não há callback, quando o adiantamento é zero/negativo,
    // ou quando ele não cabe dentro do tempo de inatividade.
    const comAviso = typeof onAviso === "function" && avisoMs > 0 && avisoMs < delay;

    let timer;
    let timerAviso;
    let avisando = false;

    const armar = (restanteMs = delay) => {
      const falta = Math.max(0, restanteMs);
      timer = setTimeout(callback, falta);
      if (comAviso && falta > avisoMs) {
        timerAviso = setTimeout(() => { avisando = true; onAviso(true); }, falta - avisoMs);
      }
    };

    armar();

    // Chamado de fora quando a aba volta a ficar visível. Se o prazo já venceu
    // durante o sono, dispara na hora; senão rearma com o que de fato falta.
    reavaliarRef.current = () => {
      const decorrido = Date.now() - ultimaAtividadeRef.current;
      clearTimeout(timer);
      clearTimeout(timerAviso);
      if (decorrido >= delay) { callback(); return; }
      if (avisando && decorrido < delay - avisoMs) { avisando = false; onAviso(false); }
      armar(delay - decorrido);
    };

    const reset = () => {
      ultimaAtividadeRef.current = Date.now();
      clearTimeout(timer);
      clearTimeout(timerAviso);
      // Só derruba o aviso se ele estava de pé: qualquer mexida do mouse passa
      // por aqui, e chamar o callback a cada movimento seria renderizar à toa.
      if (avisando) { avisando = false; onAviso(false); }
      armar();
    };
    // `wheel` e `scroll` contam como atividade: ler um relatório longo rolando
    // a página é gente na frente da tela, e sem eles dava logout no meio da
    // leitura. `scroll` de elemento não borbulha, então tudo entra na fase de
    // captura — que também impede um `stopPropagation` de escondê-los.
    const events = ["mousemove", "keydown", "click", "touchstart", "wheel", "scroll"];

    events.forEach((e) => window.addEventListener(e, reset, true));
    return () => {
      clearTimeout(timer);
      clearTimeout(timerAviso);
      reavaliarRef.current = () => {};
      events.forEach((e) => window.removeEventListener(e, reset, true));
    };
  }, [callback, delay, enabled, onAviso, avisoMs]);

  // Identidade estável: quem recebe isto costuma pôr numa lista de dependências.
  return useCallback(() => reavaliarRef.current(), []);
}

/**
 * useMesas — busca a tabela de mesas e sincroniza via realtime
 * (mudanças de status manual/layout aparecem em outros dispositivos sem recarregar)
 */
export function useMesas() {
  const [mesas,   setMesas]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState(null);
  // `aoVivo` é aditivo: quem só desestrutura o que já existia não muda.
  const [aoVivo,  setAoVivo]  = useState(true);

  // Expõe `erro` e `recarregar` pelo mesmo motivo de usePedidosCozinha: a
  // carga antiga ignorava o `error` e gravava `data ?? []`, então falha de
  // rede ou de RLS virava lista vazia com carregamento concluído, e a aba
  // Reservas dizia "Nenhuma mesa cadastrada" — convidando o operador a
  // cadastrar de novo mesas que existem. Quem só desestrutura
  // { mesas, loading, atualizarStatusMesa } continua funcionando como antes.
  const recarregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("mesas")
      .select("numero,capacidade,posicao_x,posicao_y,status_manual")
      .order("numero");
    if (error) {
      // Mantém as mesas que já estavam na tela: o mapa do salão de 1 minuto
      // atrás é mais útil que um salão vazio que não existe.
      setErro(error);
    } else {
      setErro(null);
      setMesas(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  // Requer Realtime habilitado na tabela `mesas` (Database → Replication).
  useEffect(() => {
    let vivo = true;
    const channel = supabase
      .channel("mesas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "mesas" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setMesas(prev =>
            prev.find(m => m.numero === payload.new.numero)
              ? prev
              : [...prev, payload.new].sort((a, b) => a.numero.localeCompare(b.numero)),
          );
        } else if (payload.eventType === "UPDATE") {
          setMesas(prev => prev.map(m => m.numero === payload.new.numero ? payload.new : m));
        } else if (payload.eventType === "DELETE") {
          setMesas(prev => prev.filter(m => m.numero !== payload.old.numero));
        }
      })
      .subscribe(tratarStatusCanal("mesas-realtime", {
        recarregar, setAoVivo, estaVivo: () => vivo,
      }));

    return () => { vivo = false; supabase.removeChannel(channel); };
  }, [recarregar]);

  // Marca a mesa como livre/reservada/manutencao (aba "Reservas" do PDV).
  // Update otimista: reflete na hora no mapa e na lista; se o Supabase
  // falhar, desfaz. O realtime acima replica a mudança nos outros
  // dispositivos — aqui só garantimos resposta imediata neste.
  async function atualizarStatusMesa(numero, novoStatus) {
    const PERMITIDOS = ["livre", "reservada", "manutencao"];
    if (!numero || !PERMITIDOS.includes(novoStatus)) {
      return { error: new Error("Status de mesa inválido.") };
    }
    let anterior = "livre";
    setMesas(prev => prev.map(m => {
      if (m.numero !== numero) return m;
      anterior = m.status_manual ?? "livre";
      return { ...m, status_manual: novoStatus };
    }));
    const { error } = await supabase
      .from("mesas")
      .update({ status_manual: novoStatus })
      .eq("numero", numero);
    if (error) {
      setMesas(prev => prev.map(m => m.numero === numero ? { ...m, status_manual: anterior } : m));
    }
    return { error };
  }

  return { mesas, loading, erro, aoVivo, recarregar, atualizarStatusMesa };
}

/**
 * usePedidosCozinha — busca as comandas com itens lançados (o "pedido"
 * desta base, ver src/lib/cozinha.js) e sincroniza via realtime.
 * Usado pelo KDS (F007 — docs/03_REGRAS_DE_NEGOCIO/COZINHA.md).
 *
 * Expõe `erro` de propósito: se a busca falha, uma cozinha cheia vê a mesma
 * tela de cozinha vazia e simplesmente para de produzir. Painel vazio e
 * painel quebrado precisam ser distinguíveis a metros de distância.
 * Expõe `recarregar` para o cozinheiro tentar de novo sem sair da tela.
 */
const CAMPOS_COZINHA = "id,comanda,mesa,apelido,items,status,status_cozinha,garcom,created_at,em_preparo_em,pronto_em";

export function usePedidosCozinha() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  // `aoVivo` é aditivo: o KDS que só lê { pedidos, loading, erro } segue igual.
  const [aoVivo, setAoVivo] = useState(true);

  const recarregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pending")
      .select(CAMPOS_COZINHA)
      .order("created_at", { ascending: true });
    if (error) {
      // Mantém o que já estava na tela: é melhor a lista de 1 minuto atrás do
      // que apagar pedidos reais que a cozinha ainda precisa fazer.
      setErro(error);
    } else {
      setErro(null);
      setPedidos((data ?? []).filter(p => Array.isArray(p.items) && p.items.length > 0));
    }
    setLoading(false);
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  // Requer Realtime habilitado na tabela `pending` (Database → Replication).
  useEffect(() => {
    let vivo = true;
    const channel = supabase
      .channel("cozinha-pedidos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pending" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const novo = payload.new;
          if (!Array.isArray(novo.items) || novo.items.length === 0) return;
          setPedidos(prev => prev.find(p => p.id === novo.id) ? prev : [...prev, novo]);
        } else if (payload.eventType === "UPDATE") {
          const atualizado = payload.new;
          setPedidos(prev => {
            if (!Array.isArray(atualizado.items) || atualizado.items.length === 0) {
              return prev.filter(p => p.id !== atualizado.id);
            }
            const existe = prev.find(p => p.id === atualizado.id);
            return existe
              ? prev.map(p => (p.id === atualizado.id ? atualizado : p))
              : [...prev, atualizado];
          });
        } else if (payload.eventType === "DELETE") {
          // Comanda finalizada/cancelada — sai do painel (mesma regra de COZINHA.md).
          setPedidos(prev => prev.filter(p => p.id !== payload.old.id));
        }
      })
      .subscribe(tratarStatusCanal("cozinha-pedidos-realtime", {
        recarregar, setAoVivo, estaVivo: () => vivo,
      }));

    return () => { vivo = false; supabase.removeChannel(channel); };
  }, [recarregar]);

  return { pedidos, loading, erro, aoVivo, recarregar };
}

/**
 * usePedidosDelivery — pedidos de delivery do tenant (aba de Pedidos, Fase 4)
 * com sincronização ao vivo. Fonte da lista: `delivery_pedidos` (histórico
 * próprio do delivery). A RLS já filtra por tenant; admin lê direto.
 *
 * Duas assinaturas de realtime, de propósito (ambas as tabelas já estão com
 * Realtime habilitado em produção):
 *  • `delivery_pedidos`: mudança de status ao vivo entre dispositivos — o
 *    entregador marca "saiu para entrega" e o balcão vê na hora.
 *  • `pending` filtrado em created_by='delivery' (INSERT): pedido novo do
 *    cliente. Como o INSERT do `pending` não traz a linha de
 *    `delivery_pedidos`, aqui só disparamos um recarregar() — barato e sempre
 *    correto.
 *
 * Expõe { pedidos, carregando, erro, recarregar }.
 *
 * `sessaoAbertaEm` (opcional) é a hora de abertura do caixa, que a tela pega
 * no contexto e repassa. Ela existe porque o recorte das colunas terminais é
 * por TURNO, e não por dia de calendário: a aba do PDV fica aberta 24 horas e
 * a madrugada pertence ao movimento da noite anterior. Sem ela o recorte cai
 * no início do dia (comportamento anterior).
 */
export function usePedidosDelivery({ sessaoAbertaEm = null } = {}) {
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  // Um único `aoVivo` para os dois canais: a tela só está ao vivo quando os
  // dois estão de pé, e é isso que o operador precisa saber. Aditivo.
  const [aoVivo, setAoVivo] = useState(true);

  const recarregar = useCallback(async () => {
    const { data, error } = await listarPedidosDelivery({ sessaoAbertaEm });
    if (error) {
      // Mantém a lista que já estava na tela — mesma regra de
      // usePedidosCozinha. `listarPedidosDelivery` devolve data: [] em
      // qualquer falha, então gravar `data` aqui apagava TODOS os pedidos em
      // andamento por uma piscada de rede. E não era só no botão
      // "Atualizar": `avancar` e `cancelar` chamam recarregar() logo depois
      // de mudar o status com sucesso, então uma falha nesse recarregar
      // fazia o pedido que acabou de ser aceito desaparecer da tela.
      setErro(error);
    } else {
      setErro(null);
      setPedidos(data ?? []);
    }
    setCarregando(false);
  }, [sessaoAbertaEm]);

  useEffect(() => { recarregar(); }, [recarregar]);

  // Status ao vivo entre dispositivos.
  useEffect(() => {
    let vivo = true;
    const channel = supabase
      .channel("delivery-pedidos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_pedidos" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const novo = payload.new;
          setPedidos((prev) => (prev.find((p) => p.id === novo.id) ? prev : [novo, ...prev]));
        } else if (payload.eventType === "UPDATE") {
          const atualizado = payload.new;
          setPedidos((prev) => prev.map((p) => (p.id === atualizado.id ? { ...p, ...atualizado } : p)));
        } else if (payload.eventType === "DELETE") {
          setPedidos((prev) => prev.filter((p) => p.id !== payload.old.id));
        }
      })
      .subscribe(tratarStatusCanal("delivery-pedidos-realtime", {
        recarregar, setAoVivo, estaVivo: () => vivo,
      }));

    return () => { vivo = false; supabase.removeChannel(channel); };
  }, [recarregar]);

  // Novo pedido do cliente ao vivo HOJE: `pending` já tem Realtime. O espelho
  // do delivery entra com created_by='delivery' — nesse INSERT, recarrega a
  // lista de `delivery_pedidos` (fonte de verdade da aba).
  useEffect(() => {
    let vivo = true;
    const channel = supabase
      .channel("delivery-pending-espelho")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pending", filter: "created_by=eq.delivery" },
        () => { recarregar(); },
      )
      .subscribe(tratarStatusCanal("delivery-pending-espelho", {
        recarregar, setAoVivo, estaVivo: () => vivo,
      }));

    return () => { vivo = false; supabase.removeChannel(channel); };
  }, [recarregar]);

  return { pedidos, carregando, erro, aoVivo, recarregar };
}

// ── Relógio ───────────────────────────────────────────────────────
//
// Existem porque o PDV não fecha nunca: a aba do balcão atravessa a meia-noite
// todos os dias sem recarregar, e tudo que resolveu uma data e guardou passa a
// mostrar o dia errado. Sem um valor que ande, o relatório com "Hoje" ativo
// segue mostrando a noite passada, e o Financeiro aberto em 30 de agosto
// continua em agosto o setembro inteiro.
//
// 30 segundos é o passo que a Cozinha já usa, e é folgado para o que estes
// hooks servem: ninguém precisa da virada no segundo exato, precisa é de não
// ficar preso no dia anterior.

/** Passo padrão dos dois hooks abaixo, igual ao da Cozinha. */
export const PASSO_RELOGIO_MS = 30_000;

/**
 * Instante que avança sozinho. Use quando o cálculo precisa da HORA (janelas
 * de "7 dias", "30 dias", tempo decorrido).
 *
 * Cuidado: isto re-renderiza a cada passo. Quando o que importa é só o DIA,
 * use `useDiaAtual`, que só re-renderiza na virada.
 */
export function useAgora(passoMs = PASSO_RELOGIO_MS) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), passoMs);
    return () => clearInterval(id);
  }, [passoMs]);
  return agora;
}

/**
 * O dia corrente, como texto estável. Regravar o mesmo dia não provoca render,
 * então quem depende disto refaz o trabalho UMA VEZ por virada, e não a cada
 * passo do relógio. É o que se quer quando a dependência dispara consulta ao
 * banco.
 */
export function useDiaAtual(passoMs = PASSO_RELOGIO_MS) {
  const [dia, setDia] = useState(() => new Date().toDateString());
  useEffect(() => {
    const id = setInterval(() => setDia(new Date().toDateString()), passoMs);
    return () => clearInterval(id);
  }, [passoMs]);
  return dia;
}
