import { useState, useEffect } from "react";
import C from "@/constants/colors";

/** Hook para disparar notificações toast */
export function useNotification() {
  const [notif, setNotif] = useState(null);

  const notify = (msg, type = "ok") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 2500);
  };

  return { notif, notify };
}

/** Componente de notificação toast */
export default function Notification({ notif }) {
  if (!notif) return null;
  return (
    <div style={{
      position: "fixed", top: 16, right: 16, zIndex: 300,
      background: notif.type === "err" ? C.red : C.green,
      color: "#fff", padding: "12px 20px", borderRadius: 10,
      fontWeight: 700, fontSize: 14,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    }}>
      {notif.type === "err" ? "🗑️" : "✅"} {notif.msg}
    </div>
  );
}
