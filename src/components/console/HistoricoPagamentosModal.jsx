import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX, LuTriangleAlert, LuLoaderCircle, LuReceipt, LuRotateCcw, LuBan,
} from "react-icons/lu";
import {
  listarPagamentosAssinatura, estornarPagamentoAssinatura, resumirPagamentos, rotuloCompetencia,
} from "@/lib/assinatura";
import { formatarReais } from "@/lib/deliveryPedidos";
import { useFecharModal } from "@/hooks/useFecharModal";
import { useFocoDoModal } from "@/hooks/useFocoDoModal";
// A casca (overlay, modal, header, botões, spinner) é a mesma dos outros
// modais do Console — decisão 018, sem duplicar CSS.
import "./NovoEstabelecimentoModal.css";
import "./HistoricoPagamentosModal.css";

/** `date` do Postgres ("2026-08-01") → "agosto/2026", pela string. */
function mesPago(competencia) {
  return rotuloCompetencia(String(competencia ?? "").slice(0, 7)) || "—";
}

/**
 * `confirmado_em`/`estornado_em` são `timestamptz` — instantes, não dias de
 * calendário. Aqui `new Date()` é o certo (o contrário de `competencia`, que
 * é `date` puro e não pode passar pelo construtor).
 */
function dataHora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

/**
 * Histórico de pagamentos da mensalidade de um estabelecimento, com o
 * cancelamento de um lançamento errado (F022-HISTORICO).
 *
 * Por que existe: desde a 20260909 a plataforma confirma o pagamento e o
 * vencimento anda um ciclo, mas nada no sistema mostrava o que foi lançado —
 * e um lançamento errado (valor trocado, mês trocado, clique no
 * estabelecimento errado) só se desfazia com SQL em produção, onde errar o
 * `data_vencimento` bloqueia um cliente que não deve nada.
 *
 * Por que é intuitivo (Princípio nº1): abre já mostrando o que foi pago, do
 * mais recente para o mais antigo, com o total em cima. O cancelamento
 * acontece na PRÓPRIA linha errada — não há lista para reencontrar o item
 * depois de abrir outra tela — e exige escrever o motivo antes de o botão
 * liberar (prevenção de erro > mensagem de erro). Antes de confirmar, a tela
 * diz em português o que vai acontecer com o vencimento. O que foi cancelado
 * continua visível, riscado, com quem cancelou e por quê: histórico de
 * dinheiro não desaparece.
 *
 * O front NÃO decide autorização: a RPC revalida o papel `plataforma` no
 * banco (SECURITY DEFINER + is_super_admin(), 20260913).
 */
