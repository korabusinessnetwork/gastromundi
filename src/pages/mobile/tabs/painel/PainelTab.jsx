import { LuChartBar, LuLightbulb, LuPlus } from "react-icons/lu";
import { fmtDinheiro, fmtComanda } from "@/pages/mobile/fmt";
import "./PainelTab.css";

/**
 * Painel — painel pessoal do garçom dentro do caixa aberto.
 *
 * Puramente apresentacional: recebe os totais já calculados pela shell
 * (nenhuma leitura de contexto/Supabase aqui) e devolve cliques via
 * `oportunidade.onClick`. Fiel à tela 1f do redesign mobile.
 */
export default function PainelTab({ meu, ticketMedio, oportunidades }) {
  const lista = oportunidades ?? [];

  return (
    <div className="painelTab">
      <header className="painelTab__header">
        <LuChartBar className="painelTab__headerIcone" aria-hidden="true" />
        <h1 className="painelTab__titulo">Painel</h1>
      </header>

      <section className="painelTab__kpiCard" aria-label="Meus lançamentos no caixa">
        <p className="painelTab__kpiLabel">Meus lançamentos no caixa</p>
        <p className="painelTab__kpiValor">{fmtDinheiro(meu?.total)}</p>

        <div className="painelTab__kpiSecundarios">
          <div className="painelTab__kpiItem">
            <span className="painelTab__kpiItemValor">{meu?.comandas ?? 0}</span>
            <span className="painelTab__kpiItemLabel">comandas</span>
          </div>
          <div className="painelTab__kpiItem">
            <span className="painelTab__kpiItemValor">{meu?.itens ?? 0}</span>
            <span className="painelTab__kpiItemLabel">itens</span>
          </div>
          <div className="painelTab__kpiItem">
            <span className="painelTab__kpiItemValor">{fmtDinheiro(ticketMedio)}</span>
            <span className="painelTab__kpiItemLabel">ticket médio</span>
          </div>
        </div>
      </section>

      <section className="painelTab__radar" aria-label="Radar de oportunidades">
        <div className="painelTab__radarTitulo">
          <LuLightbulb className="painelTab__radarIcone" aria-hidden="true" />
          <h2 className="painelTab__radarTexto">Radar de oportunidades</h2>
        </div>

        {lista.length === 0 ? (
          <div className="painelTab__radarVazio">Nenhuma oportunidade no radar agora.</div>
        ) : (
          <ul className="painelTab__lista">
            {lista.map((op) => (
              <li key={`${op.comandaId}-${op.regraId}`} className="painelTab__oportunidadeItem">
                <button
                  type="button"
                  className="painelTab__oportunidadeCard"
                  onClick={op.onClick}
                >
                  <div className="painelTab__oportunidadeTopo">
                    <span className="painelTab__oportunidadeComanda">{fmtComanda(op.comanda)}</span>
                    {op.mesa && (
                      <span className="painelTab__oportunidadeMesa">· Mesa {op.mesa}</span>
                    )}
                  </div>

                  <p className="painelTab__oportunidadeRotulo">{op.rotulo}</p>

                  <span className="painelTab__oportunidadeCta">
                    <LuPlus aria-hidden="true" /> Lançar nesta comanda
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
