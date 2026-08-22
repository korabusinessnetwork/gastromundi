import "./ApexProva.css";

/**
 * Barra logo abaixo do hero. O trabalho dela é o mais difícil da
 * página: fazer alguém que nunca ouviu falar da KORA acreditar em
 * algo. Por isso ela só pode dizer coisa VERIFICÁVEL.
 *
 * Antes eram promessas de resultado ("mesmo dia vendendo", "1 turno
 * para a equipe dominar o caixa"). São verdadeiras na nossa
 * experiência, mas o visitante não tem como conferir nenhuma delas —
 * e promessa que não se confere não constrói confiança, gasta. Agora
 * o primeiro item não afirma nada: entrega o produto. Os outros são
 * fatos sobre o que a KORA faz e sobre como a gente cobra, cada um
 * checável na própria página ou no protótipo.
 *
 * Sem props: conteúdo fixo (copy do handoff).
 */
export default function ApexProva() {
  return (
    <div className="apex-prova">
      {/* Os 3 "essenciais" são os únicos que sobram no mobile — na tela
          pequena, menos itens = mais fácil de escanear em 1 segundo de
          rolagem. Em tablet cabe mais um (NFC-e); só "offline" some,
          conforme o artboard 834px do handoff. */}
      <a
        href="/demo"
        className="apex-prova__item apex-prova__item--essencial apex-prova__item--link"
      >
        <strong className="apex-prova__chave">Protótipo aberto</strong> — teste sem cadastro
      </a>
      <span className="apex-prova__item apex-prova__item--essencial">
        <strong className="apex-prova__chave">Sem fidelidade</strong> — mensal, cancela quando quiser
      </span>
      <span className="apex-prova__item">
        <strong className="apex-prova__chave">NFC-e</strong> em um toque, com contingência
      </span>
      <span className="apex-prova__item apex-prova__item--tablet-oculto">
        Funciona <strong className="apex-prova__chave">offline</strong> — o movimento não para
      </span>
      <span className="apex-prova__item apex-prova__item--essencial">
        <strong className="apex-prova__chave">Personalizado</strong> — o sistema com a sua cara
      </span>
    </div>
  );
}
