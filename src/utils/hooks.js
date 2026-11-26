import { useState, useEffect } from "react";

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
    } catch {
      // Armazenamento cheio ou bloqueado: o valor segue só em memória.
    }
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
  useEffect(() => {
    if (!enabled) return;

    // Sem aviso quando não há callback, quando o adiantamento é zero/negativo,
    // ou quando ele não cabe dentro do tempo de inatividade.
    const comAviso = typeof onAviso === "function" && avisoMs > 0 && avisoMs < delay;

    let timer;
    let timerAviso;
    let avisando = false;

    const armar = () => {
      timer = setTimeout(callback, delay);
      if (comAviso) {
        timerAviso = setTimeout(() => { avisando = true; onAviso(true); }, delay - avisoMs);
      }
    };

    armar();

    const reset = () => {
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
      events.forEach((e) => window.removeEventListener(e, reset, true));
    };
  }, [callback, delay, enabled, onAviso, avisoMs]);
}
