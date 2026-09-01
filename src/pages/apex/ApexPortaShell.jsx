import KoraMonograma from "./KoraMonograma";
// As fundações do site (tokens --kora-*, fontes, `.apex-botao`, e o remapeamento
// de --gm-input-* que impede o campo de sair escuro por causa do baseline
// global do produto) moram no CSS da página institucional. Sem este import as
// portas herdariam só a marcação: campo preto, botão sem estilo, fonte serifada.
import "./ApexPage.css";
import "./ApexPorta.css";

/**
 * Casco das "portas" do site institucional — as telas de entrar
 * (`/entrar`) e de criar conta (`/criar-conta`).
 *
 * Por que existe: as duas são a mesma cena com conteúdo diferente —
 * marca da plataforma no topo, uma saída óbvia de volta ao site, e um
 * cartão único no centro com UMA tarefa. Repetir esse enquadramento em
 * dois arquivos faria as telas divergirem no primeiro ajuste.
 *
 * Identidade da PLATAFORMA (tokens --kora-*), nunca a de um cliente: é
 * o site da Kora que está falando, e quem chega aqui ainda não tem
 * estabelecimento resolvido (decisão 017).
 */
export default function ApexPortaShell({ titulo, subtitulo, children, rodape }) {
  return (
    <div className="apex apex-porta">
      <header className="apex-porta__topo">
        <a href="/" className="apex-porta__marca" aria-label="KORA, voltar ao site">
          <KoraMonograma className="apex-porta__monograma" />
          <span className="apex-porta__wordmark">KORA</span>
        </a>
        <a href="/" className="apex-porta__voltar">← Voltar ao site</a>
      </header>

      <main className="apex-porta__conteudo">
        <div className="apex-porta__cartao">
          <h1 className="apex-porta__titulo">{titulo}</h1>
          {subtitulo && <p className="apex-porta__subtitulo">{subtitulo}</p>}
          {children}
        </div>
        {rodape}
      </main>
    </div>
  );
}
