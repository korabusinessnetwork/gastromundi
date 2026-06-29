import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import C from "@/constants/colors";
import { LuCheck, LuTriangleAlert, LuLayoutGrid } from "react-icons/lu";

export default function RoteamentoCategorias({ sz }) {
  const [categorias,  setCategorias]  = useState([]);
  const [locais,      setLocais]      = useState([]);
  const [roteamento,  setRoteamento]  = useState({}); // { [categoria]: localId | "" }
  const [salvando,    setSalvando]    = useState({}); // { [categoria]: bool }
  const [salvo,       setSalvo]       = useState({}); // { [categoria]: bool } feedback visual
  const [loading,     setLoading]     = useState(true);
  const [erro,        setErro]        = useState("");

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      try {
        const [
          { data: prodData,  error: e1 },
          { data: locaisData, error: e2 },
          { data: rotaData,  error: e3 },
        ] = await Promise.all([
          supabase.from("products").select("category").eq("active", true),
          supabase.from("locais_impressao").select("id,nome").eq("ativo", true).order("created_at"),
          supabase.from("categorias_roteamento").select("categoria,local_impressao_id"),
        ]);
        if (e1 || e2 || e3) throw new Error("Erro ao carregar dados");

        // Categorias únicas e não-nulas
        const cats = [...new Set(
          (prodData ?? []).map(p => p.category).filter(Boolean)
        )].sort();
        setCategorias(cats);
        setLocais(locaisData ?? []);

        // Monta mapa { categoria: local_id }
        const mapa = {};
        (rotaData ?? []).forEach(r => { mapa[r.categoria] = r.local_impressao_id ?? ""; });
        setRoteamento(mapa);
      } catch (e) {
        setErro("Erro ao carregar roteamento.");
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, []);

  async function handleChange(categoria, localId) {
    setRoteamento(prev => ({ ...prev, [categoria]: localId }));
    setSalvando(prev => ({ ...prev, [categoria]: true }));
    setSalvo(prev => ({ ...prev, [categoria]: false }));
    try {
      if (localId) {
        await supabase.from("categorias_roteamento").upsert(
          { categoria, local_impressao_id: localId, updated_at: new Date().toISOString() },
          { onConflict: "categoria" }
        );
      } else {
        // "Não imprimir" → remove o roteamento
        await supabase.from("categorias_roteamento").delete().eq("categoria", categoria);
      }
      setSalvo(prev => ({ ...prev, [categoria]: true }));
      setTimeout(() => setSalvo(prev => ({ ...prev, [categoria]: false })), 1800);
    } catch {
      setErro(`Erro ao salvar roteamento de "${categoria}".`);
    } finally {
      setSalvando(prev => ({ ...prev, [categoria]: false }));
    }
  }

  if (loading) {
    return <div style={{ color: C.muted, fontSize: sz.fontSm, padding: "40px 0", textAlign: "center" }}>Carregando…</div>;
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: sz.pad }}>
        <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>Roteamento por Categoria</div>
        <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>
          Defina para onde cada categoria de produto deve ser impressa. A alteração é salva automaticamente.
        </div>
      </div>

      {erro && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}33`, color: C.red, fontSize: sz.fontSm, display: "flex", gap: 8 }}>
          <LuTriangleAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {erro}
        </div>
      )}

      {locais.length === 0 && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: `${C.accent}10`, border: `1px solid ${C.accent}33`, color: C.accent, fontSize: sz.fontSm }}>
          Nenhum local de impressão ativo cadastrado. Crie locais na aba "Locais de Impressão" primeiro.
        </div>
      )}

      {categorias.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "40px 24px", textAlign: "center", color: C.muted }}>
          <LuLayoutGrid size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 600, fontSize: sz.fontBase }}>Nenhuma categoria encontrada</div>
          <div style={{ fontSize: sz.fontSm, marginTop: 4 }}>Cadastre produtos com categoria para configurar o roteamento.</div>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {/* Cabeçalho da tabela */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 32px", gap: 0, padding: "10px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Categoria</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Destino de impressão</div>
            <div />
          </div>

          {categorias.map((cat, i) => (
            <div
              key={cat}
              style={{
                display: "grid", gridTemplateColumns: "1fr 220px 32px",
                alignItems: "center", gap: 12,
                padding: "12px 20px",
                borderBottom: i < categorias.length - 1 ? `1px solid ${C.border}` : "none",
                background: salvando[cat] ? `${C.accent}05` : "transparent",
                transition: "background 0.2s",
              }}
            >
              {/* Nome da categoria */}
              <div style={{ fontWeight: 600, fontSize: sz.fontBase, color: C.text }}>
                {cat}
              </div>

              {/* Select de destino */}
              <select
                value={roteamento[cat] ?? ""}
                onChange={e => handleChange(cat, e.target.value)}
                disabled={salvando[cat] || locais.length === 0}
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 8,
                  border: `1.5px solid ${C.border}`,
                  background: C.surface, color: C.text,
                  fontSize: sz.fontSm, fontFamily: "inherit",
                  cursor: locais.length === 0 ? "not-allowed" : "pointer",
                  outline: "none", appearance: "none",
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 10px center",
                  paddingRight: 32,
                }}
              >
                <option value="">— Não imprimir —</option>
                {locais.map(l => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>

              {/* Feedback salvo */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                {salvo[cat] && (
                  <LuCheck size={16} color={C.green} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
