import { useState, useEffect, useRef } from "react";
import { listarMesas, criarMesa, alterarCapacidadeMesa, excluirMesa, salvarLayoutMesas } from "@/features/mesas/dados/mesas";
import { CARD_W, CARD_H, CARD_GAP, MIN_COLS, MIN_ROWS, EMPTY_FORM, proximaPosicaoLivre } from "@/components/desktop/views/mesas/apoio";
import { useEstadoFormMesa } from "./useEstadoFormMesa";

// Estado e ações do mapa de mesas: carga, posições, arrastar, criar, editar e excluir.
export function useMesasAdmin({ sz }) {
  const [mesas,          setMesas]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [erro,           setErro]           = useState("");
  const [posicoesDirty,  setPosicoesDirty]  = useState(false);
  const [salvandoLayout, setSalvandoLayout] = useState(false);

  // Pré-visualização: total de mesas que o operador planeja ter. Gera
  // cards-fantasma no mapa (só visual — nada é gravado até criar cada mesa).
  const [previewTotal,   setPreviewTotal]   = useState("");

  const {
    modal, setModal, editando, setEditando, form, setForm, formPosX, setFormPosX, formPosY,
    setFormPosY, formErro, setFormErro, salvando, setSalvando,
  } = useEstadoFormMesa();

  // Modal confirmar exclusão
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deletando,     setDeletando]     = useState(false);

  // Drag
  const [dragging, setDragging] = useState(null); // numero da mesa sendo arrastada
  const containerRef = useRef(null);

  useEffect(() => { fetchMesas(); }, []);

  async function fetchMesas() {
    setLoading(true);
    setErro("");
    const { data, error } = await listarMesas();
    if (error) setErro("Erro ao carregar mesas.");
    else setMesas(data ?? []);
    setLoading(false);
  }

  // ── Modal helpers ────────────────────────────────────────────────

  function abrirNovo() {
    const pos = proximaPosicaoLivre(mesas);
    setEditando(null);
    setForm(EMPTY_FORM);
    setFormPosX(pos.posicao_x);
    setFormPosY(pos.posicao_y);
    setFormErro("");
    setModal(true);
  }

  // Próximo número inteiro livre — sugestão ao criar (mesas com nome de
  // texto, ex. "Varanda", são ignoradas na conta).
  function sugerirNumero() {
    const nums = mesas.map(m => parseInt(m.numero, 10)).filter(Number.isFinite);
    const base = nums.length ? Math.max(...nums) : 0;
    return String(base + 1);
  }

  // Clique num card-fantasma da pré-visualização: abre "Nova Mesa" já
  // posicionada naquela célula, com um número sugerido. Nada é gravado
  // até o operador confirmar no modal.
  function abrirNovoEm(pos) {
    setEditando(null);
    setForm({ numero: sugerirNumero(), capacidade: "4" });
    setFormPosX(pos.posicao_x);
    setFormPosY(pos.posicao_y);
    setFormErro("");
    setModal(true);
  }

  function abrirEditar(mesa) {
    setEditando(mesa);
    setForm({ numero: mesa.numero, capacidade: String(mesa.capacidade ?? 4) });
    setFormErro("");
    setModal(true);
  }

  function fecharModal() {
    setModal(false);
    setEditando(null);
    setForm(EMPTY_FORM);
    setFormErro("");
  }

  async function salvar() {
    const numero     = form.numero.trim();
    const capacidade = Math.max(1, parseInt(form.capacidade) || 4);

    if (!editando && !numero) { setFormErro("Informe o número ou nome da mesa."); return; }
    if (salvando) return;

    if (!editando) {
      const existe = mesas.some(m => m.numero === numero);
      if (existe) { setFormErro("Já existe uma mesa com este número/nome."); return; }
    }

    setSalvando(true);
    setFormErro("");
    try {
      if (editando) {
        const { error } = await alterarCapacidadeMesa(editando.numero, capacidade);
        if (error) throw error;
      } else {
        const { error } = await criarMesa({ numero, capacidade, posicao_x: formPosX, posicao_y: formPosY });
        if (error) throw error;
      }
      fecharModal();
      setPosicoesDirty(false);
      await fetchMesas();
    } catch {
      setFormErro("Erro ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  // ── Exclusão ──────────────────────────────────────────────────────

  async function executarDelete() {
    if (!confirmDelete || deletando) return;
    setDeletando(true);
    const { error } = await excluirMesa(confirmDelete.numero);
    if (error) {
      setErro("Erro ao remover mesa.");
    } else {
      setMesas(prev => prev.filter(m => m.numero !== confirmDelete.numero));
      if (mesas.length <= 1) setPosicoesDirty(false);
    }
    setConfirmDelete(null);
    setDeletando(false);
  }

  // ── Drag and drop ─────────────────────────────────────────────────

  function handleDragStart(e, numero) {
    e.dataTransfer.setData("text/plain", numero);
    e.dataTransfer.effectAllowed = "move";
    setDragging(numero);
  }

  function handleDragEnd() {
    setDragging(null);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e) {
    e.preventDefault();
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relX  = e.clientX - rect.left;
    const relY  = e.clientY - rect.top;
    const novoX = Math.max(1, Math.floor(relX / (CARD_W + CARD_GAP)) + 1);
    const novoY = Math.max(1, Math.floor(relY / (CARD_H + CARD_GAP)) + 1);
    setMesas(prev => prev.map(m =>
      m.numero === dragging ? { ...m, posicao_x: novoX, posicao_y: novoY } : m
    ));
    setPosicoesDirty(true);
    setDragging(null);
  }

  // ── Salvar layout em lote ─────────────────────────────────────────

  async function salvarLayout() {
    if (salvandoLayout) return;
    setSalvandoLayout(true);
    setErro("");
    try {
      const rows = mesas.map(m => ({
        numero:        m.numero,
        capacidade:    m.capacidade ?? 4,
        posicao_x:     m.posicao_x,
        posicao_y:     m.posicao_y,
        status_manual: m.status_manual ?? "livre",
      }));
      const { error } = await salvarLayoutMesas(rows);
      if (error) throw error;
      setPosicoesDirty(false);
    } catch {
      setErro("Erro ao salvar layout. Tente novamente.");
    } finally {
      setSalvandoLayout(false);
    }
  }

  // ── Pré-visualização: cards-fantasma ──────────────────────────────
  // O operador digita quantas mesas planeja ter (input ao lado de "Nova
  // Mesa"). O mapa mostra esse total de cards: os que passam das mesas
  // reais viram "fantasmas" tracejados nas células livres. Preenche em
  // ordem de leitura e não reusa célula ocupada. Nada é gravado — clicar
  // num fantasma abre o modal para criar a mesa ali.
  const maxRealX  = mesas.length ? Math.max(...mesas.map(m => m.posicao_x ?? 1)) : 0;
  const cols      = Math.max(MIN_COLS, maxRealX);
  const alvoPreview = parseInt(previewTotal, 10);
  const ghostCount  = Number.isFinite(alvoPreview)
    ? Math.min(200, Math.max(0, alvoPreview - mesas.length))
    : 0;

  const ocupadas = new Set(mesas.map(m => `${m.posicao_x ?? 1},${m.posicao_y ?? 1}`));
  const ghosts   = [];
  for (let linha = 1; ghosts.length < ghostCount && linha <= 400; linha++) {
    for (let coluna = 1; coluna <= cols && ghosts.length < ghostCount; coluna++) {
      const chave = `${coluna},${linha}`;
      if (ocupadas.has(chave)) continue;
      ocupadas.add(chave);
      ghosts.push({ posicao_x: coluna, posicao_y: linha });
    }
  }

  // ── Grid dimensions ───────────────────────────────────────────────

  const maxX    = Math.max(MIN_COLS, cols);
  const maxY    = Math.max(
    MIN_ROWS,
    ...mesas.map(m => m.posicao_y ?? 1),
    ...ghosts.map(g => g.posicao_y),
  );
  const gridCols = maxX + 1; // +1 de buffer para drops
  const gridRows = maxY + 1;
  const containerW = gridCols * (CARD_W + CARD_GAP) - CARD_GAP;
  const containerH = gridRows * (CARD_H + CARD_GAP) - CARD_GAP;

  return {
    mesas, setMesas, loading, setLoading, erro, setErro, posicoesDirty, setPosicoesDirty,
    salvandoLayout, setSalvandoLayout, previewTotal, setPreviewTotal, confirmDelete,
    setConfirmDelete, deletando, setDeletando, dragging, setDragging, modal, setModal, editando,
    setEditando, form, setForm, formPosX, setFormPosX, formPosY, setFormPosY, formErro,
    setFormErro, salvando, setSalvando, containerRef, maxRealX, cols, alvoPreview, ghostCount,
    ocupadas, ghosts, maxX, maxY, gridCols, gridRows, containerW, containerH, fetchMesas,
    abrirNovo, sugerirNumero, abrirNovoEm, abrirEditar, fecharModal, salvar, executarDelete,
    handleDragStart, handleDragEnd, handleDragOver, handleDrop, salvarLayout, sz,
  };
}
