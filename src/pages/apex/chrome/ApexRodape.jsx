import "./ApexRodape.css";
import KoraMonograma from "../KoraMonograma";

/**
 * Rodapé — fecha a página com a marca discreta (monograma acinzentado)
 * e o ano dinâmico no copyright, pra não precisar tocar no código todo
 * ano só pra atualizar a data.
 *
 * Rodapé é onde todo mundo procura documento legal — por isso Termos e
 * Privacidade moram aqui, e não escondidos numa página de "sobre".
 */
export default function ApexRodape() {
  const ano = new Date().getFullYear();

  return (
    <footer className="apex-rodape">
      <div className="apex-rodape__marca">
        <KoraMonograma className="apex-rodape__monograma" haste="#77768A" />
        <span className="apex-rodape__wordmark">KORA</span>
      </div>
      <nav className="apex-rodape__legal" aria-label="Documentos legais">
        <a href="/termos" className="apex-rodape__link">Termos de Uso</a>
        <a href="/privacidade" className="apex-rodape__link">Política de Privacidade</a>
      </nav>
      <span className="apex-rodape__copyright">
        © {ano} KORA Sistemas · O PDV que se adapta a você
      </span>
    </footer>
  );
}
