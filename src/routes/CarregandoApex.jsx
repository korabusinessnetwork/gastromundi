import "./CarregandoApex.css";

/**
 * Espera do site institucional e do protótipo. O bundle dos dois é lazy
 * (só quem entra no apex baixa aquele código), e o fallback era `null`:
 * em conexão lenta a tela ficava BRANCA, sem nada dizendo que algo estava
 * acontecendo. Tela branca parece site quebrado, e "estado sempre
 * visível" é o princípio nº 1 do projeto.
 *
 * Só aparece depois de 200ms, por atraso na animação em vez de timer em
 * JS: em conexão boa o chunk chega antes disso e ninguém vê nada piscar.
 */
export default function CarregandoApex() {
  return (
    <div className="apex-carregando" role="status" aria-live="polite">
      <span className="apex-carregando__marca">KORA</span>
      <span className="apex-carregando__texto">Carregando…</span>
    </div>
  );
}
