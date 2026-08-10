import "./ApexProva.css";

/**
 * Barra de prova concreta — logo abaixo do hero, reforça em números e
 * fatos curtos o que o hero prometeu, antes do visitante rolar para
 * o resto da página. Sem props: conteúdo fixo (copy do handoff).
 */
export default function ApexProva() {
  return (
    <div className="apex-prova">
      {/* Os 3 primeiros itens são os "essenciais" do funil (mesmo dia,
          1 turno, personalizado) — por isso são os únicos que sobram
          no mobile. Em tablet cabe mais um (NFC-e); só "offline" some,
          conforme o artboard 834px do handoff. */}
      <span className="apex-prova__item apex-prova__item--essencial">
        <strong className="apex-prova__chave">Mesmo dia</strong> vendendo pelo sistema
      </span>
      <span className="apex-prova__item apex-prova__item--essencial">
        <strong className="apex-prova__chave">1 turno</strong> para a equipe dominar o caixa
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
