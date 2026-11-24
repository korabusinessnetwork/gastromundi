import { useState } from "react";

// Estado da autorização de entrada no estoque, com a senha.
export function useEstadoAutorizacaoEstoque() {
  // Autorização de entrada
  const [autorizado,    setAutorizado]    = useState(false);
  const [showAuth,      setShowAuth]      = useState(false);
  const [senha,         setSenha]         = useState("");
  // Texto: "senha errada" e "não deu para verificar agora" são coisas diferentes.
  const [senhaErro,     setSenhaErro]     = useState("");
  const [senhaVis,      setSenhaVis]      = useState(false);
  const [verificando,   setVerificando]   = useState(false);

  return {
    autorizado, setAutorizado, showAuth, setShowAuth, senha, setSenha, senhaErro, setSenhaErro,
    senhaVis, setSenhaVis, verificando, setVerificando,
  };
}
