import { useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle, LuBanknote } from "react-icons/lu";
import { confirmarRenovacaoAssinatura, rotuloCompetencia } from "@/lib/assinatura";
import { mensagemDeErroDoConsole } from "@/lib/console";
import { valorDigitado } from "@/lib/delivery";
import { formatarReais } from "@/lib/deliveryPedidos";
import { useFecharModal } from "@/hooks/useFecharModal";
import { useFocoDoModal } from "@/hooks/useFocoDoModal";
// Reaproveita o CSS genérico de modal do Console (overlay, modal, header,
// campo, footer, botões) — decisão 018 (CSS separado do JSX), sem duplicar.
import "./NovoEstabelecimentoModal.css";

// Como o dinheiro entrou. Vai para `assinaturas_pagamentos.metodo`, que é texto
// livre no banco — a lista existe para ninguém precisar digitar (e para o
// histórico não virar "pix"/"PIX"/"Pix" na mesma coluna).
const FORMAS = ["Pix", "Transferência", "Dinheiro", "Cartão", "Boleto", "Outro"];

/**
 * "2026-08-05" → "2026-08". Lê pela string, sem passar por new Date():
 * `data_vencimento` é `date` puro e o construtor o interpretaria como UTC,
 * jogando o dia para trás no fuso do Brasil (-03) — e com ele o mês, todo
 * dia 1º. Mesmo motivo do `formatarData` da tabela.
 */
function mesDaData(iso) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "";
}

