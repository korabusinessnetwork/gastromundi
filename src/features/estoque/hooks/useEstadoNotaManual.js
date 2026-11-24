import { useState, useRef } from "react";
import { hojeLocalISO } from "@/utils/datas";
import { novoItemManual } from "@/features/estoque/regras/notaManual";

// Estado do lançamento manual da nota e da escolha ou cadastro do fornecedor.
export function useEstadoNotaManual() {
  // Formulário manual
  const [manualForm,  setManualForm]  = useState({
    numero: "", serie: "",
    dataEmissao: hojeLocalISO(),
  });
  const [manualItens, setManualItens] = useState([novoItemManual()]);
  const [manualErro,  setManualErro]  = useState("");
  const [fromManual,    setFromManual]    = useState(false);
  const [pendingFornNome, setPendingFornNome] = useState(null);

  // Fornecedor
  const [showFornPopup,  setShowFornPopup]  = useState(false); // popup XML
  const [fornSaving,     setFornSaving]     = useState(false);
  const [manualFornId,   setManualFornId]   = useState("");    // id selecionado no formulário manual
  const [manualFornBusca, setManualFornBusca] = useState("");
  const [showFornDD,     setShowFornDD]     = useState(false);
  const [showNovoForn,   setShowNovoForn]   = useState(false); // popup "cadastrar novo" no manual
  const [novoFornForm,   setNovoFornForm]   = useState({ nome: "", cnpj: "" });
  const [novoFornErro,   setNovoFornErro]   = useState("");
  const fornDDRef = useRef(null);

  return {
    manualForm,
    setManualForm,
    manualItens,
    setManualItens,
    manualErro,
    setManualErro,
    fromManual,
    setFromManual,
    pendingFornNome,
    setPendingFornNome,
    showFornPopup,
    setShowFornPopup,
    fornSaving,
    setFornSaving,
    manualFornId,
    setManualFornId,
    manualFornBusca,
    setManualFornBusca,
    showFornDD,
    setShowFornDD,
    showNovoForn,
    setShowNovoForn,
    novoFornForm,
    setNovoFornForm,
    novoFornErro,
    setNovoFornErro,
    fornDDRef,
  };
}
