import { LuCircleAlert, LuCircleCheck } from "react-icons/lu";
import { useState } from "react";
import "./Notification.css";

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
    <div className={`notification notification--${notif.type === "err" ? "erro" : "ok"}`} role="status">
      {notif.type === "err"
        ? <LuCircleAlert size={16} className="notification__icone" aria-hidden="true" />
        : <LuCircleCheck size={16} className="notification__icone" aria-hidden="true" />}
      {" "}{notif.msg}
    </div>
  );
}
