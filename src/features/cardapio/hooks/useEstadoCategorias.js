import { useState } from "react";

// Estado do gerenciamento de categorias personalizadas.
export function useEstadoCategorias() {
  // ── Categorias ────────────────────────────────────────────────
  const [showCatModal,    setShowCatModal]    = useState(false);
  const [catExtra,        setCatExtra]        = useState([]);
  const [catEditando,     setCatEditando]     = useState(null);
  const [catNova,         setCatNova]         = useState("");
  const [catOpLoading,    setCatOpLoading]    = useState(false);
  const [catConfirmDelete, setCatConfirmDelete] = useState(null); // nome da categoria a excluir
  const [catErro,         setCatErro]         = useState("");
  const [catExtraCarregado, setCatExtraCarregado] = useState(false);

  return {
    showCatModal,
    setShowCatModal,
    catExtra,
    setCatExtra,
    catEditando,
    setCatEditando,
    catNova,
    setCatNova,
    catOpLoading,
    setCatOpLoading,
    catConfirmDelete,
    setCatConfirmDelete,
    catErro,
    setCatErro,
    catExtraCarregado,
    setCatExtraCarregado,
  };
}
