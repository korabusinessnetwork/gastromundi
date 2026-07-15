import { useState } from "react";
import {
  LuFileX, LuTriangleAlert, LuCircleX, LuCircleCheck, LuLoaderCircle,
} from "react-icons/lu";
import { inutilizarNumeracao } from "@/lib/fiscal";
import "./InutilizarNumeracao.css";

const JUST_MIN = 15;
const JUST_MAX = 255;

/**
 * <InutilizarNumeracao> — inutiliza uma FAIXA de numeração NFC-e que pulou e
 * nunca virou nota (NFeInutilizacao4, Leva 11). NÃO é cancelamento: cancelar
 * age sobre nota autorizada; inutilizar "queima" na SEFAZ números que nunca
 * viraram nota, para justificar o buraco na sequência.
 *
 * Por que é intuitiva (Princípio nº1): a seção tem tom de AVISO e explica em
 * português o que faz ("esses números não poderão mais ser usados"). Prevenção
 * de erro > mensagem: o botão fica desabilitado enquanto a faixa/justificativa
 * são inválidas, com o motivo SEMPRE visível sob o campo (ex.: "A numeração
 * final deve ser ≥ a inicial") — nada de botão morto. Como é ação DEFINITIVA e
 * irreversível, exige uma CONFIRMAÇÃO explícita em duas etapas antes de enviar.
 * Todos os estados ficam visíveis: enviando / inutilizada (✓) / rejeitada
 * (mostra o motivo da SEFAZ) / sem_chave / erro.
 *
 * FRONTEIRA DE SEGREDO intacta: só campos públicos (série/faixa/justificativa).
 * O certificado vive na Edge; o front só manda a faixa e aguarda o desfecho.
 *
 * @param {{ serieAtual?: number|string, className?: string }} props
 */
