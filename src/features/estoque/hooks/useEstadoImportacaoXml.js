import { useState, useRef } from "react";

// Estado do assistente que importa a nota pelo XML: passo, arquivo lido,
// checagem de duplicada, vínculo dos itens e resultado da gravação.
export function useEstadoImportacaoXml() {
  // Wizard (XML)
  const [step,         setStep]        = useState(1);
  const [xmlString,    setXmlString]   = useState("");
  const [parsed,       setParsed]      = useState(null);
  const [xmlErro,      setXmlErro]     = useState("");
  const [checkingDup,  setCheckingDup] = useState(false);
  const [duplicadaEm,  setDuplicadaEm] = useState(null);
  const [dupErro,      setDupErro]     = useState("");
  const [itensVinc,    setItensVinc]   = useState([]);
  const [saving,       setSaving]      = useState(false);
  const [saveErro,     setSaveErro]    = useState("");
  const [importOk,     setImportOk]    = useState(null);
  const [dragOver,     setDragOver]    = useState(false);
  const fileRef = useRef(null);

  return {
    step,
    setStep,
    xmlString,
    setXmlString,
    parsed,
    setParsed,
    xmlErro,
    setXmlErro,
    checkingDup,
    setCheckingDup,
    duplicadaEm,
    setDuplicadaEm,
    dupErro,
    setDupErro,
    itensVinc,
    setItensVinc,
    saving,
    setSaving,
    saveErro,
    setSaveErro,
    importOk,
    setImportOk,
    dragOver,
    setDragOver,
    fileRef,
  };
}
