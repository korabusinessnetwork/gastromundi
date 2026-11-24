import { useState } from "react";
import { EMPTY_FORM } from "@/features/mesas/regras/mapa";

// Estado da janela de criar ou editar uma mesa.
export function useEstadoFormMesa() {
  // Modal criar/editar
  const [modal,     setModal]     = useState(false);
  const [editando,  setEditando]  = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [formPosX,  setFormPosX]  = useState(1);
  const [formPosY,  setFormPosY]  = useState(1);
  const [formErro,  setFormErro]  = useState("");
  const [salvando,  setSalvando]  = useState(false);

  return {
    modal, setModal, editando, setEditando, form, setForm, formPosX, setFormPosX, formPosY,
    setFormPosY, formErro, setFormErro, salvando, setSalvando,
  };
}
