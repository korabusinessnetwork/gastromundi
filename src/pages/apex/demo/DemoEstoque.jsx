import "./DemoEstoque.css";
import { ESTOQUE_DEMO } from "./demoDados";

/**
 * Estoque da demo — tela de leitura: cards-resumo + lista de insumos
 * com status visual (OK / Repor). Mostra o valor da funcionalidade
 * (alerta antes de faltar) sem pedir nenhuma interação.
 */
export default function DemoEstoque() {
  const emAlerta = ESTOQUE_DEMO.filter((i) => i.quantidade < i.minimo);

  return (
    <div className="demo-estoque">
      <div className="demo-estoque__resumo">
        <div className="demo-estoque__card">
          <span className="demo-estoque__card-numero">{ESTOQUE_DEMO.length}</span>
          <span className="demo-estoque__card-rotulo">insumos cadastrados</span>
        </div>
        <div className="demo-estoque__card demo-estoque__card--alerta">
          <span className="demo-estoque__card-numero">{emAlerta.length}</span>
          <span className="demo-estoque__card-rotulo">abaixo do mínimo</span>
        </div>
        <div className="demo-estoque__card">
          <span className="demo-estoque__card-numero">hoje</span>
          <span className="demo-estoque__card-rotulo">última entrada</span>
        </div>
      </div>

      <ul className="demo-estoque__lista">
        <li className="demo-estoque__cabecalho" aria-hidden="true">
          <span>Insumo</span>
          <span className="demo-estoque__num">Em estoque</span>
          <span className="demo-estoque__num">Mínimo</span>
          <span>Status</span>
        </li>
        {ESTOQUE_DEMO.map((item) => {
          const repor = item.quantidade < item.minimo;
          return (
            <li
              key={item.id}
              className={
                "demo-estoque__linha" + (repor ? " demo-estoque__linha--alerta" : "")
              }
            >
              <span className="demo-estoque__nome">{item.produto}</span>
              <span className="demo-estoque__num">
                {item.quantidade.toLocaleString("pt-BR")} {item.unidade}
              </span>
              <span className="demo-estoque__num demo-estoque__num--minimo">
                {item.minimo.toLocaleString("pt-BR")} {item.unidade}
              </span>
              <span
                className={
                  "demo-estoque__status" +
                  (repor ? " demo-estoque__status--repor" : " demo-estoque__status--ok")
                }
              >
                {repor ? "Repor" : "OK"}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="demo-estoque__nota">
        No KORA de verdade, o estoque baixa sozinho a cada venda e o Jarvas te
        avisa antes de faltar.
      </p>
    </div>
  );
}
