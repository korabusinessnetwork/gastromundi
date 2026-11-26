import { useEffect, useState, useCallback } from "react";
import { LuPlus, LuPuzzle } from "react-icons/lu";
import {
  listarBibliotecaGrupos, salvarGrupoComplemento
} from "@/features/delivery/deliveryAdmin";
import GrupoCardMini from "./GrupoCardMini";
import GrupoEditor from "./GrupoEditor";

// ════════════════════════════════════════════════════════════════
// ABA 2 — Complementos (BIBLIOTECA de grupos reutilizáveis)
//
// Intuitivo: um só lugar onde o dono cria um grupo UMA vez (ex.:
// "Adicionais") e marca, num checklist, em quais produtos ele aparece —
// em vez de recriar o mesmo grupo produto a produto. O mesmo grupo
// reaparece em todos os itens marcados; editar seus itens reflete em
// todos de uma vez. Nada some do cardápio: os grupos antigos foram
// migrados para essa biblioteca com seu produto já vinculado.
// ════════════════════════════════════════════════════════════════
export default function AbaComplementos({ isAdmin, itens, products, aviso }) {
  const [grupos, setGrupos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [novoGrupo, setNovoGrupo] = useState("");
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  // Qual grupo está aberto para edição. null = grade de cards.
  const [grupoAbertoId, setGrupoAbertoId] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await listarBibliotecaGrupos();
    setCarregando(false);
    if (error) return aviso("Não foi possível carregar os complementos.", "err");
    setGrupos(data);
  }, [aviso]);

  useEffect(() => { carregar(); }, [carregar]);

  const addGrupo = async () => {
    const nome = novoGrupo.trim();
    if (!nome || salvandoGrupo) return;
    setSalvandoGrupo(true);
    const { data, error } = await salvarGrupoComplemento({ nome, min_escolhas: 0, max_escolhas: 1, ordem: grupos.length });
    setSalvandoGrupo(false);
    if (error) return aviso("Não foi possível criar o grupo.", "err");
    setNovoGrupo("");
    await carregar();
    // Abre o grupo recém-criado direto na edição (caminho feliz: criou → já configura).
    if (data?.id) setGrupoAbertoId(data.id);
  };

  if (carregando) {
    return <div className="delivery-view__carregando delivery-view__carregando--bloco">Carregando…</div>;
  }

  // ── Editor aberto: mostra só o grupo escolhido, limpo, com "voltar" ──
  const grupoAberto = grupoAbertoId ? grupos.find((g) => g.id === grupoAbertoId) : null;
  if (grupoAberto) {
    return (
      <GrupoEditor
        isAdmin={isAdmin}
        grupo={grupoAberto}
        biblioteca={grupos}
        products={products}
        itensCardapio={itens}
        aviso={aviso}
        recarregar={carregar}
        onVoltar={() => setGrupoAbertoId(null)}
        onRemovido={() => setGrupoAbertoId(null)}
      />
    );
  }

  // ── Grade de cards (visão padrão) ───────────────────────────────────
  return (
    <div className="delivery-view__complementos">
      <div className="delivery-view__complementos-topo">
        <div className="delivery-view__hint delivery-view__complementos-intro">
          Crie um grupo uma vez (ex.: “Adicionais”, “Molhos”) e marque em quais produtos ele aparece. Toque num card para editar.
        </div>
        {isAdmin && (
          <div className="delivery-view__novo-grupo">
            <input
              className="delivery-view__input"
              value={novoGrupo}
              onChange={(e) => setNovoGrupo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGrupo()}
              placeholder="Novo grupo (ex.: Adicionais)"
              maxLength={60}
            />
            <button onClick={addGrupo} disabled={!novoGrupo.trim() || salvandoGrupo} className="delivery-view__btn delivery-view__btn--primario delivery-view__btn--novo-grupo">
              <LuPlus size={14} /> Grupo
            </button>
          </div>
        )}
      </div>

      {grupos.length === 0 ? (
        <div className="delivery-view__vazio">
          <div className="delivery-view__vazio-emoji"><LuPuzzle aria-hidden="true" /></div>
          <div className="delivery-view__vazio-titulo">Nenhum grupo ainda</div>
          <div className="delivery-view__vazio-desc">Crie o primeiro grupo (ex.: “Adicionais”) e escolha em quais produtos ele aparece.</div>
        </div>
      ) : (
        <div className="delivery-view__grupos-grade">
          {grupos.map((g) => (
            <GrupoCardMini
              key={g.id}
              grupo={g}
              onAbrir={() => setGrupoAbertoId(g.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
