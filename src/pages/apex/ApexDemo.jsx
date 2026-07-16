import "./ApexDemo.css";
import KoraMonograma from "./KoraMonograma";

/**
 * Seção "#demo" — CTA final da página: fundo escuro igual ao hero pra
 * fechar o funil no mesmo tom visual. Se não houver fluxo de contato
 * configurado (VITE_CONTATO_URL vazio), o CTA vira um convite pra abrir
 * o protótipo navegável ("Ver o KORA rodando" → /demo) em vez de mandar
 * o visitante pro login real (beco sem saída pra quem ainda não é cliente).
 */
export default function ApexDemo({ contatoUrl }) {
  return (
    <section id="demo" className="apex-demo">
      <div className="apex-container apex-demo__conteudo">
        <KoraMonograma className="apex-demo__monograma" haste="#B8B0F0" />
        <h2 className="apex-demo__titulo">
          Veja o KORA rodando com o cardápio do SEU negócio
        </h2>
        <p className="apex-demo__paragrafo">
          Demonstração ao vivo de 30 minutos, sem compromisso. Como cada
          ativação inclui personalização, abrimos poucas vagas de
          implantação por mês — garanta a sua.
        </p>

        {contatoUrl ? (
          <a href={contatoUrl} className="apex-botao apex-botao--verde apex-demo__cta">
            Agendar minha demonstração
          </a>
        ) : (
          <a href="/demo" className="apex-botao apex-botao--branco apex-demo__cta">
            Ver o KORA rodando
          </a>
        )}

        <span className="apex-demo__microcopy">
          Sem fidelidade · 30 dias de garantia · Vendendo no mesmo dia
        </span>
      </div>
    </section>
  );
}
