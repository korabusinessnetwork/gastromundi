import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuCheck } from "react-icons/lu";
import "./LancamentosList.css";

const STATUS_COLOR = { recebido: varColor(C.green), pago: varColor(C.green), previsto: varColor(C.blue), vencido: varColor(C.red) };
const STATUS_LABEL = { recebido: "Recebido", pago: "Pago", previsto: "Previsto", vencido: "Vencido" };
const TIPO_LABEL = { receita: "Receita", despesa: "Despesa" };

function fmtR(v) {
  return "R$ " + Number(v ?? 0).toFixed(2);
}

export default function LancamentosList({
  lancamentos, loading,
  filtroTipo, setFiltroTipo,
  filtroStatus, setFiltroStatus,
  onBaixar, sz,
}) {
  return (
    <div className="lancamentos-list" style={{ padding: `0 ${sz.pad}px ${sz.pad}px` }}>
      {/* Filtros */}
      <div className="lancamentos-list__filtros" style={{ marginBottom: sz.gap }}>
        <select aria-label="Filtrar por tipo" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="lancamentos-list__select">
          <option value="todos">Todos os tipos</option>
          <option value="receita">Receita</option>
          <option value="despesa">Despesa</option>
        </select>
        <select aria-label="Filtrar por status" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="lancamentos-list__select">
          <option value="todos">Todos os status</option>
          <option value="previsto">Previsto</option>
          <option value="pago">Pago</option>
          <option value="recebido">Recebido</option>
          <option value="vencido">Vencido</option>
        </select>
      </div>

      {loading ? (
        <div className="lancamentos-list__estado">Carregando…</div>
      ) : lancamentos.length === 0 ? (
        <div className="lancamentos-list__estado">Nenhum lançamento no período.</div>
      ) : (
        <div className="lancamentos-list__moldura">
          <div className="lancamentos-list__scroll">
          <table className="lancamentos-list__tabela">
            <thead>
              <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                <th className="lancamentos-list__th">Competência</th>
                <th className="lancamentos-list__th">Tipo</th>
                <th className="lancamentos-list__th">Categoria</th>
                <th className="lancamentos-list__th">Descrição</th>
                <th className="lancamentos-list__th" style={{ textAlign: "right" }}>Valor</th>
                <th className="lancamentos-list__th">Status</th>
                <th className="lancamentos-list__th"></th>
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((l) => (
                <tr key={l.id} style={{ borderBottom: `1px solid var(${C.border})` }}>
                  <td className="lancamentos-list__td">{l.competencia}</td>
                  <td className="lancamentos-list__td">{TIPO_LABEL[l.tipo] ?? l.tipo}</td>
                  <td className="lancamentos-list__td">{l.categoria}</td>
                  <td className="lancamentos-list__td">{l.descricao ?? "—"}</td>
                  <td className="lancamentos-list__td" style={{ textAlign: "right", fontWeight: 700 }}>{fmtR(l.valor)}</td>
                  <td className="lancamentos-list__td">
                    <span className="lancamentos-list__badge-status" style={{
                      color: STATUS_COLOR[l.status] ?? varColor(C.muted),
                      background: alfa(STATUS_COLOR[l.status] ?? varColor(C.muted), "22"),
                    }}>
                      {STATUS_LABEL[l.status] ?? l.status}
                    </span>
                  </td>
                  <td className="lancamentos-list__td">
                    {l.status === "previsto" && (
                      <button
                        onClick={() => onBaixar(l.id)}
                        className="lancamentos-list__btn-baixar"
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
