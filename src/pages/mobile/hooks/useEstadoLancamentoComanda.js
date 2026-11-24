import { useState } from "react";

// Estado do lançamento de comanda: número, mesa, apelido e o erro do formulário.
export function useEstadoLancamentoComanda() {
  const [showLancar, setShowLancar] = useState(false);
  const [lancComanda, setLancComanda] = useState("");
  const [lancMesa, setLancMesa] = useState("");
  const [lancApelido, setLancApelido] = useState(""); // nome/complemento opcional (sai impresso, separado do nº)
  const [lancErro, setLancErro] = useState("");

  return {
    showLancar, setShowLancar, lancComanda, setLancComanda, lancMesa, setLancMesa, lancApelido,
    setLancApelido, lancErro, setLancErro,
  };
}
