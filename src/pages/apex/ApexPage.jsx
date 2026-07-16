import "./ApexPage.css";

/**
 * Página institucional do apex kora.codes (ADR-007/ADR-009, decisão 017).
 *
 * Vitrine comercial da plataforma Kora — quem cai aqui é um visitante
 * (dono de restaurante/café) avaliando o sistema, não um cliente
 * logando. Cada estabelecimento continua acessando pelo seu próprio
 * endereço (subdomínio), que vai direto para a tela de login com a
 * marca dele — isso não muda. Esta página não depende de rotas nem de
 * contexto do app (sem React Router, sem Supabase): é estática, então
 * funciona sozinha mesmo servida fora da árvore de rotas autenticada.
 *
 * Por que é intuitiva (Princípio nº1 do CLAUDE.md): uma rolagem só,
 * de cima pra baixo, na ordem que um dono de restaurante pensa — "o
 * que é" (hero), "o que faz" (módulos), "fica com a minha cara"
 * (marca própria), "como eu falo com vocês" (contato). Uma única ação
 * primária repetida (Entrar), sempre visível e sempre o mesmo botão,
 * sem menu, sem jargão técnico, sem decisão a mais para o visitante
 * tomar.
 */

const CONTATO_URL = import.meta.env.VITE_CONTATO_URL || "";

const MODULOS = [
  { icone: "💳", titulo: "Frente de Caixa", descricao: "PDV rápido no balcão, feito para o ritmo do dia a dia." },
  { icone: "📱", titulo: "Palm", descricao: "Garçom lança o pedido pelo celular, direto da mesa." },
  { icone: "🍳", titulo: "Cozinha", descricao: "Pedido chega na tela da cozinha na hora, sem papel." },
  { icone: "📦", titulo: "Estoque", descricao: "Controle com alerta de quantidade mínima e validade." },
  { icone: "💰", titulo: "Financeiro", descricao: "Fluxo de caixa e fechamento do dia sem planilha." },
  { icone: "🧾", titulo: "Nota Fiscal", descricao: "NFC-e emitida direto na venda, sem sistema à parte." },
  { icone: "📊", titulo: "Relatórios", descricao: "O que vende, quando vende e quanto vende — em poucos toques." },
  { icone: "🤖", titulo: "Jarvas", descricao: "Assistente que avisa e sugere — nunca decide sozinho." },
];

export default function ApexPage() {
  const ano = new Date().getFullYear();

  return (
    <div className="apex">
      <header className="apex-hero">
        <div className="apex-hero__conteudo">
          <div className="apex-hero__wordmark">KORA</div>
          <h1 className="apex-hero__titulo">
            O sistema completo do seu restaurante ou café — do pedido ao caixa
          </h1>
          <p className="apex-hero__subtitulo">
            Frente de caixa, garçom, cozinha, estoque e financeiro em um só
            lugar, com a cara do seu negócio.
          </p>
          <div className="apex-hero__acoes">
            <a className="apex-botao apex-botao--primario" href="/login">Entrar</a>
          </div>
          <p className="apex-hero__aux">
            Já é cliente? Acesse pelo endereço do seu estabelecimento
            (<strong>seunome.kora.codes</strong>).
          </p>
        </div>
      </header>

      <main>
        <section className="apex-secao" aria-labelledby="apex-modulos-titulo">
          <h2 id="apex-modulos-titulo" className="apex-secao__titulo">Tudo que o seu estabelecimento precisa</h2>
          <p className="apex-secao__subtitulo">Cada módulo resolve uma parte da operação — juntos, cobrem o dia inteiro.</p>
          <div className="apex-modulos">
            {MODULOS.map((m) => (
              <div className="apex-modulo" key={m.titulo}>
                <span className="apex-modulo__icone" aria-hidden="true">{m.icone}</span>
                <h3 className="apex-modulo__titulo">{m.titulo}</h3>
                <p className="apex-modulo__descricao">{m.descricao}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="apex-secao apex-secao--marca" aria-labelledby="apex-marca-titulo">
          <div className="apex-marca">
            <h2 id="apex-marca-titulo" className="apex-secao__titulo">Sua marca na frente, sempre</h2>
            <p className="apex-secao__subtitulo apex-marca__texto">
              O sistema veste as cores, o nome e o endereço do seu
              estabelecimento. Seus clientes e sua equipe usam algo com a sua
              cara — a Kora fica por trás, cuidando da parte técnica.
            </p>
          </div>
        </section>

        <section className="apex-secao apex-secao--contato" aria-labelledby="apex-contato-titulo">
          <h2 id="apex-contato-titulo" className="apex-secao__titulo">Quer levar a Kora para o seu estabelecimento?</h2>
          <p className="apex-secao__subtitulo">Comece agora ou fale com a gente antes.</p>
          <div className="apex-hero__acoes apex-hero__acoes--contato">
            {CONTATO_URL ? (
              <a className="apex-botao apex-botao--secundario" href={CONTATO_URL} target="_blank" rel="noreferrer">
                Falar com a gente
              </a>
            ) : null}
            <a className="apex-botao apex-botao--primario" href="/login">Entrar</a>
          </div>
        </section>
      </main>

      <footer className="apex-rodape">
        <p>Kora · plataforma de gestão para restaurantes e cafés</p>
        <p className="apex-rodape__ano">© {ano}</p>
      </footer>
    </div>
  );
}
