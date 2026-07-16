import "./ApexFaq.css";

/**
 * Seção "#faq" — tira as 4 objeções mais comuns antes da oferta final,
 * na ordem em que elas surgem na cabeça de quem está decidindo:
 * equipamento → risco operacional (internet) → prazo → compromisso.
 */
const PERGUNTAS = [
  {
    pergunta: "Preciso de equipamento especial?",
    resposta:
      "Não. O KORA roda em qualquer computador, tablet ou celular com navegador. Impressora de cozinha e maquininha conectam direto.",
  },
  {
    pergunta: "E se a internet cair no meio do movimento?",
    resposta:
      "O caixa continua vendendo offline e sincroniza tudo quando a conexão volta. As notas ficam em contingência e são emitidas depois.",
  },
  {
    pergunta: '"Personalizado" não vai demorar mais pra implantar?',
    resposta:
      "Não — é o contrário. Como a gente configura as telas pro seu fluxo na ativação, sua equipe não precisa aprender o que não usa. É isso que faz dar pra vender no mesmo dia.",
  },
  {
    pergunta: "Tem fidelidade ou multa de cancelamento?",
    resposta:
      "Não. A assinatura é mensal e você cancela quando quiser, sem multa. E nos primeiros 30 dias, se não facilitar sua operação, devolvemos a mensalidade. Seus dados ficam disponíveis para exportar.",
  },
];

export default function ApexFaq() {
  return (
    <section id="faq" className="apex-faq">
      <div className="apex-container apex-faq__conteudo">
        <h2 className="apex-faq__titulo">Dúvidas frequentes</h2>
        <div className="apex-faq__grade">
          {PERGUNTAS.map((item) => (
            <div className="apex-faq__card" key={item.pergunta}>
              <span className="apex-faq__pergunta">{item.pergunta}</span>
              <span className="apex-faq__resposta">{item.resposta}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
