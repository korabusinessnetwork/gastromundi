import "./DemoLogin.css";
import KoraMonograma from "../KoraMonograma";

/**
 * Tela de login da demo — réplica visual de src/pages/LoginPage.jsx (o
 * login real do produto), mas 100% estática: campos já preenchidos e
 * somente leitura, sem validação nenhuma. Qualquer interação (Enter,
 * clique) leva direto pra frente — a demo não pode travar ninguém numa
 * tela de credenciais que não existem (princípio nº 1 — intuitividade).
 *
 * Usa os tokens --gm-* do PRODUTO (tema.css), igual ao mock do hero
 * (ApexHero.jsx) — é a mesma vitrine visual, não uma peça à parte.
 */
export default function DemoLogin({ aoEntrar }) {
  const entrar = () => aoEntrar?.();

  const onKeyDown = (e) => {
    if (e.key === "Enter") entrar();
  };

  return (
    <div className="demo-login">
      <span className="demo-login__pill">Demonstração</span>

      <div className="demo-login__conteudo">
        <div className="demo-login__marca">
          <KoraMonograma className="demo-login__monograma" haste="var(--gm-accent)" />
          <div className="demo-login__wordmark">KORA</div>
          <div className="demo-login__subtitulo">Ambiente de demonstração · Acesso ao Sistema</div>
        </div>

        <div className="demo-login__card">
          <div className="demo-login__campo">
            <label className="demo-login__label" htmlFor="demo-login-usuario">Usuário</label>
            <input
              id="demo-login-usuario"
              type="text"
              value="demo"
              readOnly
              onKeyDown={onKeyDown}
              className="demo-login__input"
            />
          </div>

          <div className="demo-login__campo">
            <label className="demo-login__label" htmlFor="demo-login-senha">Senha</label>
            <input
              id="demo-login-senha"
              type="text"
              value="••••••••"
              readOnly
              onKeyDown={onKeyDown}
              className="demo-login__input"
            />
          </div>

          <button type="button" onClick={entrar} className="demo-login__botao">
            Entrar na demonstração
          </button>
        </div>

        <div className="demo-login__aviso">
          Isto é um protótipo com dados fictícios — nada aqui é salvo.
        </div>

        <a href="/" className="demo-login__voltar">← Voltar ao site</a>
      </div>
    </div>
  );
}