export default function InutilizarNumeracao({ serieAtual = 1, className = "" }) {
  const [serie, setSerie] = useState(String(serieAtual ?? 1));
  const [nNFIni, setNNFIni] = useState("");
  const [nNFFin, setNNFFin] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const erros = validarFaixa({ serie, nNFIni, nNFFin, justificativa });
  const valido = Object.keys(erros).length === 0;

  const alterar = (setter) => (valor) => {
    setResultado(null);
    setConfirmando(false);
    setter(valor);
  };

  const confirmar = async () => {
    setEnviando(true);
    const r = await inutilizarNumeracao({
      serie: Number(serie),
      nNFIni: Number(nNFIni),
      nNFFin: Number(nNFFin),
      justificativa: justificativa.trim(),
    });
    setEnviando(false);
    setResultado(r);
    if (r.status === "inutilizada") {
      setConfirmando(false);
      setNNFIni("");
      setNNFFin("");
      setJustificativa("");
    }
  };

  // Sucesso final fica visível de forma destacada.
  if (resultado?.status === "inutilizada") {
    return (
      <section className={`inutilizar-numeracao ${className}`} aria-label="Inutilizar faixa de numeração">
        <p className="inutilizar-numeracao__ok" role="status">
          <LuCircleCheck size={18} /> Faixa {nNFIni || "?"}–{nNFFin || "?"} inutilizada na SEFAZ.
        </p>
        <button
          type="button"
          className="inutilizar-numeracao__botao"
          onClick={() => setResultado(null)}
        >
          Inutilizar outra faixa
        </button>
      </section>
    );
  }

  return (
    <section className={`inutilizar-numeracao ${className}`} aria-label="Inutilizar faixa de numeração">
      <header className="inutilizar-numeracao__cabecalho">
        <h2 className="inutilizar-numeracao__titulo">
          <LuFileX size={20} /> Inutilizar faixa de numeração
        </h2>
        <p className="inutilizar-numeracao__aviso">
          <LuTriangleAlert size={15} /> Use só quando uma faixa de números pulou e
          <strong> nunca virou nota</strong>. Inutilizar é <strong>definitivo</strong>:
          esses números não poderão mais ser usados.
        </p>
      </header>

      <div className="inutilizar-numeracao__grade">
        <Campo
          id="inut-serie" label="Série" valor={serie} inputMode="numeric"
          erro={erros.serie} onChange={alterar(setSerie)} estreito
          disabled={enviando}
        />
        <Campo
          id="inut-ini" label="Número inicial" valor={nNFIni} inputMode="numeric"
          erro={erros.nNFIni} onChange={alterar(setNNFIni)} estreito
          disabled={enviando}
        />
        <Campo
          id="inut-fin" label="Número final" valor={nNFFin} inputMode="numeric"
          erro={erros.nNFFin} onChange={alterar(setNNFFin)} estreito
          disabled={enviando}
        />
      </div>

      <div className="inutilizar-numeracao__campo">
        <label htmlFor="inut-just" className="inutilizar-numeracao__label">
          Justificativa
        </label>
        <textarea
          id="inut-just"
          className="inutilizar-numeracao__textarea"
          value={justificativa}
          onChange={(e) => alterar(setJustificativa)(e.target.value.slice(0, JUST_MAX))}
          placeholder="Ex.: Falha técnica pulou a numeração; faixa nunca emitida."
          rows={2}
          disabled={enviando}
        />
        <div className="inutilizar-numeracao__contador">
          {justificativa.trim().length}/{JUST_MAX}
          {justificativa.trim().length < JUST_MIN && ` (mínimo ${JUST_MIN})`}
        </div>
        {erros.justificativa && (
          <span className="inutilizar-numeracao__erro-campo">{erros.justificativa}</span>
        )}
      </div>

      {resultado && resultado.status !== "inutilizada" && (
        <p className="inutilizar-numeracao__erro" role="alert">
          <LuCircleX size={15} /> {mensagemFalha(resultado)}
        </p>
      )}

      {!confirmando ? (
        <button
          type="button"
          className="inutilizar-numeracao__botao inutilizar-numeracao__botao--perigo"
          onClick={() => setConfirmando(true)}
          disabled={!valido}
        >
          <LuFileX size={16} /> Inutilizar faixa
        </button>
      ) : (
        <div className="inutilizar-numeracao__confirmacao">
          <p className="inutilizar-numeracao__confirmacao-texto">
            <LuTriangleAlert size={15} /> Confirmar a inutilização da faixa
            {" "}<strong>{nNFIni}–{nNFFin}</strong> (série {serie})? Esses números não
            poderão mais ser usados.
          </p>
          <div className="inutilizar-numeracao__acoes">
            <button
              type="button"
              className="inutilizar-numeracao__botao inutilizar-numeracao__botao--perigo"
              onClick={confirmar}
              disabled={enviando}
            >
              {enviando
                ? (<><LuLoaderCircle size={16} className="inutilizar-numeracao__spinner" /> Inutilizando…</>)
                : (<><LuFileX size={16} /> Confirmar inutilização</>)}
            </button>
            <button
              type="button"
              className="inutilizar-numeracao__botao"
              onClick={() => setConfirmando(false)}
              disabled={enviando}
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Campo numérico com rótulo e erro sob o campo. */
function Campo({ id, label, valor, erro, onChange, inputMode, estreito, disabled }) {
  return (
    <div className={`inutilizar-numeracao__campo ${estreito ? "inutilizar-numeracao__campo--estreito" : ""}`}>
      <label htmlFor={id} className="inutilizar-numeracao__label">{label}</label>
      <input
        id={id}
        className={`inutilizar-numeracao__input ${erro ? "inutilizar-numeracao__input--erro" : ""}`}
        value={valor}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {erro && <span className="inutilizar-numeracao__erro-campo">{erro}</span>}
    </div>
  );
}

/**
 * Validação PURA da faixa (prevenção de erro): mesmas regras do núcleo
 * (nfceInutilizacao), com mensagens humanas prontas para exibir sob o campo.
 * Chaveada pelo nome do campo do formulário.
 */
export function validarFaixa({ serie, nNFIni, nNFFin, justificativa }) {
  const erros = {};

  const s = Number(serie);
  if (String(serie ?? "").trim() === "") erros.serie = "Informe a série.";
  else if (!Number.isInteger(s) || s < 0 || s > 999) erros.serie = "Série de 0 a 999.";

  const ini = Number(nNFIni);
  const fin = Number(nNFFin);
  if (String(nNFIni ?? "").trim() === "") erros.nNFIni = "Informe o número inicial.";
  else if (!Number.isInteger(ini) || ini < 1) erros.nNFIni = "Número inteiro ≥ 1.";

  if (String(nNFFin ?? "").trim() === "") erros.nNFFin = "Informe o número final.";
  else if (!Number.isInteger(fin) || fin < 1) erros.nNFFin = "Número inteiro ≥ 1.";
  else if (!erros.nNFIni && fin < ini) erros.nNFFin = "A numeração final deve ser ≥ a inicial.";

  const just = String(justificativa ?? "").trim();
  if (just.length < JUST_MIN) erros.justificativa = `A justificativa precisa de ao menos ${JUST_MIN} caracteres.`;
  else if (just.length > JUST_MAX) erros.justificativa = `Máximo de ${JUST_MAX} caracteres.`;

  return erros;
}

/** Texto humano da falha de inutilização (sem vazar nada sensível). */
function mensagemFalha(resultado) {
  if (resultado.status === "sem_chave") {
    return "Inutilização indisponível: falta o certificado configurado.";
  }
  if (resultado.status === "rejeitada") {
    return resultado.xMotivo || resultado.detalhe || "A SEFAZ não homologou a inutilização.";
  }
  return resultado.detalhe || "Não foi possível inutilizar a numeração.";
}
