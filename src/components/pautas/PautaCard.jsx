import { useState } from "react";
import { LuPencil, LuChevronDown, LuChevronUp, LuTarget, LuUsers } from "react-icons/lu";
import { STATUS_EM_ORDEM, STATUS_PAUTA, rotuloStatus, nomesDosEnvolvidos } from "@/lib/pautas";
import "./PautaCard.css";

/**
 * Um card de pauta na lista.
 *
 * Mostra o que é (título), para que serve (intuito), quem está envolvido e
 * em que pé está — com os três botões de estado sempre à vista.
 *
 * Por que é intuitiva (Princípio nº1): o estado atual é o botão aceso, então
 * mudar de estado é um toque no botão do lado, sem menu, sem confirmação e
 * sem tela intermediária. O intuito aparece sempre (é o coração da pauta) e
 * o contexto — que costuma ser longo — fica em "Ver contexto" para a lista
 * continuar escaneável. Os botões são grandes o bastante para o toque.
 */
export default function PautaCard({ pauta, pessoas = [], onMudarStatus, onEditar }) {
  const [aberto,   setAberto]   = useState(false);
  const [mudando,  setMudando]  = useState(false);

  const nomes = nomesDosEnvolvidos(pauta.envolvidos, pessoas);
  const temContexto = !!String(pauta.contexto ?? "").trim();

  const mudarPara = async (status) => {
    if (mudando || status === pauta.status) return;
    setMudando(true);
    await onMudarStatus?.(pauta.id, status);
    setMudando(false);
  };

  return (
    <article className={`pauta-card pauta-card--${pauta.status}`}>
      <div className="pauta-card__topo">
        <h3 className="pauta-card__titulo">{pauta.titulo}</h3>
        <button
          type="button"
          className="pauta-card__editar"
          onClick={() => onEditar?.(pauta)}
          aria-label={`Editar a pauta ${pauta.titulo}`}
        >
          <LuPencil size={15} aria-hidden /> Editar
        </button>
      </div>

      <p className="pauta-card__intuito">
        <LuTarget size={14} aria-hidden className="pauta-card__icone" />
        <span><strong>Para quê:</strong> {pauta.intuito}</span>
      </p>

      {nomes.length > 0 && (
        <p className="pauta-card__pessoas">
          <LuUsers size={14} aria-hidden className="pauta-card__icone" />
          <span>{nomes.join(", ")}</span>
        </p>
      )}

      {temContexto && (
        <>
          <button
            type="button"
            className="pauta-card__ver-contexto"
            onClick={() => setAberto((a) => !a)}
            aria-expanded={aberto}
          >
            {aberto ? <LuChevronUp size={14} aria-hidden /> : <LuChevronDown size={14} aria-hidden />}
            {aberto ? "Ocultar contexto" : "Ver contexto"}
          </button>
          {aberto && <p className="pauta-card__contexto">{pauta.contexto}</p>}
        </>
      )}

      <div className="pauta-card__status" role="group" aria-label={`Situação da pauta ${pauta.titulo}`}>
        {STATUS_EM_ORDEM.map((status) => {
          const atual = status === pauta.status;
          return (
            <button
              key={status}
              type="button"
              className={`pauta-card__botao pauta-card__botao--${status}${atual ? " pauta-card__botao--atual" : ""}`}
              aria-pressed={atual}
              disabled={mudando}
              onClick={() => mudarPara(status)}
            >
              {rotuloStatus(status)}
            </button>
          );
        })}
      </div>

      {pauta.status === STATUS_PAUTA.FINALIZADO && pauta.finalizada_em && (
        <p className="pauta-card__rodape">
          Finalizada em {new Date(pauta.finalizada_em).toLocaleDateString("pt-BR")}
          {pauta.atualizada_por ? ` por ${nomesDosEnvolvidos([pauta.atualizada_por], pessoas)[0]}` : ""}
        </p>
      )}
    </article>
  );
}
