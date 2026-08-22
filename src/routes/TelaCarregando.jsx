import "./TelaCarregando.css";

/**
 * O que aparece no meio-tempo entre clicar num item do menu e a tela
 * chegar. Existe porque as páginas do app passaram a ser baixadas
 * quando abertas (e não todas de uma vez, no primeiro acesso): sem
 * isto, quem clicasse em "Relatórios" veria a área de conteúdo em
 * branco por um instante e não saberia se clicou.
 *
 * Princípio nº1: estado sempre visível. Texto humano, sem jargão de
 * carregamento de módulo, e `role="status"` para quem usa leitor de
 * tela ouvir o mesmo aviso.
 */
export default function TelaCarregando({ children = "Carregando…" }) {
  return (
    <div className="tela-carregando" role="status" aria-live="polite">
      <span className="tela-carregando__ponto" aria-hidden="true" />
      <span className="tela-carregando__texto">{children}</span>
    </div>
  );
}
