import { useState } from "react";
import { LuPencil, LuChevronDown, LuChevronUp } from "react-icons/lu";
import {
  STATUS_EM_ORDEM,
  STATUS_PAUTA,
  rotuloStatus,
  abreviacaoStatus,
  nomesDosEnvolvidos,
  indiceDeCorDaPessoa,
} from "@/lib/pautas";
import "./PautaCard.css";

const DIA_E_MES = { day: "2-digit", month: "short" };

/** A letra do avatar — a primeira do nome, que é como as pessoas se reconhecem. */
function inicialDe(nome) {
  return String(nome ?? "").trim().charAt(0).toUpperCase() || "?";
}

/** "17 de ago." — data curta, que cabe no rodapé sem competir com o título. */
function dataCurta(iso) {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleDateString("pt-BR", DIA_E_MES);
}

/** Data por extenso, para o `title` de quem quiser o dia exato. */
function dataInteira(iso) {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleDateString("pt-BR");
}

/**
 * Um card de pauta dentro da coluna do quadro.
 *
 * Mostra o que é (título), para que serve (intuito), quem está envolvido,
 * quando nasceu e em que pé está — com os três estados a um toque.
 *
 * Por que é intuitiva (Princípio nº1): a coluna onde o card está já diz o
 * estado por extenso, então o rodapé só precisa dos três atalhos P / E / F —
 * um toque e o card anda de coluna na frente do usuário, sem menu, sem
 * confirmação, sem tela intermediária (o botão do estado atual é inerte, de
 * propósito: não dá para "mudar para onde já está"). Quem entra na pauta
 * aparece como rosto e não como lista de nomes, o que se lê de relance; o
 * nome inteiro continua no `title` e no leitor de tela. O contexto — que
 * costuma ser longo — fica atrás de "Ver contexto" para a coluna continuar
 * escaneável.
 */
export default function PautaCard({ pauta, pessoas = [], onMudarStatus, onEditar }) {
  const [aberto,  setAberto]  = useState(false);
  const [mudando, setMudando] = useState(false);

  const envolvidos = Array.isArray(pauta.envolvidos) ? pauta.envolvidos : [];
  const nomes = nomesDosEnvolvidos(envolvidos, pessoas);
  const temContexto = !!String(pauta.contexto ?? "").trim();

  const criada = dataCurta(pauta.created_at);
  const finalizada = pauta.status === STATUS_PAUTA.FINALIZADO && pauta.finalizada_em
    ? `Finalizada em ${dataInteira(pauta.finalizada_em)}`
    : "";
  const tituloData = [
    pauta.created_at ? `Criada em ${dataInteira(pauta.created_at)}` : "",
    finalizada,
  ].filter(Boolean).join(" · ");

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
          <LuPencil size={13} aria-hidden /> Editar
        </button>
      </div>

      <p className="pauta-card__intuito">{pauta.intuito}</p>

      {temContexto && (
        <>
          <button
            type="button"
            className="pauta-card__ver-contexto"
            onClick={() => setAberto((a) => !a)}
            aria-expanded={aberto}
          >
            {aberto ? <LuChevronUp size={13} aria-hidden /> : <LuChevronDown size={13} aria-hidden />}
            {aberto ? "Ocultar contexto" : "Ver contexto"}
          </button>
          {aberto && <p className="pauta-card__contexto">{pauta.contexto}</p>}
        </>
      )}

      <div className="pauta-card__rodape">
        <div className="pauta-card__quem">
          {nomes.length > 0 && (
            <div className="pauta-card__avatares" aria-label={`Envolvidos: ${nomes.join(", ")}`}>
              {envolvidos.map((slug, i) => (
                <span
                  key={slug}
                  className={`pauta-card__avatar pauta-card__avatar--cor-${indiceDeCorDaPessoa(slug, pessoas)}`}
                  title={nomes[i]}
                >
                  {inicialDe(nomes[i])}
                </span>
              ))}
            </div>
          )}
          {criada && (
            <span className="pauta-card__data" title={tituloData}>{criada}</span>
          )}
        </div>

        <div className="pauta-card__status" role="group" aria-label={`Situação da pauta ${pauta.titulo}`}>
          {STATUS_EM_ORDEM.map((status) => {
            const atual = status === pauta.status;
            const rotulo = rotuloStatus(status);
            return (
              <button
                key={status}
                type="button"
                className={`pauta-card__botao pauta-card__botao--${status}${atual ? " pauta-card__botao--atual" : ""}`}
                aria-pressed={atual}
                disabled={mudando}
                title={atual ? rotulo : `Mudar para ${rotulo.toLowerCase()}`}
                aria-label={atual ? rotulo : `Mudar para ${rotulo.toLowerCase()}`}
                onClick={() => mudarPara(status)}
              >
                {abreviacaoStatus(status)}
              </button>
            );
          })}
        </div>
      </div>
    </article>
  );
}
