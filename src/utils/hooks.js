import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

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
    const events = ["mousemove", "keydown", "click", "touchstart"];

    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
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

  return { mesas, loading };
}

/**
 * usePedidosCozinha — busca as comandas com itens lançados (o "pedido"
 * desta base, ver src/lib/cozinha.js) e sincroniza via realtime.
 * Usado pelo KDS (F007 — docs/03_REGRAS_DE_NEGOCIO/COZINHA.md).
 */
export function usePedidosCozinha() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  const CAMPOS = "id,comanda,mesa,apelido,items,status,status_cozinha,garcom,created_at,em_preparo_em,pronto_em";

  useEffect(() => {
    supabase
      .from("pending")
      .select(CAMPOS)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        // supabase-js não lança: sem checar .error, uma falha de RLS/rede
        // deixava o KDS num "vazio" silencioso, como se não houvesse pedidos.
        if (error) {
          console.error("usePedidosCozinha load error:", error.message);
          setErro(true);
        } else {
          setPedidos((data ?? []).filter(p => Array.isArray(p.items) && p.items.length > 0));
        }
        setLoading(false);
      });
  }, []);

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

  return { pedidos, loading, erro };
}
