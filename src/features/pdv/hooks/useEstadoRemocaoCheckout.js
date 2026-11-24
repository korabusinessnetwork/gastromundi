import { useState } from "react";

// Estado da remoção de item na finalização, com motivo e senha de gerente.
export function useEstadoRemocaoCheckout() {
  // Leva 15.1 — remover produto na finalização. `modoRemocao` mostra a
  // lixeira em cada item; `remocao` é o popup de confirmação (qty +
  // motivo + senha de gerente, mesmo padrão do cancelamento no CartPanel).
  const [modoRemocao, setModoRemocao] = useState(false);
  const [remocao,     setRemocao]     = useState(null); // { item, qtyMax, qtySel, motivo }
  const [remSenha,     setRemSenha]     = useState("");
  // Texto: "senha errada" e "não deu para verificar agora" são coisas diferentes.
  const [remSenhaErro, setRemSenhaErro] = useState("");
  const [remSenhaVis,  setRemSenhaVis]  = useState(false);
  const [remErro,      setRemErro]      = useState("");
  const [removendo,    setRemovendo]    = useState(false);

  return {
    modoRemocao, setModoRemocao, remocao, setRemocao, remSenha, setRemSenha, remSenhaErro,
    setRemSenhaErro, remSenhaVis, setRemSenhaVis, remErro, setRemErro, removendo, setRemovendo,
  };
}
