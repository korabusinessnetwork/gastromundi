import { useEffect, useState } from "react";

// Estado online/offline do navegador (Leva 11 — offline-first).
// navigator.onLine + eventos 'online'/'offline' da window. É o gatilho
// que dispara a drenagem da fila local quando a internet volta.
export function useStatusRede() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false
  );

  useEffect(() => {
    const marcarOnline = () => setOnline(true);
    const marcarOffline = () => setOnline(false);
    window.addEventListener("online", marcarOnline);
    window.addEventListener("offline", marcarOffline);
    return () => {
      window.removeEventListener("online", marcarOnline);
      window.removeEventListener("offline", marcarOffline);
    };
  }, []);

  return online;
}
