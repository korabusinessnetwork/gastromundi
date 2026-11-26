import { PRESETS_PERIODO, detectarPreset } from "@/lib/periodos";
import { LuCalendar } from "react-icons/lu";
import "./PeriodoSelector.css";

/**
 * Seletor de período do Financeiro. Substitui o antigo <input type="month">
 * (que só deixava escolher um mês inteiro) por:
 *  - atalhos de um toque (Este mês, Mês passado, 7/30 dias, Este ano) — o
 *    recorte que o usuário quer em quase todos os casos;
 *  - um intervalo livre De/Até para quando ele precisa de datas específicas
 *    ("de que data até qual outra data", pedido do dono).
 *
 * Intuitividade (princípio nº 1): o atalho ativo fica destacado, então em um
 * relance o usuário sabe qual período está vendo. Prevenção de erro: escolher
 * um "De" depois do "Até" (ou vice-versa) arrasta a outra ponta junto, o que
 * torna impossível montar um intervalo invertido.
 */
export default function PeriodoSelector({ periodo, onChange }) {
  const hoje = new Date();
  const presetAtivo = detectarPreset(periodo, hoje);

  const aplicarPreset = (preset) => onChange(preset.intervalo(hoje));

  const mudarData = (campo, valor) => {
    if (!valor) return;
    const novo = { ...periodo, [campo]: valor };
    if (campo === "de"  && valor > periodo.ate) novo.ate = valor;
    if (campo === "ate" && valor < periodo.de)  novo.de  = valor;
    onChange(novo);
  };

  return (
    <div className="periodo-selector" role="group" aria-label="Período">
      <div className="periodo-selector__presets">
        {PRESETS_PERIODO.map((p) => (
          <button
            key={p.chave}
            type="button"
            className={`periodo-selector__chip${presetAtivo === p.chave ? " periodo-selector__chip--ativo" : ""}`}
            aria-pressed={presetAtivo === p.chave}
            onClick={() => aplicarPreset(p)}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      <div className="periodo-selector__intervalo">
        <LuCalendar className="periodo-selector__icone" size={16} aria-hidden="true" />
        <label className="periodo-selector__campo">
          <span className="periodo-selector__campo-label">De</span>
          <input
            type="date"
            className="periodo-selector__data"
            aria-label="Data inicial do período"
            value={periodo.de}
            max={periodo.ate}
            onChange={(e) => mudarData("de", e.target.value)}
          />
        </label>
        <span className="periodo-selector__tra" aria-hidden="true">até</span>
        <label className="periodo-selector__campo">
          <span className="periodo-selector__campo-label">Até</span>
          <input
            type="date"
            className="periodo-selector__data"
            aria-label="Data final do período"
            value={periodo.ate}
            min={periodo.de}
            onChange={(e) => mudarData("ate", e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
