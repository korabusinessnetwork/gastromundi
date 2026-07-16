import KoraMonograma from "./KoraMonograma";
import "./ApexNav.css";

/**
 * Nav do site institucional (sticky, branca). Monograma + wordmark à
 * esquerda; links âncora para as seções de prova/oferta à direita,
 * terminando no CTA "Ver o KORA rodando". "Entrar" é uma adição nossa
 * ao handoff: quem cai aqui já sendo cliente (ou por engano) precisa
 * de uma saída óbvia para o login, sem competir visualmente com o CTA
 * de conversão — por isso 14px, cor névoa, sem peso de botão.
 */
export default function ApexNav({ contatoUrl }) {
  return (
    <nav className="apex-nav" aria-label="Navegação principal">
      <div className="apex-nav__container">
        <a href="#" className="apex-nav__marca">
          <KoraMonograma className="apex-nav__monograma" />
          <span className="apex-nav__wordmark">KORA</span>
        </a>
        <div className="apex-nav__links">
          <a href="#inimigo" className="apex-nav__link">Por que o KORA</a>
          <a href="#funcionalidades" className="apex-nav__link">Funcionalidades</a>
          <a href="#planos" className="apex-nav__link">Planos</a>
          <a href="#faq" className="apex-nav__link">Dúvidas</a>
          <a href="/login" className="apex-nav__entrar">Entrar</a>
          <a href={contatoUrl || "#demo"} className="apex-botao apex-botao--primario apex-nav__cta">
            Ver o KORA rodando
          </a>
        </div>
      </div>
    </nav>
  );
}
