import "./TelaDeErro.css";

// Fallback amigável quando o render React estoura (o que try/catch não pega).
// Intuitividade (princípio nº 1): mensagem humana em português, sem jargão,
// com a ação óbvia (recarregar). Nada de tela branca.
export default function TelaDeErro() {
  return (
    <div role="alert" className="tela-de-erro">
      <h1 className="tela-de-erro__titulo">Algo deu errado</h1>
      <p className="tela-de-erro__texto">
        Tivemos um problema ao abrir esta tela. Recarregue a página para continuar.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="tela-de-erro__botao"
      >
        Recarregar
      </button>
    </div>
  );
}
