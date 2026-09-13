import { useEffect, useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import { assinarNovaVersao, temNovaVersao, aplicarNovaVersao } from "@/lib/novaVersao";
import "./AvisoNovaVersao.css";

/**
 * Faixa que oferece a versão nova, em vez de recarregar a aba por conta própria.
 *
 * O service worker estava em `autoUpdate`, e nesse modo o recarregamento
 * acontecia sozinho assim que a versão nova ativava. Como a produção sobe a cada
 * push, isso derrubava a aba do caixa no meio do expediente e levava o que só
 * existia na memória, como o carrinho montado e ainda não lançado. Agora o
 * operador escolhe a hora, que é a única pessoa que sabe se dá para parar.
 *
 * Por que não desaparece sozinha: versão velha rodando é problema de verdade
 * quando há correção de conta ou de fiscal dentro. A faixa fica, discreta, até
 * alguém atualizar. Só não insiste: não há modal e nada é bloqueado.
 */
export default function AvisoNovaVersao() {
  const [temVersao, setTemVersao] = useState(temNovaVersao);
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => assinarNovaVersao(setTemVersao), []);

  if (!temVersao) return null;

  const atualizar = async () => {
    setAplicando(true);
    setErro("");
    const { error } = await aplicarNovaVersao();
    // Deu certo: a página recarrega e este componente morre com ela. Só o
    // caminho de falha precisa voltar o botão ao normal.
    if (error) {
      setErro("Não deu para atualizar agora. Tente de novo em instantes.");
      setAplicando(false);
    }
  };

  return (
    <div className="aviso-nova-versao" role="status">
      <LuRefreshCw size={16} className="aviso-nova-versao__icone" aria-hidden="true" />
      <div className="aviso-nova-versao__texto">
        <strong>Versão nova disponível.</strong>{" "}
        {erro || "Atualize quando puder parar, nada do que está na tela se perde antes disso."}
      </div>
      <button
        type="button"
        onClick={atualizar}
        disabled={aplicando}
        className="aviso-nova-versao__botao"
      >
        {aplicando ? "Atualizando..." : "Atualizar agora"}
      </button>
    </div>
  );
}
