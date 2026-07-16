import "./ApexComoFunciona.css";

/**
 * "Como funciona" — 3 passos que constroem confiança antes da oferta
 * de planos. Numeração grande e cor progressiva (roxo → azul → verde)
 * reforça a ideia de caminho/sequência sem precisar de setas ou texto
 * extra explicando a ordem.
 */
const PASSOS = [
  {
    numero: "1",
    cor: "roxo",
    titulo: "Demonstração com o SEU cardápio",
    texto:
      "30 minutos ao vivo. A gente já monta seus produtos e simula um dia de movimento do seu negócio — não um demo genérico.",
  },
  {
    numero: "2",
    cor: "azul",
    titulo: "Personalização e ativação no mesmo dia",
    texto:
      "Fechou? A gente ajusta telas, atalhos e impressões pro seu fluxo, conecta maquininha e certificado fiscal. Pronto pra vender.",
  },
  {
    numero: "3",
    cor: "verde",
    titulo: "30 dias pra provar que vale",
    texto:
      "Acompanhamos sua primeira semana de perto. Se em 30 dias o KORA não facilitou sua operação, devolvemos a mensalidade.",
  },
];

export default function ApexComoFunciona() {
  return (
    <section className="apex-passos">
      <div className="apex-container apex-passos__container">
        <div className="apex-passos__intro">
          <span className="apex-kicker">Como funciona</span>
          <h2 className="apex-passos__titulo">
            Da demonstração à primeira venda em 3 passos
          </h2>
        </div>

        <div className="apex-passos__grid">
          {PASSOS.map((passo) => (
            <div className="apex-passos__card" key={passo.numero}>
              <span
                className={`apex-passos__numero apex-passos__numero--${passo.cor}`}
              >
                {passo.numero}
              </span>
              <span className="apex-passos__cardTitulo">{passo.titulo}</span>
              <span className="apex-passos__cardTexto">{passo.texto}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
