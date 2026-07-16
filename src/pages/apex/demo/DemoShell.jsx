import "./DemoShell.css";
import KoraMonograma from "../KoraMonograma";
import { LuShoppingCart, LuPackage, LuUsers, LuChartColumn } from "react-icons/lu";

/**
 * Casco do app fictício da demo — imita o DesktopLayout real (sidebar
 * escura + conteúdo), mas sem rotas: a troca de tela é estado local do
 * DemoPage. O badge DEMO e o pill "dados fictícios" deixam óbvio, o
 * tempo todo, que nada aqui é real (intuitividade > imersão).
 */

const MENU = [
  { chave: "pdv",        rotulo: "Frente de Caixa", rotuloCurto: "Caixa",      Icone: LuShoppingCart },
  { chave: "estoque",    rotulo: "Estoque",         rotuloCurto: "Estoque",    Icone: LuPackage },
  { chave: "clientes",   rotulo: "Clientes",        rotuloCurto: "Clientes",   Icone: LuUsers },
  { chave: "relatorios", rotulo: "Relatórios",      rotuloCurto: "Relatórios", Icone: LuChartColumn },
];

export default function DemoShell({ telaAtiva, aoTrocarTela, children }) {
  const itemAtivo = MENU.find((m) => m.chave === telaAtiva) || MENU[0];

  return (
    <div className="demo-shell">
      <aside className="demo-shell__sidebar">
        <div className="demo-shell__marca">
          <KoraMonograma className="demo-shell__monograma" haste="#B8B0F0" />
          <span className="demo-shell__wordmark">KORA</span>
          <span className="demo-shell__badge">DEMO</span>
        </div>

        <nav className="demo-shell__menu" aria-label="Telas da demonstração">
          {MENU.map(({ chave, rotulo, rotuloCurto, Icone }) => (
            <button
              key={chave}
              type="button"
              className={
                "demo-shell__item" +
                (chave === telaAtiva ? " demo-shell__item--ativo" : "")
              }
              aria-current={chave === telaAtiva ? "page" : undefined}
              onClick={() => aoTrocarTela(chave)}
            >
              <Icone className="demo-shell__item-icone" aria-hidden="true" />
              <span className="demo-shell__item-rotulo">{rotulo}</span>
              <span className="demo-shell__item-rotulo-curto">{rotuloCurto}</span>
            </button>
          ))}
        </nav>

        <div className="demo-shell__rodape">
          <a href="/#planos" className="demo-shell__cta">Quero o KORA no meu negócio</a>
          <a href="/" className="demo-shell__sair">Sair da demo</a>
        </div>
      </aside>

      <div className="demo-shell__principal">
        <header className="demo-shell__topbar">
          <h1 className="demo-shell__titulo">{itemAtivo.rotulo}</h1>
          <span className="demo-shell__pill">dados fictícios</span>
        </header>
        <main className="demo-shell__conteudo">{children}</main>
      </div>
    </div>
  );
}
