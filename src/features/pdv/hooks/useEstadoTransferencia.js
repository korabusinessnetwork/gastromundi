import { useState } from "react";

// Estado da janela de transferir itens entre comandas: quantidades por item,
// destino escolhido e o andamento da transferência.
export function useEstadoTransferencia() {
  const [transQtds,         setTransQtds]         = useState({});         // { [itemIdx]: qty }
  const [transDestino,      setTransDestino]      = useState(null);       // order id destino (null = nova)
  const [transMode,         setTransMode]         = useState("lista");    // "lista" | "numero" | "nova"
  const [transNumero,       setTransNumero]       = useState("");         // número digitado manualmente
  const [transNomeNova,     setTransNomeNova]     = useState("");         // nome da nova comanda
  const [transNumeroErro,   setTransNumeroErro]   = useState("");
  const [transferindo,      setTransferindo]      = useState(false);

  return {
    transQtds, setTransQtds, transDestino, setTransDestino, transMode, setTransMode, transNumero,
    setTransNumero, transNomeNova, setTransNomeNova, transNumeroErro, setTransNumeroErro,
    transferindo, setTransferindo,
  };
}
