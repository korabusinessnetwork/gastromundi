import { useState } from "react";
import KoraMonograma from "./KoraMonograma";
import "./ApexNav.css";

/**
 * Nav do site institucional (sticky, branca). Monograma + wordmark à
 * esquerda; links âncora para as seções de prova/oferta à direita,
 * terminando no CTA "Ver o KORA rodando". "Entrar" é uma adição nossa
 * ao handoff: quem cai aqui já sendo cliente (ou por engano) precisa
 * de uma saída óbvia para o login, sem competir visualmente com o CTA
 * de conversão — por isso 14px, cor névoa, sem peso de botão.
 *
 * Responsivo: em tablet (≤1023px) os links continuam visíveis, só o
 * espaçamento encolhe. Em mobile (<768px) não cabe link nenhum sem
 * virar sopa de letrinhas — os links somem e viram um botão hambúrguer
 * único e óbvio (alvo de toque 44×44px, aria-expanded/aria-label) que
 * abre um drawer com os mesmos links + Entrar + CTA, cada um com alvo
 * grande. O drawer fecha ao tocar num link (o visitante queria ir pra
 * seção, não admirar o menu) ou ao tocar fora dele.
 */
export default function ApexNav({ contatoUrl }) {
  const [menuAberto, setMenuAberto] = useState(false);

  const links = [
    { href: "#inimigo", texto: "Por que o KORA" },
    { href: "#funcionalidades", texto: "Funcionalidades" },
    { href: "#planos", texto: "Planos" },
    { href: "#faq", texto: "Dúvidas" },
  ];

  function fecharMenu() {
    setMenuAberto(false);
  }

  return (
    <nav className="apex-nav" aria-label="Navegação principal">
      <div className="apex-nav__container">
        <a href="#" className="apex-nav__marca">
          <KoraMonograma className="apex-nav__monograma" />
          <span className="apex-nav__wordmark">KORA</span>
        </a>

        <div className="apex-nav__links">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="apex-nav__link">
              {link.texto}
            </a>
          ))}
          <a href="/login" className="apex-nav__entrar">Entrar</a>
          <a href={contatoUrl || "#demo"} className="apex-botao apex-botao--primario apex-nav__cta">
            Ver o KORA rodando
          </a>
        </div>

        <button
          type="button"
          className="apex-nav__hamburguer"
          aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuAberto}
          aria-controls="apex-nav-drawer"
          onClick={() => setMenuAberto((aberto) => !aberto)}
        >
          <span className="apex-nav__hamburguer-linha" />
          <span className="apex-nav__hamburguer-linha" />
          <span className="apex-nav__hamburguer-linha apex-nav__hamburguer-linha--curta" />
        </button>
      </div>

      {menuAberto && (
        <div
          className="apex-nav__backdrop"
          onClick={fecharMenu}
          aria-hidden="true"
        />
      )}

      <div
        id="apex-nav-drawer"
        className={
          menuAberto ? "apex-nav__drawer apex-nav__drawer--aberto" : "apex-nav__drawer"
        }
      >
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="apex-nav__drawer-link"
            onClick={fecharMenu}
          >
            {link.texto}
          </a>
        ))}
        <a href="/login" className="apex-nav__drawer-link" onClick={fecharMenu}>
          Entrar
        </a>
        <a
          href={contatoUrl || "#demo"}
          className="apex-botao apex-botao--primario apex-nav__drawer-cta"
          onClick={fecharMenu}
        >
          Ver o KORA rodando
        </a>
      </div>
    </nav>
  );
}
