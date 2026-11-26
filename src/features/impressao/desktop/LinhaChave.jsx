
// Responde a primeira pergunta de quem chega nesta tela ("por que não
// saiu papel quando lancei?"), então vem antes de "quais impressoras" e
// "o que sai em cada uma". Chave única: salva no próprio clique em vez
// de pedir um Salvar à parte — com um controle só na seção, um botão
// separado seria um passo a mais para dizer sim ou não. Se a gravação
// falhar, a chave VOLTA para onde estava: um interruptor que ficou
// ligado sem ter sido salvo é pior que nenhum.
// Uma linha = um interruptor com o texto que explica o que acontece nos
// dois estados. O texto muda com a chave de propósito: quem lê descobre o
// efeito sem precisar clicar para descobrir.
export default function LinhaChave({ titulo, descricao, ligado, onAlternar, desabilitado }) {
  return (
    <div className="pontos-impressao__linha-toggle">
      <div>
        <div className="pontos-impressao__label-toggle">{titulo}</div>
        <p className="pontos-impressao__intro">{descricao}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={titulo}
        onClick={onAlternar}
        disabled={desabilitado}
        className={`pontos-impressao__toggle${ligado ? " pontos-impressao__toggle--on" : ""}`}
      >
        <span className="pontos-impressao__toggle-bolinha" />
      </button>
    </div>
  );
}
