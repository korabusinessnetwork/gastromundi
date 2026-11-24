import { useState } from "react";

// Estado da escolha de mesa e do cliente vinculado à comanda.
export function useEstadoMesaCliente() {
  const [showMesa,               setShowMesa]               = useState(false);
  const [mesaInput,         setMesaInput]         = useState("");
  const [apelidoInput,      setApelidoInput]      = useState("");
  const [mesaPendingOrder,  setMesaPendingOrder]  = useState(null);
  const [salvandoMesa,      setSalvandoMesa]      = useState(false);

  // ── Vincular cliente à comanda (botão "Cliente") ──────────────
  const [showCliente,          setShowCliente]          = useState(false);
  const [clientePendingOrder,  setClientePendingOrder]  = useState(null);
  const [clienteSel,           setClienteSel]           = useState(null); // cliente escolhido na modal
  const [salvandoCliente,      setSalvandoCliente]      = useState(false);

  return {
    showMesa, setShowMesa, mesaInput, setMesaInput, apelidoInput, setApelidoInput,
    mesaPendingOrder, setMesaPendingOrder, salvandoMesa, setSalvandoMesa, showCliente,
    setShowCliente, clientePendingOrder, setClientePendingOrder, clienteSel, setClienteSel,
    salvandoCliente, setSalvandoCliente,
  };
}
