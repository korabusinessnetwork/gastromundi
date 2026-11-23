import {
  LuCheck
} from "react-icons/lu";

export default function Stepper({ step }) {
  const steps = ["Upload", "Cabeçalho", "Vínculos", "Confirmar"];
  return (
    <div className="nf-tab__stepper">
      {steps.map((label, i) => {
        const n = i + 1;
        const done   = n < step;
        const active = n === step;
        // O passo tem três estados e bola, rótulo e linha leem todos o mesmo:
        // o estado entra uma vez como modificador no item e o CSS pinta por
        // descendência, em vez de cada descendente receber a cor calculada.
        const estado = done ? "feito" : active ? "ativo" : "futuro";
        return (
          <div key={n} className={`nf-tab__stepper-item nf-tab__stepper-item--${estado}`}>
            <div className="nf-tab__stepper-col">
              <div className="nf-tab__stepper-bola">
                {done ? <LuCheck size={14} /> : n}
              </div>
              <div className="nf-tab__stepper-label">
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="nf-tab__stepper-linha" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Linha de vínculo (Step 3) ─────────────────────────────────────
