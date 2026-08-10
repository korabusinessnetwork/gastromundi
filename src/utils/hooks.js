import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { listarPedidosDelivery } from "@/lib/delivery/deliveryPedidos";

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
 */
export function useIdleTimer(callback, delay, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    let timer = setTimeout(callback, delay);
    const reset = () => { clearTimeout(timer); timer = setTimeout(callback, delay); };
    // `wheel` e `scroll` contam como atividade: ler um relatório longo rolando
    // a página é gente na frente da tela, e sem eles dava logout no meio da
    // leitura. `scroll` de elemento não borbulha, então tudo entra na fase de
    // captura — que também impede um `stopPropagation` de escondê-los.
    const events = ["mousemove", "keydown", "click", "touchstart", "wheel", "scroll"];

    events.forEach((e) => window.addEventListener(e, reset, true));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset, true));
    };
  }, [callback, delay, enabled]);
}

/**
 * useMesas — busca a tabela de mesas e sincroniza via realtime
 * (mudanças de status manual/layout aparecem em outros dispositivos sem recarregar)
 */
export function useMesas() {
  const [mesas,   setMesas]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("mesas")
      .select("numero,capacidade,posicao_x,posicao_y,status_manual")
      .order("numero")
      .then(({ data }) => {
        setMesas(data ?? []);
        setLoading(false);
      });
  }, []);

  // Requer Realtime habilitado na tabela `mesas` (Database → Replication).
  useEffect(() => {
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
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

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

  return { mesas, loading, atualizarStatusMesa };
}

/**
 * usePedidosCozinha — busca as comandas com itens lançados (o "pedido"
 * desta base, ver src/lib/cozinha/cozinha.js) e sincroniza via realtime.
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
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { pedidos, loading, erro, recarregar };
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
 */
export function usePedidosDelivery() {
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const recarregar = useCallback(async () => {
    const { data, error } = await listarPedidosDelivery();
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
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  // Status ao vivo entre dispositivos.
  useEffect(() => {
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
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Novo pedido do cliente ao vivo HOJE: `pending` já tem Realtime. O espelho
  // do delivery entra com created_by='delivery' — nesse INSERT, recarrega a
  // lista de `delivery_pedidos` (fonte de verdade da aba).
  useEffect(() => {
    const channel = supabase
      .channel("delivery-pending-espelho")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pending", filter: "created_by=eq.delivery" },
        () => { recarregar(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [recarregar]);

  return { pedidos, carregando, erro, recarregar };
}
