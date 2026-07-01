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
 * useMesas — busca a tabela de mesas (sem realtime)
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

  return { mesas, loading };
}
