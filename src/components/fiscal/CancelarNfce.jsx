import { useEffect, useState } from "react";
import { LuBan, LuClock, LuCircleX, LuCircleCheck, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import { buscarNfcePorVenda } from "@/lib/nfceEmitidasRepo";
import { cancelarDocumentoFiscal } from "@/lib/fiscal";
import { dentroDoPrazoCancelamento } from "@/lib/nfceEventoCancelamento";
import "./CancelarNfce.css";

const JUST_MIN = 15;
const JUST_MAX = 255;

/**
 * <CancelarNfce> — cancela a NFC-e de uma venda (evento 110111, Leva 10).
 *
 * Por que é intuitiva (Princípio nº1): o botão "Cancelar NFC-e" só aparece
 * quando cabe cancelar (nota AUTORIZADA e DENTRO do prazo) — fora disso, um
 * ESTADO HUMANO explica o porquê ("Fora do prazo de cancelamento", "NFC-e já
 * cancelada"), nunca um botão morto. Como é ação DESTRUTIVA (CLAUDE.md), exige
 * uma justificativa (contador visível, mínimo 15) e uma CONFIRMAÇÃO explícita
 * antes de enviar; e os estados enviando/cancelada/erro ficam sempre visíveis.
 *
 * FRONTEIRA DE SEGREDO intacta: só campos públicos (chave). O certificado
 * vive na Edge; o front só manda chave + justificativa e aguarda o desfecho.
 *
 * Entregue como unidade reutilizável (como o BotaoReimprimirNfce): monta na
 * tela de histórico/detalhe da venda — não forçada numa tela inadequada.
 *
 * Numa LISTA (histórico, Leva 12), passe `registroInicial` (a linha que a lista
 * já tem) para EVITAR N+1 — pula o fetch da nota por venda. Sem a prop, mantém
 * o comportamento original (busca por `venda.id`).
 *
 * @param {{ venda: { id?: string }, className?: string, onCancelada?: () => void, registroInicial?: object }} props
 */
export default function CancelarNfce({ venda, className = "", onCancelada, registroInicial }) {
  const vendaId = venda?.id ?? null;
  const temRegistroInicial = registroInicial !== undefined;
  const [carregando, setCarregando] = useState(!temRegistroInicial);
  const [registro, setRegistro] = useState(registroInicial ?? null);
  const [abrirForm, setAbrirForm] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    // Registro veio pronto da lista (Leva 12) — não busca (evita N+1).
    if (temRegistroInicial) {
      setRegistro(registroInicial ?? null);
      setCarregando(false);
      return;
    }
    let ativo = true;
    setCarregando(true);
    buscarNfcePorVenda(vendaId).then(({ data }) => {
      if (!ativo) return;
      setRegistro(data);
      setCarregando(false);
    });
    return () => { ativo = false; };
  }, [vendaId, temRegistroInicial, registroInicial]);

  if (carregando) {
    return (
      <span className={`cancelar-nfce cancelar-nfce--info ${className}`}>
        <LuLoaderCircle size={15} className="cancelar-nfce__spinner" /> Verificando NFC-e…
      </span>
    );
  }

  // Desfecho final (cancelada/erro) fica visível.
  if (resultado?.status === "cancelada") {
    return (
      <span className={`cancelar-nfce cancelar-nfce--ok ${className}`}>
        <LuCircleCheck size={15} /> NFC-e cancelada.
      </span>
    );
  }

  const noPrazo = registro?.status === "autorizada" && dentroDoPrazoCancelamento({ dhEmi: registro?.dh_emi });
  const habilitado = Boolean(noPrazo);

  if (!habilitado) {
    const { Icone, texto, mod } = descreverEstado(registro);
    return (
      <span className={`cancelar-nfce cancelar-nfce--info ${mod} ${className}`}>
        <Icone size={15} /> {texto}
      </span>
    );
  }

  const podeConfirmar = justificativa.trim().length >= JUST_MIN && !enviando;

  const confirmar = async () => {
    setEnviando(true);
    const r = await cancelarDocumentoFiscal({ chave: registro.chave, justificativa: justificativa.trim() });
    setEnviando(false);
    setResultado(r);
    if (r.status === "cancelada") {
      setAbrirForm(false);
      onCancelada?.();
    }
  };

  return (
    <div className={`cancelar-nfce ${className}`}>
      {!abrirForm && (
        <button type="button" className="cancelar-nfce__botao" onClick={() => { setResultado(null); setAbrirForm(true); }}>
          <LuBan size={16} /> Cancelar NFC-e
        </button>
      )}

      {abrirForm && (
        <div className="cancelar-nfce__form">
          <p className="cancelar-nfce__aviso">
            <LuTriangleAlert size={15} /> Cancelar é definitivo. Descreva o motivo:
          </p>
          <textarea
            className="cancelar-nfce__textarea"
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value.slice(0, JUST_MAX))}
            placeholder="Ex.: Cliente desistiu da compra."
            rows={3}
            aria-label="Justificativa do cancelamento"
            disabled={enviando}
          />
          <div className="cancelar-nfce__contador">
            {justificativa.trim().length}/{JUST_MAX}
            {justificativa.trim().length < JUST_MIN && ` (mínimo ${JUST_MIN})`}
          </div>

          {resultado && resultado.status !== "cancelada" && (
            <p className="cancelar-nfce__erro">
              <LuCircleX size={15} /> {mensagemFalha(resultado)}
            </p>
          )}

          <div className="cancelar-nfce__acoes">
            <button
              type="button"
              className="cancelar-nfce__botao cancelar-nfce__botao--perigo"
              onClick={confirmar}
              disabled={!podeConfirmar}
            >
              {enviando
                ? (<><LuLoaderCircle size={16} className="cancelar-nfce__spinner" /> Cancelando…</>)
                : (<><LuBan size={16} /> Confirmar cancelamento</>)}
            </button>
            <button
              type="button"
              className="cancelar-nfce__botao"
              onClick={() => setAbrirForm(false)}
              disabled={enviando}
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Estado humano quando NÃO cabe cancelar — nada de botão morto. */
function descreverEstado(registro) {
  if (!registro) return { Icone: LuBan, texto: "Esta venda ainda não tem NFC-e emitida.", mod: "" };
  switch (registro.status) {
    case "cancelada":
      return { Icone: LuBan, texto: "NFC-e já cancelada.", mod: "" };
    case "pendente":
      return { Icone: LuClock, texto: "NFC-e ainda na fila de contingência — aguarde a autorização.", mod: "cancelar-nfce--pendente" };
    case "rejeitada":
      return { Icone: LuCircleX, texto: "NFC-e rejeitada — não há nota válida para cancelar.", mod: "cancelar-nfce--rejeitada" };
    case "autorizada":
      // Autorizada, mas fora do prazo.
      return { Icone: LuClock, texto: "Fora do prazo de cancelamento da NFC-e.", mod: "cancelar-nfce--pendente" };
    default:
      return { Icone: LuBan, texto: "Esta venda ainda não tem NFC-e emitida.", mod: "" };
  }
}

/** Texto humano da falha de cancelamento (sem vazar nada sensível). */
function mensagemFalha(resultado) {
  if (resultado.status === "sem_chave") {
    return "Cancelamento indisponível: falta o certificado configurado.";
  }
  if (resultado.status === "autorizada") {
    // Evento rejeitado — a nota segue valendo.
    return resultado.xMotivo || resultado.detalhe || "A SEFAZ não registrou o cancelamento.";
  }
  return resultado.detalhe || "Não foi possível cancelar a NFC-e.";
}
