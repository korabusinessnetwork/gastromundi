import "./ApexProva.css";

/**
 * Barra de prova concreta — logo abaixo do hero, reforça em números e
 * fatos curtos o que o hero prometeu, antes do visitante rolar para
 * o resto da página. Sem props: conteúdo fixo (copy do handoff).
 */
export default function ApexProva() {
  return (
    <div className="apex-prova">
      <span><strong className="apex-prova__chave">Mesmo dia</strong> vendendo pelo sistema</span>
      <span><strong className="apex-prova__chave">1 turno</strong> para a equipe dominar o caixa</span>
      <span><strong className="apex-prova__chave">NFC-e</strong> em um toque, com contingência</span>
      <span>Funciona <strong className="apex-prova__chave">offline</strong> — o movimento não para</span>
      <span><strong className="apex-prova__chave">Personalizado</strong> — o sistema com a sua cara</span>
    </div>
  );
}
