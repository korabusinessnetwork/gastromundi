import { useState } from "react";

// Estado do desconto e do acréscimo, com a senha de gerente.
export function useEstadoAjusteCheckout() {
  // Desconto / Acréscimo
  const [showAjuste,    setShowAjuste]    = useState(false);
  const [ajusteTipo,    setAjusteTipo]    = useState("desconto");
  const [ajusteMode,    setAjusteMode]    = useState("percentual");
  const [ajusteValor,   setAjusteValor]   = useState("");
  const [ajusteAplicado, setAjusteAplicado] = useState(null);
  // Senha de gerente no desconto (mesmo padrão do popup de remover item).
  const [ajusteSenha,     setAjusteSenha]     = useState("");
  const [ajusteSenhaErro, setAjusteSenhaErro] = useState("");
  const [ajusteSenhaVis,  setAjusteSenhaVis]  = useState(false);
  const [aplicandoAjuste, setAplicandoAjuste] = useState(false);

  return {
    showAjuste, setShowAjuste, ajusteTipo, setAjusteTipo, ajusteMode, setAjusteMode, ajusteValor,
    setAjusteValor, ajusteAplicado, setAjusteAplicado, ajusteSenha, setAjusteSenha,
    ajusteSenhaErro, setAjusteSenhaErro, ajusteSenhaVis, setAjusteSenhaVis, aplicandoAjuste,
    setAplicandoAjuste,
  };
}
