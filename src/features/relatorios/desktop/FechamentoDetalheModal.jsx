import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { rotuloMetodo } from "@/utils/pagamentos";
import { esperadoEmCaixa, diferencaCaixa, situacaoCaixa, ROTULO_SITUACAO } from "@/features/caixa/regras/caixa";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import {
  LuBanknote, LuLock, LuX
} from "react-icons/lu";
import { fmtData, fmtR, METODOS_DETALHE } from "./apoio";

export default function FechamentoDetalheModal({ f, customLabels, onClose }) {
  const metodos = f.conferidoPorMetodo
    ? Object.keys(f.conferidoPorMetodo)
    : METODOS_DETALHE.map(m => m.id);
  // Conta única em @/lib/caixa: só entra no esperado o que tinha linha de
  // conferência. Recalcular `vendas + fundo` aqui fazia o mesmo fechamento
  // aparecer "Conferido" no caixa e "Falta" no relatório.
  const totalEsperado = esperadoEmCaixa(f);
  const diferenca     = diferencaCaixa(f);
  const situacao      = situacaoCaixa(diferenca);
  const corSituacao   = situacao === "falta" ? C.red : C.green;

  return createPortal(
    <div
      {...fecharAoClicarFora(onClose)}
      className="relatorio-view__modal-overlay"
    >
      <div className="relatorio-view__modal-caixa">

        {/* Header */}
        <div className="relatorio-view__modal-header">
          <div className="relatorio-view__modal-header-info">
            <div className="relatorio-view__modal-icone">
              <LuLock size={22} color={varColor(C.accent)} />
            </div>
            <div>
              <div className="relatorio-view__modal-titulo">Fechamento de Caixa</div>
              <div className="relatorio-view__modal-data">
                {fmtData(f.at)}
              </div>
              <div className="relatorio-view__modal-usuario">
                {f.user ?? "—"}{f.role ? ` · ${f.role}` : ""}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="relatorio-view__modal-x"
          >
            <LuX size={16} />
          </button>
        </div>

        {/* Tabela por método */}
        {f.conferidoPorMetodo && (
          <div className="relatorio-view__modal-tabela">
            <div className="relatorio-view__modal-th">
              <span>Método</span>
              <span className="relatorio-view__modal-th-valor">Conferido</span>
            </div>
            {metodos.map(id => {
              const cat = METODOS_DETALHE.find(m => m.id === id);
              const Icon = cat?.Icon ?? LuBanknote;
              const label = cat?.label ?? rotuloMetodo(id, customLabels);
              const val = f.conferidoPorMetodo[id] ?? 0;
              return (
                <div key={id} className="relatorio-view__modal-metodo-linha">
                  <div className="relatorio-view__modal-metodo-label">
                    <Icon size={15} color={varColor(C.muted)} />
                    {label}
                    {id === "dinheiro" && f.fundo > 0 && (
                      <span className="relatorio-view__modal-fundo-nota">
                        (inclui fundo {fmtR(f.fundo)})
                      </span>
                    )}
                  </div>
                  <div className="relatorio-view__modal-metodo-valor">
                    {fmtR(val)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Observação */}
        {f.observacao && (
          <div className="relatorio-view__modal-obs">
            <div className="relatorio-view__modal-obs-label">
              Observação
            </div>
            <div className="relatorio-view__modal-obs-texto">
              {f.observacao}
            </div>
          </div>
        )}

        {/* Resumo */}
        <div className="relatorio-view__modal-resumo">
          {[
            { label: "Total de Vendas (sistema)", value: fmtR(f.totalVendas) },
            { label: "Fundo de Caixa",            value: fmtR(f.fundo)       },
          ].map(r => (
            <div key={r.label} className="relatorio-view__modal-resumo-linha">
              <span className="relatorio-view__modal-resumo-label">{r.label}</span>
              <span className="relatorio-view__modal-resumo-valor">{r.value}</span>
            </div>
          ))}

          <div className="relatorio-view__modal-total-linha relatorio-view__modal-total-linha--separada">
            <span className="relatorio-view__modal-total-label">Total Esperado em Caixa</span>
            <span className="relatorio-view__modal-total-valor">{fmtR(totalEsperado)}</span>
          </div>
          <div className="relatorio-view__modal-total-linha">
            <span className="relatorio-view__modal-total-label relatorio-view__modal-total-label--forte">Total Conferido</span>
            <span className="relatorio-view__modal-total-valor relatorio-view__modal-total-valor--conferido">{fmtR(f.totalConferido)}</span>
          </div>

          <div
            className="relatorio-view__modal-dif"
            style={{ "--cor-situacao": varColor(corSituacao) }}
          >
            <span className="relatorio-view__modal-dif-label">
              {ROTULO_SITUACAO[situacao]}
            </span>
            <span className="relatorio-view__modal-dif-valor">
              {situacao === "sobra" ? "+" : ""}{fmtR(diferenca)}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="relatorio-view__modal-fechar"
        >
          Fechar
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── View principal ────────────────────────────────────────────────
