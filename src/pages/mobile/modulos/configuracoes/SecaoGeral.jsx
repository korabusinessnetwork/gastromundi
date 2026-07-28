import { useEffect, useState } from "react";
import { LuCircleCheck } from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import "./SecaoGeral.css";

/**
 * SecaoGeral — ajustes gerais do estabelecimento no Palm.
 *
 * Espelha a aba "Geral" das Configurações do desktop (GeralTab em
 * ConfiguracoesView.jsx): taxa de serviço e janela do alerta de validade.
 * Mesma fonte de verdade — as duas configurações vivem no AppContext, que já
 * persiste e propaga para o PDV. Aqui só existe apresentação.
 *
 * Corpo puro: o cabeçalho (título + voltar) é do hub.
 */

const DIAS_MIN = 1;
const DIAS_MAX = 365;

export default function SecaoGeral() {
  const { taxaServico, setTaxaServico, diasAlertaValidade, setDiasAlertaValidade } = useApp();

  const [salvandoTaxa, setSalvandoTaxa] = useState(false);
  const [dias, setDias] = useState(String(diasAlertaValidade ?? 7));
  const [salvandoDias, setSalvandoDias] = useState(false);
  const [salvo, setSalvo] = useState(false);

  // O valor pode mudar por outro dispositivo: o rascunho segue o contexto.
  useEffect(() => {
    setDias(String(diasAlertaValidade ?? 7));
  }, [diasAlertaValidade]);

  const alternarTaxa = async () => {
    if (salvandoTaxa) return;
    setSalvandoTaxa(true);
    await setTaxaServico(!taxaServico);
    setSalvandoTaxa(false);
  };

  const diasNum = Number(dias);
  const diasValido = Number.isFinite(diasNum) && diasNum >= DIAS_MIN && diasNum <= DIAS_MAX;
  const diasAlterado = String(diasAlertaValidade ?? 7) !== String(dias).trim();
  // Prevenção > mensagem de erro: Salvar só acende quando há o que salvar e o
  // número faz sentido. O usuário nunca toca em algo que vai falhar.
  const podeSalvarDias = diasValido && diasAlterado && !salvandoDias;

  const salvarDias = async () => {
    if (!podeSalvarDias) return;
    setSalvandoDias(true);
    await setDiasAlertaValidade(dias);
    setSalvandoDias(false);
    setSalvo(true);
  };

  return (
    <div className="mod-lista">
      <div className="cfg-card">
        <div className="cfg-card__textos">
          <div className="cfg-card__titulo">Taxa de serviço</div>
          <div className="cfg-card__ajuda">
            Cobra automaticamente 10% de taxa de serviço no fechamento da comanda.
          </div>
        </div>
        <button
          type="button"
          onClick={alternarTaxa}
          disabled={salvandoTaxa}
          className={`cfg-toggle${taxaServico ? " cfg-toggle--on" : ""}`}
          aria-pressed={taxaServico}
          aria-label="Cobrar taxa de serviço"
        >
          <span className="cfg-toggle__bolinha" />
        </button>
      </div>

      <div className="cfg-card cfg-card--coluna">
        <div className="cfg-card__titulo">Alerta de validade</div>
        <div className="cfg-card__ajuda">
          Avisa no PDV quando um produto está a até esta quantidade de dias de vencer.
        </div>

        <div className="cfg-geral__linhaDias">
          <input
            type="number"
            inputMode="numeric"
            min={DIAS_MIN}
            max={DIAS_MAX}
            value={dias}
            onChange={(e) => {
              setDias(e.target.value);
              setSalvo(false);
            }}
            className={`cfg-input cfg-geral__dias${diasValido ? "" : " cfg-input--invalido"}`}
            aria-label="Dias de antecedência do alerta de validade"
          />
          <span className="cfg-geral__unidade">dias antes</span>
          <button
            type="button"
            onClick={salvarDias}
            disabled={!podeSalvarDias}
            className="mod-botao mod-botao--primario"
          >
            {salvandoDias ? "Salvando…" : "Salvar"}
          </button>
        </div>

        {diasValido ? null : (
          <div className="cfg-card__ajuda">
            Escolha um número entre {DIAS_MIN} e {DIAS_MAX}.
          </div>
        )}
      </div>

      {salvo && !diasAlterado ? (
        <div className="cfg-ok">
          <LuCircleCheck aria-hidden="true" />
          <span>Alerta de validade salvo.</span>
        </div>
      ) : null}
    </div>
  );
}
