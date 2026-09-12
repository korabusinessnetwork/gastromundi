import { useState, useEffect, useRef } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import "./Notification.css";

/** Hook para disparar notificações toast */
export function useNotification() {
  const [notif, setNotif] = useState(null);
  // O id do temporizador fica numa ref porque ele precisa ser cancelado: como
  // nada guardava o setTimeout, duas notificações em menos de 2,5 s faziam o
  // temporizador da PRIMEIRA apagar a mensagem NOVA antes da hora (no PDV é o
  // caso comum, lançar item e receber pagamento em sequência), e o temporizador
  // ainda sobrevivia à desmontagem da tela.
  const timerRef = useRef(null);

  const notify = (msg, type = "ok") => {
    clearTimeout(timerRef.current);
    setNotif({ msg, type });
    timerRef.current = setTimeout(() => setNotif(null), 2500);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { notif, notify };
}

/** Componente de notificação toast */
export default function Notification({ notif }) {
  if (!notif) return null;
  return (
    <div
      className="notification"
      style={{
        position: "fixed", top: 16, right: 16, zIndex: 300,
        background: notif.type === "err" ? varColor(C.red) : varColor(C.green),
        color: "#fff", padding: "12px 20px", borderRadius: 10,
        fontWeight: 700,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      {notif.type === "err" ? "🗑️" : "✅"} {notif.msg}
    </div>
  );
}
