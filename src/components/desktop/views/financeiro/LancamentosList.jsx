import C from "@/constants/colors";
import { LuCheck } from "react-icons/lu";

const STATUS_COLOR = { recebido: C.green, pago: C.green, previsto: C.blue, vencido: C.red };
const STATUS_LABEL = { recebido: "Recebido", pago: "Pago", previsto: "Previsto", vencido: "Vencido" };
const TIPO_LABEL = { receita: "Receita", despesa: "Despesa" };

function fmtR(v) {
  return "R$ " + Number(v ?? 0).toFixed(2);
}

const selectStyle = { padding: "8px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: "inherit", fontSize: 14 };
const thStyle = { padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 14px", fontSize: 14, color: C.text };

export default function LancamentosList({
  lancamentos, loading,
  filtroTipo, setFiltroTipo,
  filtroStatus, setFiltroStatus,
  onBaixar, sz,
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: sz.gap, flexWrap: "wrap" }}>
        <select aria-label="Filtrar por tipo" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={selectStyle}>
          <option value="todos">Todos os tipos</option>
          <option value="receita">Receita</option>
          <option value="despesa">Despesa</option>
        </select>
        <select aria-label="Filtrar por status" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={selectStyle}>
          <option value="todos">Todos os status</option>
          <option value="previsto">Previsto</option>
          <option value="pago">Pago</option>
          <option value="recebido">Recebido</option>
          <option value="vencido">Vencido</option>
        </select>
      </div>

      {loading ? (
        <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Carregando…</div>
      ) : lancamentos.length === 0 ? (
        <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Nenhum lançamento no período.</div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={thStyle}>Competência</th>
                <th style={thStyle}>Tipo</th>
                <th style={thStyle}>Categoria</th>
                <th style={thStyle}>Descrição</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Valor</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={tdStyle}>{l.competencia}</td>
                  <td style={tdStyle}>{TIPO_LABEL[l.tipo] ?? l.tipo}</td>
                  <td style={tdStyle}>{l.categoria}</td>
                  <td style={tdStyle}>{l.descricao ?? "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{fmtR(l.valor)}</td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                      color: STATUS_COLOR[l.status] ?? C.muted,
                      background: `${STATUS_COLOR[l.status] ?? C.muted}22`,
                      padding: "2px 8px", borderRadius: 8,
                    }}>
                      {STATUS_LABEL[l.status] ?? l.status}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {l.status === "previsto" && (
                      <button
                        onClick={() => onBaixar(l.id)}
                        style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", color: C.muted, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" }}
                      >
                        <LuCheck size={13} /> Baixar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