export default function HistoricoPagamentosModal({ linha, confirmadoPor, onFechar, onEstornado }) {
  const tenantId = linha?.tenantId;
  const [estado, setEstado] = useState("carregando"); // carregando | ok | erro
  const [pagamentos, setPagamentos] = useState([]);
  const [erroLeitura, setErroLeitura] = useState("");

  const [emCancelamento, setEmCancelamento] = useState(null); // id da linha
  const [motivo, setMotivo] = useState("");
  const [erroServidor, setErroServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setEstado("carregando");
    setErroLeitura("");
    const { data, error } = await listarPagamentosAssinatura(tenantId);
    if (error) {
      // Lista vazia por falha de leitura levaria a lançar o mesmo mês de
      // novo — a tela precisa dizer que não sabe.
      setErroLeitura(error.message ?? "Não foi possível carregar os pagamentos.");
      setEstado("erro");
      return;
    }
    setPagamentos(data);
    setEstado("ok");
  }, [tenantId]);

  useEffect(() => { carregar(); }, [carregar]);

  const { linhas, totalCentavos, quantidadeValidos } = resumirPagamentos(pagamentos);
  const motivoValido = motivo.trim().length >= 3;

  const abrirCancelamento = (id) => {
    setEmCancelamento(id);
    setMotivo("");
    setErroServidor("");
  };

  const confirmarCancelamento = async (id) => {
    if (enviando || !motivoValido) return;
    setErroServidor("");
    setEnviando(true);
    const { error } = await estornarPagamentoAssinatura({
      pagamentoId: id,
      motivo,
      estornadoPor: confirmadoPor,
    });
    setEnviando(false);

    if (error) {
      setErroServidor(error.message ?? "Não foi possível cancelar o pagamento.");
      return;
    }
    setEmCancelamento(null);
    setMotivo("");
    await carregar();
    onEstornado?.();
  };

  // Esc e clique no fundo desfazem sempre a coisa mais interna
  // (CONSOLE-UX 24): com um estorno em confirmação, o gesto volta para a
  // lista em vez de fechar o histórico inteiro por baixo dele.
  const pedirParaFechar = () => {
    if (emCancelamento) setEmCancelamento(null);
    else onFechar();
  };
  const fundo = useFecharModal(pedirParaFechar, enviando);

  // Foco no primeiro campo ao abrir, Tab preso aqui dentro e foco devolvido
  // ao botão que abriu este modal (CONSOLE-UX 25).
  const caixa = useFocoDoModal();

  return createPortal(
    <div className="nem-overlay" {...fundo} role="dialog" aria-modal="true" aria-label="Pagamentos da assinatura">
      <div className="nem-modal hpm-modal" ref={caixa} tabIndex={-1}>
        <header className="nem-header">
          <div className="nem-header__titulo">
            <LuReceipt size={20} aria-hidden />
            <h2>Pagamentos de {linha?.nome}</h2>
          </div>
          <button className="nem-fechar" onClick={onFechar} disabled={enviando} aria-label="Fechar">
            <LuX size={20} />
          </button>
        </header>

        <div className="nem-corpo">
          {estado === "carregando" && (
            <p className="hpm-estado" role="status">
              <LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Carregando os pagamentos…
            </p>
          )}

          {estado === "erro" && (
            <div className="hpm-estado hpm-estado--erro" role="alert">
              <p className="hpm-estado__texto">
                <LuTriangleAlert size={16} aria-hidden /> Não foi possível carregar os pagamentos.
              </p>
              <p className="hpm-estado__detalhe">{erroLeitura}</p>
              <button type="button" className="nem-btn nem-btn--secundario" onClick={carregar}>
                Tentar de novo
              </button>
            </div>
          )}

          {estado === "ok" && linhas.length === 0 && (
            <p className="hpm-estado" role="status">
              Nenhum pagamento registrado ainda para este estabelecimento.
            </p>
          )}

          {estado === "ok" && linhas.length > 0 && (
            <>
              <p className="hpm-total" role="status">
                <strong>{formatarReais(totalCentavos / 100)}</strong> recebidos em{" "}
                {quantidadeValidos === 1 ? "1 pagamento" : `${quantidadeValidos} pagamentos`}.
              </p>

              <ul className="hpm-lista">
                {linhas.map((p) => (
                  <li key={p.id} className={`hpm-item${p.estornado ? " hpm-item--cancelado" : ""}`}>
                    <div className="hpm-item__topo">
                      <span className="hpm-item__mes">{mesPago(p.competencia)}</span>
                      <span className="hpm-item__valor">{formatarReais(p.valorCentavos / 100)}</span>
                    </div>

                    <p className="hpm-item__meta">
                      {p.metodo ? `${p.metodo} · ` : ""}
                      registrado por {p.confirmadoPor || "não registrado"}
                      {dataHora(p.confirmadoEm) ? ` em ${dataHora(p.confirmadoEm)}` : ""}
                    </p>

                    {p.estornado ? (
                      <p className="hpm-item__cancelado">
                        <LuBan size={14} aria-hidden /> Cancelado
                        {dataHora(p.estornadoEm) ? ` em ${dataHora(p.estornadoEm)}` : ""}
                        {p.estornadoPor ? ` por ${p.estornadoPor}` : ""}
                        {p.motivoEstorno ? `: ${p.motivoEstorno}` : ""}
                      </p>
                    ) : emCancelamento === p.id ? (
                      <div className="hpm-confirma">
                        <p className="hpm-confirma__aviso">
                          O vencimento volta um ciclo de cobrança e {mesPago(p.competencia)} fica
                          livre para ser registrado de novo com o valor certo.
                        </p>
                        <label className="nem-campo">
                          <span className="nem-label">Por que este pagamento está sendo cancelado?</span>
                          <input
                            className="nem-input"
                            type="text"
                            value={motivo}
                            maxLength={120}
                            disabled={enviando}
                            placeholder="Ex.: valor digitado errado"
                            onChange={(e) => setMotivo(e.target.value)}
                            aria-label={`Motivo do cancelamento de ${mesPago(p.competencia)}`}
                          />
                        </label>
                        {!motivoValido && (
                          <p className="nem-erro-campo">
                            Escreva o motivo — ele fica gravado no histórico.
                          </p>
                        )}
                        <div className="hpm-confirma__acoes">
                          <button
                            type="button"
                            className="nem-btn nem-btn--secundario"
                            onClick={() => setEmCancelamento(null)}
                            disabled={enviando}
                          >
                            Voltar
                          </button>
                          <button
                            type="button"
                            className="nem-btn hpm-btn--perigo"
                            onClick={() => confirmarCancelamento(p.id)}
                            disabled={enviando || !motivoValido}
                          >
                            {enviando ? (
                              <><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Cancelando…</>
                            ) : "Cancelar o pagamento"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="hpm-cancelar"
                        onClick={() => abrirCancelamento(p.id)}
                        aria-label={`Cancelar o pagamento de ${mesPago(p.competencia)}`}
                      >
                        <LuRotateCcw size={14} aria-hidden /> Cancelar este pagamento
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {erroServidor && (
            <div className="nem-erro-servidor" role="alert">
              <LuTriangleAlert size={16} aria-hidden /> {erroServidor}
            </div>
          )}
        </div>

        <footer className="nem-footer">
          <button className="nem-btn nem-btn--secundario" onClick={onFechar} disabled={enviando}>
            Fechar
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
