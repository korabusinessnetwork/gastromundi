import { useState } from "react";

// Estado do cancelamento de comanda inteira, com motivo e senha de gerente.
export function useEstadoCancelamentoComanda() {
  const [showCancelarComanda,    setShowCancelarComanda]    = useState(false);
  const [cancelarSenha,          setCancelarSenha]          = useState("");
  const [cancelarSenhaErro,      setCancelarSenhaErro]      = useState("");
  const [cancelarSenhaVis,       setCancelarSenhaVis]       = useState(false);
  const [cancelarAutorizado,     setCancelarAutorizado]     = useState(false);
  const [cancelarMotivo,         setCancelarMotivo]         = useState("");
  const [cancelandoComanda,      setCancelandoComanda]      = useState(false);

  return {
    showCancelarComanda, setShowCancelarComanda, cancelarSenha, setCancelarSenha,
    cancelarSenhaErro, setCancelarSenhaErro, cancelarSenhaVis, setCancelarSenhaVis,
    cancelarAutorizado, setCancelarAutorizado, cancelarMotivo, setCancelarMotivo,
    cancelandoComanda, setCancelandoComanda,
  };
}
