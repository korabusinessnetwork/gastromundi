import { useState, useEffect } from "react";
import { useConfig } from "@/context/AppContext";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LIMITE_SANGRIA_PADRAO } from "@/lib/caixaMovimentos";

export default function GeralTab({ sz }) {
  const { taxaServico, setTaxaServico, diasAlertaValidade, setDiasAlertaValidade, limiteSangria, setLimiteSangria } = useConfig();
  const [saving, setSaving] = useState(false);
  const [dias, setDias] = useState(String(diasAlertaValidade ?? 7));
  const [savingDias, setSavingDias] = useState(false);
  // F005 — o valor é por estabelecimento (decisão 017), nunca cravado na tela.
  const [limite, setLimite] = useState(String(limiteSangria ?? LIMITE_SANGRIA_PADRAO));
  const [savingLimite, setSavingLimite] = useState(false);

  useEffect(() => { setDias(String(diasAlertaValidade ?? 7)); }, [diasAlertaValidade]);
  useEffect(() => { setLimite(String(limiteSangria ?? LIMITE_SANGRIA_PADRAO)); }, [limiteSangria]);

  const handleToggle = async () => {
    setSaving(true);
    await setTaxaServico(!taxaServico);
    setSaving(false);
  };

  const handleSalvarDias = async () => {
    setSavingDias(true);
    await setDiasAlertaValidade(dias);
    setSavingDias(false);
  };

  const handleSalvarLimite = async () => {
    setSavingLimite(true);
    await setLimiteSangria(limite);
    setSavingLimite(false);
  };

  const diasNum = Number(dias);
  const diasValido = Number.isFinite(diasNum) && diasNum >= 1 && diasNum <= 365;
  const diasAlterado = String(diasAlertaValidade ?? 7) !== String(dias).trim();

  const limiteNum = Number(limite);
  const limiteValido = Number.isFinite(limiteNum) && limiteNum > 0;
  const limiteAlterado = String(limiteSangria ?? LIMITE_SANGRIA_PADRAO) !== String(limite).trim();
  const podeSalvarLimite = limiteValido && limiteAlterado && !savingLimite;

  return (
    <div className="geral-tab">
      <div className="geral-tab__card" style={{ padding: sz.pad, gap: sz.pad }}>
        <div style={{ flex: 1 }}>
          <div className="geral-tab__titulo">Taxa de Serviço</div>
          <div className="geral-tab__ajuda">
            Cobra automaticamente 10% de taxa de serviço no fechamento
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          className="geral-tab__toggle"
          style={{
            background: taxaServico ? varColor(C.green) : varColor(C.faint),
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          <span className="geral-tab__toggle-bolinha" style={{ left: taxaServico ? 29 : 3 }} />
        </button>
      </div>

      {/* C1 — janela de alerta de validade */}
      <div className="geral-tab__card" style={{ padding: sz.pad, gap: sz.pad }}>
        <div style={{ flex: 1 }}>
          <div className="geral-tab__titulo">Alerta de Validade</div>
          <div className="geral-tab__ajuda">
            Avisa no PDV quando um produto está a até esta quantidade de dias de vencer
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="number"
            min="1"
            max="365"
            value={dias}
            onChange={e => setDias(e.target.value)}
            className="geral-tab__input-dias"
            style={{
              width: 72, padding: "9px 12px", borderRadius: 10,
              border: `1.5px solid ${diasValido ? "var(--gm-input-border)" : varColor(C.red)}`,
              background: "var(--gm-input-bg)", color: varColor(C.text),
              fontFamily: "inherit", outline: "none", textAlign: "center",
            }}
          />
          <span className="geral-tab__label-dias" style={{ color: varColor(C.muted) }}>dias</span>
          <button
            onClick={handleSalvarDias}
            disabled={savingDias || !diasValido || !diasAlterado}
            className="geral-tab__btn-salvar-dias"
            style={{
              padding: "9px 16px", borderRadius: 10, border: "none",
              background: (diasValido && diasAlterado && !savingDias) ? varColor(C.accent) : varColor(C.faint),
              color: (diasValido && diasAlterado && !savingDias) ? "#fff" : varColor(C.muted),
              cursor: (diasValido && diasAlterado && !savingDias) ? "pointer" : "not-allowed",
              fontWeight: 700, fontFamily: "inherit",
            }}
          >
            {savingDias ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {/* F005 — limite de retirada sem autorização de gerente */}
      <div className="geral-tab__card" style={{ padding: sz.pad, gap: sz.pad }}>
        <div style={{ flex: 1 }}>
          <div className="geral-tab__titulo">Retirada sem autorização</div>
          <div className="geral-tab__ajuda">
            Acima deste valor, tirar dinheiro do caixa exige a senha de um gerente
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="geral-tab__label-dias" style={{ color: varColor(C.muted) }}>R$</span>
          <input
            type="number"
            min="1"
            step="0.01"
            value={limite}
            onChange={e => setLimite(e.target.value)}
            aria-label="Limite de retirada sem autorização"
            className="geral-tab__input-limite"
            style={{
              width: 96, padding: "9px 12px", borderRadius: 10,
              border: `1.5px solid ${limiteValido ? "var(--gm-input-border)" : varColor(C.red)}`,
              background: "var(--gm-input-bg)", color: varColor(C.text),
              fontFamily: "inherit", outline: "none", textAlign: "center",
            }}
          />
          <button
            onClick={handleSalvarLimite}
            disabled={!podeSalvarLimite}
            className="geral-tab__btn-salvar-dias"
            style={{
              padding: "9px 16px", borderRadius: 10, border: "none",
              background: podeSalvarLimite ? varColor(C.accent) : varColor(C.faint),
              color: podeSalvarLimite ? "#fff" : varColor(C.muted),
              cursor: podeSalvarLimite ? "pointer" : "not-allowed",
              fontWeight: 700, fontFamily: "inherit",
            }}
          >
            {savingLimite ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
