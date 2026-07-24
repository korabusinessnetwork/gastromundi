import { formatarDocumento } from "@/lib/documento";
import "./CampoDocumento.css";

/**
 * Campo CPF/CNPJ reutilizável (cadastro/edição de cliente e "CPF na nota" do
 * PDV): rótulo + toggle de tipo (recolore por tenant via --gm-accent) + input
 * com máscara progressiva. O documento é sempre opcional; o aviso de inválido
 * só aparece quando `invalido` (preenchido e inconsistente com o tipo).
 *
 * Decisão 018: estilo em folha co-localizada (classes `campo-documento__*`),
 * sem acoplar a nenhuma tela — serve a qualquer estabelecimento (white-label,
 * decisão 017). Placeholders e marcação idênticos aos do cadastro para manter
 * a consistência total do design system entre as telas.
 */
export default function CampoDocumento({ tipo, valor, onTipo, onValor, invalido, label, autoFocus, onEnter }) {
  return (
    <div className="campo-documento">
      <div className="campo-documento__topo">
        <label className="campo-documento__label">
          {label ?? "CPF / CNPJ"} <span className="campo-documento__opcional">(opcional)</span>
        </label>
        <div className="campo-documento__toggle" role="group" aria-label="Tipo de documento">
          <button
            type="button"
            onClick={() => onTipo("cpf")}
            className={`campo-documento__opt${tipo === "cpf" ? " campo-documento__opt--ativo" : ""}`}
          >
            CPF
          </button>
          <button
            type="button"
            onClick={() => onTipo("cnpj")}
            className={`campo-documento__opt${tipo === "cnpj" ? " campo-documento__opt--ativo" : ""}`}
          >
            CNPJ
          </button>
        </div>
      </div>
      <input
        value={valor}
        onChange={(e) => onValor(formatarDocumento(e.target.value, tipo))}
        onKeyDown={onEnter ? (e) => { if (e.key === "Enter") onEnter(); } : undefined}
        placeholder={tipo === "cnpj" ? "00.000.000/0000-00" : "000.000.000-00"}
        inputMode="numeric"
        autoFocus={autoFocus}
        className="campo-documento__input"
        aria-invalid={invalido}
      />
      {invalido && (
        <div className="campo-documento__hint">
          {tipo === "cnpj" ? "CNPJ incompleto ou inválido." : "CPF incompleto ou inválido."}
        </div>
      )}
    </div>
  );
}
