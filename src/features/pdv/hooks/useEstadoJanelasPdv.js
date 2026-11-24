import { useState } from "react";

// Estado das janelas do PDV: nova comanda, confirmar cancelamento, transferir e saldo do dia.
export function useEstadoJanelasPdv() {
  // modal nova comanda
  const [showNova,          setShowNova]          = useState(false);
  const [nomeComanda,       setNomeComanda]       = useState("");
  const [criando,           setCriando]           = useState(false);
  const [confirmCancelar,        setConfirmCancelar]        = useState(false);
  const [confirmCancelarMotivo,  setConfirmCancelarMotivo]  = useState("");
  const [showTransferir,    setShowTransferir]    = useState(false);
  const [showSaldo,         setShowSaldo]         = useState(false);
  const [saldoSenha,        setSaldoSenha]        = useState("");
  // Texto: "senha errada" e "não deu para verificar agora" são coisas diferentes.
  const [saldoSenhaErro,    setSaldoSenhaErro]    = useState("");
  const [saldoAutorizado,   setSaldoAutorizado]   = useState(false);
  const [saldoSenhaVis,     setSaldoSenhaVis]     = useState(false);

  return {
    showNova, setShowNova, nomeComanda, setNomeComanda, criando, setCriando, confirmCancelar,
    setConfirmCancelar, confirmCancelarMotivo, setConfirmCancelarMotivo, showTransferir,
    setShowTransferir, showSaldo, setShowSaldo, saldoSenha, setSaldoSenha, saldoSenhaErro,
    setSaldoSenhaErro, saldoAutorizado, setSaldoAutorizado, saldoSenhaVis, setSaldoSenhaVis,
  };
}