function mesCorrente(hoje = new Date()) {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Registra o pagamento da mensalidade e empurra o vencimento (Console).
 *
 * Por que existe: a RPC `confirmar_renovacao_assinatura` (20260909) é a única
 * forma de renovar uma assinatura desde que a 20260909 tirou a escrita direta
 * da tabela — e até aqui ela não tinha nenhuma porta de tela. Assinatura
 * vencida não tinha como ser renovada por lugar nenhum do sistema.
 *
 * Por que é intuitivo (Princípio nº1): abre com competência e valor já
 * preenchidos com o que o sistema sabe (o mês do vencimento atual e a
 * mensalidade combinada), então o caminho feliz é abrir e confirmar. O eco em
 * português diz o que vai ser gravado — "Pagamento de agosto/2026, R$ 300,00,
 * via Pix" — antes do clique, e "Registrar" fica travado enquanto o valor não
 * for um pagamento de verdade (prevenção de erro > mensagem de erro). As
 * recusas do banco aparecem como frase, e não como código de erro.
 *
 * O front NÃO decide autorização: a RPC revalida o papel `plataforma` no banco
 * (SECURITY DEFINER + is_super_admin(), decisão 027).
 */
export default function ConfirmarRenovacaoModal({
  linha,
  vencimentoAtual,
  confirmadoPor,
  onFechar,
  onConfirmado,
}) {
  const mensalidade = Number(linha?.valorMensal) || 0;
  const [competencia, setCompetencia] = useState(
    () => mesDaData(linha?.dataVencimento) || mesCorrente()
  );
  const [texto, setTexto] = useState(mensalidade > 0 ? String(mensalidade).replace(".", ",") : "");
  const [metodo, setMetodo] = useState(FORMAS[0]);
  const [erroServidor, setErroServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const valor = valorDigitado(texto);
  const vazio = !texto.trim();
  const rotulo = rotuloCompetencia(competencia);

  // Espelha em português a recusa `p_valor <= 0` da RPC (20260909 §4). Ela
  // continua valendo no banco — isto é só para a pessoa não descobrir a regra
  // pelo erro do servidor.
  let erroCampo = "";
  if (!vazio && valor === null) erroCampo = "Digite só números, com vírgula nos centavos. Exemplo: 300,00";
  else if (valor !== null && valor <= 0) erroCampo = "O valor recebido tem de ser maior que zero — não existe pagamento de zero reais.";

  const podeConfirmar = !vazio && !erroCampo && valor !== null && Boolean(rotulo);

  const submeter = async () => {
    if (enviando || !podeConfirmar) return;
    setErroServidor("");
    setEnviando(true);
    // A competência é um `date` no banco e a RPC trunca no mês; mandamos o
    // dia 1º para não depender do fuso de quem está usando.
    const { data, error } = await confirmarRenovacaoAssinatura({
      tenantId: linha.tenantId,
      competencia: `${competencia}-01`,
      valor,
      metodo,
      confirmadoPor,
    });
    setEnviando(false);

    if (error) {
      setErroServidor(mensagemDeErroDoConsole(error, "Não foi possível registrar o pagamento."));
      return;
    }
    onConfirmado(data, rotulo);
  };

  // Esc e clique no fundo escuro saem por onde o "X" sai (CONSOLE-UX 24).
  const fundo = useFecharModal(onFechar, enviando);

  // Foco no primeiro campo ao abrir, Tab preso aqui dentro e foco devolvido
  // ao botão que abriu este modal (CONSOLE-UX 25).
  const caixa = useFocoDoModal();

  return createPortal(
    <div className="nem-overlay" {...fundo} role="dialog" aria-modal="true" aria-label="Registrar pagamento da assinatura">
      <div className="nem-modal" ref={caixa} tabIndex={-1}>
        <header className="nem-header">
          <div className="nem-header__titulo">
            <LuBanknote size={20} aria-hidden />
            <h2>Registrar pagamento</h2>
          </div>
          <button className="nem-fechar" onClick={onFechar} disabled={enviando} aria-label="Fechar">
            <LuX size={20} />
          </button>
        </header>

        <div className="nem-corpo">
          <section className="nem-secao">
            <p className="nem-secao__titulo">{linha?.nome}</p>
            <p className="nem-secao__ajuda">
              {mensalidade > 0
                ? `Mensalidade combinada: ${formatarReais(mensalidade)}. Vencimento de hoje: ${vencimentoAtual}.`
                : `Este estabelecimento está sem mensalidade definida. Vencimento de hoje: ${vencimentoAtual}.`}
            </p>

            <label className="nem-campo">
              <span className="nem-label">Mês pago (competência)</span>
              <input
                className={`nem-input${rotulo ? "" : " nem-input--erro"}`}
                type="month"
                value={competencia}
                disabled={enviando}
                onChange={(e) => setCompetencia(e.target.value)}
              />
            </label>

            <label className="nem-campo">
              <span className="nem-label">Valor recebido (R$)</span>
              <input
                className={`nem-input${erroCampo ? " nem-input--erro" : ""}`}
                type="text"
                inputMode="decimal"
                placeholder="300,00"
                value={texto}
                maxLength={12}
                disabled={enviando}
                onChange={(e) => setTexto(e.target.value)}
              />
            </label>

            <label className="nem-campo">
              <span className="nem-label">Como foi pago</span>
              <select
                className="nem-input"
                value={metodo}
                disabled={enviando}
                onChange={(e) => setMetodo(e.target.value)}
              >
                {FORMAS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </label>

            {/* O eco é o coração da tela: mostra o que vai ser gravado antes do
                clique. O aviso do ciclo evita a expectativa errada de que uma
                confirmação zera qualquer atraso — a RPC anda um ciclo por vez. */}
            {erroCampo ? (
              <p className="nem-erro-campo" role="alert">{erroCampo}</p>
            ) : !rotulo ? (
              <p className="nem-erro-campo" role="alert">Escolha o mês que está sendo pago.</p>
            ) : podeConfirmar ? (
              <p className="nem-secao__ajuda">
                Pagamento de {rotulo}, no valor de {formatarReais(valor)}, via {metodo}.
                O vencimento avança um ciclo de cobrança.
              </p>
            ) : (
              <p className="nem-secao__ajuda">
                Digite quanto foi recebido, como você escreveria no papel: 300,00
              </p>
            )}
          </section>

          {erroServidor && (
            <div className="nem-erro-servidor" role="alert">
              <LuTriangleAlert size={16} aria-hidden /> {erroServidor}
            </div>
          )}
        </div>

        <footer className="nem-footer">
          <button className="nem-btn nem-btn--secundario" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button
            className="nem-btn nem-btn--primario"
            onClick={submeter}
            disabled={enviando || !podeConfirmar}
          >
            {enviando ? (<><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Registrando…</>) : "Registrar pagamento"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
