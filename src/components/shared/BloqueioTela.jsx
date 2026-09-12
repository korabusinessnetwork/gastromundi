import { useEffect, useRef, useState } from "react";
import { LuLock, LuUserRoundCog } from "react-icons/lu";
import { destravarComSenha } from "@/lib/bloqueioTela";
import "./BloqueioTela.css";

/**
 * Cadeado da tela, no lugar do logout por tempo.
 *
 * O PDV não fecha nunca: a aba fica aberta 24 horas. Antes, vencido o prazo de
 * inatividade ou o teto de sessão, o app deslogava, e deslogar desmonta a
 * árvore inteira: o carrinho montado e ainda não lançado ia junto, sem trilha.
 * Aqui nada é desmontado. Este componente cobre a tela, a comanda continua
 * atrás dele, e quem volta digita a senha e segue de onde parou.
 *
 * Quem está de fato trocando de turno usa "trocar de operador", que é o logout
 * de verdade, com a intenção explícita de quem clicou.
 */
export default function BloqueioTela({ operador, aoDestravar, aoTrocarOperador }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const campoRef = useRef(null);

  // O foco vai para a senha assim que a tela trava: quem voltou ao balcão
  // digita direto, sem procurar onde clicar.
  useEffect(() => { campoRef.current?.focus(); }, []);

  const enviar = async (e) => {
    e?.preventDefault?.();
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    const { ok, verificado, erro: motivo } = await destravarComSenha(operador?.username, senha);
    if (!ok) {
      setErro(motivo || "Senha incorreta.");
      setSenha("");
      setOcupado(false);
      campoRef.current?.focus();
      return;
    }
    setSenha("");
    // `verificado: false` quer dizer que a tela abriu sem conferir a senha,
    // porque não havia internet. Quem registra isso é o chamador, que tem o
    // log de atividade à mão.
    aoDestravar?.({ verificado });
  };

  return (
    <div className="bloqueio-tela" role="dialog" aria-modal="true" aria-labelledby="bloqueio-titulo">
      <form className="bloqueio-tela__caixa" onSubmit={enviar}>
        <div className="bloqueio-tela__icone" aria-hidden="true"><LuLock size={22} /></div>

        <h2 className="bloqueio-tela__titulo" id="bloqueio-titulo">Tela bloqueada</h2>
        <p className="bloqueio-tela__texto">
          O caixa continua aberto e nada do que está na tela se perdeu.
          {operador?.name ? ` Digite a senha de ${operador.name} para continuar.` : " Digite a senha para continuar."}
        </p>

        <label className="bloqueio-tela__rotulo" htmlFor="bloqueio-senha">Senha</label>
        <input
          id="bloqueio-senha"
          ref={campoRef}
          type="password"
          value={senha}
          onChange={(e) => { setSenha(e.target.value); setErro(""); }}
          autoComplete="current-password"
          maxLength={100}
          disabled={ocupado}
          className="bloqueio-tela__campo"
        />

        {erro && <div className="bloqueio-tela__erro" role="alert">{erro}</div>}

        <button type="submit" disabled={ocupado} className="bloqueio-tela__destravar">
          {ocupado ? "Conferindo..." : "Destravar"}
        </button>

        <button
          type="button"
          onClick={aoTrocarOperador}
          disabled={ocupado}
          className="bloqueio-tela__trocar"
        >
          <LuUserRoundCog size={15} aria-hidden="true" /> Trocar de operador
        </button>
      </form>
    </div>
  );
}
