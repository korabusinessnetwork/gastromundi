import {
  LuArrowLeft
} from "react-icons/lu";

/** Cabeçalho comum aos três passos (fica fora do componente para não
 *  remontar a cada render). */
export default function Cabecalho({ titulo, subtitulo, onSair }) {
  return (
    <header className="mod-header">
      <div className="mod-header__textos">
        <h1 className="mod-header__titulo">{titulo}</h1>
        <p className="mod-header__subtitulo">{subtitulo}</p>
      </div>
      <button
        type="button"
        className="mod-header__voltar"
        onClick={onSair}
        aria-label="Voltar"
      >
        <LuArrowLeft aria-hidden="true" />
      </button>
    </header>
  );
}
