import "./ApexInimigo.css";

/**
 * Seção "#inimigo" — o comparativo que cria a tensão antes da oferta.
 * Grid 2 colunas (esquerda: kicker + H2 + parágrafo; direita: 4 cards
 * comparativos PDV genérico vs KORA). Intuitivo por contraste de cor:
 * vermelho (erro, familiar) de um lado, verde (sucesso) do outro — o
 * usuário entende o "antes/depois" sem precisar ler tudo.
 */
const COMPARATIVOS = [
  {
    genericoTexto: "Semanas de implantação e treinamento",
    koraTexto: "Vendendo no mesmo dia da demonstração",
  },
  {
    genericoTexto: "Você se adapta às telas do sistema",
    koraTexto: "Telas e fluxos com a cara da sua operação",
  },
  {
    genericoTexto: "Fidelidade de 12 meses e multa pra sair",
    koraTexto: "Mensal, sem multa — a gente se garante pela entrega",
  },
  {
    genericoTexto: 'Fiscal como "módulo extra" que dá dor de cabeça',
    koraTexto: "NFC-e nativa, feita pra realidade fiscal brasileira",
  },
];

export default function ApexInimigo() {
  return (
    <section id="inimigo" className="apex-inimigo">
      <div className="apex-container apex-inimigo__grid">
        <div className="apex-inimigo__intro">
          <span className="apex-kicker apex-kicker--vermelho">
            O problema que ninguém admite
          </span>
          <h2 className="apex-inimigo__titulo">
            O PDV genérico foi feito pra caber em qualquer negócio. Por isso
            não cabe no seu.
          </h2>
          <p className="apex-inimigo__paragrafo">
            Telas cheias de botão que ninguém usa, implantação que leva
            semanas, suporte que abre chamado e some — e no fim quem se
            adapta ao sistema é você. O KORA nasceu do outro lado: a gente
            molda as telas, os atalhos e os fluxos à SUA operação, e você
            começa a vender no mesmo dia.
          </p>
        </div>
        <div className="apex-inimigo__cards">
          {COMPARATIVOS.map((item) => (
            <div className="apex-inimigo__card" key={item.genericoTexto}>
              <div className="apex-inimigo__coluna">
                <span className="apex-inimigo__rotulo apex-inimigo__rotulo--generico">
                  PDV genérico
                </span>
                <span className="apex-inimigo__texto apex-inimigo__texto--generico">
                  {item.genericoTexto}
                </span>
              </div>
              <div className="apex-inimigo__coluna">
                <span className="apex-inimigo__rotulo apex-inimigo__rotulo--kora">
                  KORA
                </span>
                <span className="apex-inimigo__texto apex-inimigo__texto--kora">
                  {item.koraTexto}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
