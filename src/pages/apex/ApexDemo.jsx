import "./ApexDemo.css";
import KoraMonograma from "./KoraMonograma";

/**
 * Seção "#demo" — CTA final da página: fundo escuro igual ao hero pra
 * fechar o funil no mesmo tom visual.
 *
 * O botão abre o formulário (ApexPage) — que grava o contato mesmo
 * fora do horário comercial. Antes, sem VITE_CONTATO_URL configurado
 * (o caso em produção), o fechamento da página mandava o visitante
 * para o protótipo: a última seção do funil não pedia contato.
 *
 * O WhatsApp direto continua aqui como segunda saída, para quem quer
 * falar agora — e só aparece quando existe número comercial
 * configurado, em vez de virar link quebrado.
 */
export default function ApexDemo({ contatoUrl, onAgendar }) {
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

        <button
          type="button"
          className="apex-botao apex-botao--verde apex-demo__cta"
          onClick={onAgendar}
        >
          Agendar minha demonstração
        </button>

        {contatoUrl && (
          <a
            href={contatoUrl}
            className="apex-demo__whatsapp"
            target="_blank"
            rel="noopener noreferrer"
          >
            Prefere falar agora? Chame no WhatsApp
          </a>
        )}

        <span className="apex-demo__microcopy">
          Sem fidelidade · 30 dias de garantia · Vendendo no mesmo dia
        </span>
      </div>
    </section>
  );
}
