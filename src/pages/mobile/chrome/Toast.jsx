import React, { useRef, useEffect, useState } from 'react';
import './Toast.css';

/**
 * Toast — Notificação transitória no topo, animada (sucesso/verde).
 *
 * Props (congeladas):
 * - msg: string | null (quando definida, mostra; quando null, fade out)
 *
 * Mantém a mensagem anterior em display durante fade-out, para evitar
 * que o texto desapareça mid-animação.
 */
export default function Toast({ msg }) {
  const msgRef = useRef('');
  const [isVisible, setIsVisible] = useState(false);

  // Atualiza mensagem quando uma nova chega não-vazia
  useEffect(() => {
    if (msg) {
      msgRef.current = msg;
      setIsVisible(true);
    }
  }, [msg]);

  // Quando msg vira null, inicia fade-out (mantendo texto anterior)
  useEffect(() => {
    if (!msg && isVisible) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 400); // Duração da fade-out
      return () => clearTimeout(timer);
    }
  }, [msg, isVisible]);

  return (
    <div className={`toast ${isVisible ? 'toast--visible' : ''}`} role="status" aria-live="polite">
      {msgRef.current}
    </div>
  );
}
