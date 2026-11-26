import { useState, useEffect } from "react";
import { useConfig } from "@/context/AppContext";
import { LIMITE_SANGRIA_PADRAO } from "@/features/caixa/regras/caixaMovimentos";

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
    <div className="geral-tab" style={{ "--geral-pad": `${sz.pad}px` }}>
      <div className="geral-tab__card">
        <div className="geral-tab__texto">
          <div className="geral-tab__titulo">Taxa de Serviço</div>
          <div className="geral-tab__ajuda">
            Cobra automaticamente 10% de taxa de serviço no fechamento
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          className={`geral-tab__toggle${taxaServico ? " geral-tab__toggle--ligada" : ""}`}
        >
          <span className="geral-tab__toggle-bolinha" />
        </button>
      </div>

      {/* C1 — janela de alerta de validade */}
      <div className="geral-tab__card">
        <div className="geral-tab__texto">
          <div className="geral-tab__titulo">Alerta de Validade</div>
          <div className="geral-tab__ajuda">
            Avisa no PDV quando um produto está a até esta quantidade de dias de vencer
          </div>
        </div>
        <div className="geral-tab__linha">
          <input
            type="number"
            min="1"
            max="365"
            value={dias}
            onChange={e => setDias(e.target.value)}
            aria-invalid={diasValido ? undefined : true}
            className="geral-tab__input-dias geral-tab__campo"
          />
          <span className="geral-tab__label-dias">dias</span>
          <button
            onClick={handleSalvarDias}
            disabled={savingDias || !diasValido || !diasAlterado}
            className="geral-tab__btn-salvar-dias"
          >
            {savingDias ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {/* F005 — limite de retirada sem autorização de gerente */}
      <div className="geral-tab__card">
        <div className="geral-tab__texto">
          <div className="geral-tab__titulo">Retirada sem autorização</div>
          <div className="geral-tab__ajuda">
            Acima deste valor, tirar dinheiro do caixa exige a senha de um gerente
          </div>
        </div>
        <div className="geral-tab__linha">
          <span className="geral-tab__label-dias">R$</span>
          <input
            type="number"
            min="1"
            step="0.01"
            value={limite}
            onChange={e => setLimite(e.target.value)}
            aria-label="Limite de retirada sem autorização"
            aria-invalid={limiteValido ? undefined : true}
            className="geral-tab__input-limite geral-tab__campo"
          />
          <button
            onClick={handleSalvarLimite}
            disabled={!podeSalvarLimite}
            className="geral-tab__btn-salvar-dias"
          >
            {savingLimite ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
