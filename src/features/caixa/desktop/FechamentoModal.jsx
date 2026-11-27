import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState, useMemo } from "react";
import { totalPorMetodo, rotuloMetodo } from "@/utils/pagamentos";
import { round2 } from "@/features/caixa/regras/vendas";
import { TOLERANCIA_CENTAVO, situacaoCaixa, ROTULO_SITUACAO } from "@/features/caixa/regras/caixa";
import { movimentosDaSessao, totalPorTipo, ajusteEsperadoDinheiro } from "@/features/caixa/regras/caixaMovimentos";
import { LuLock, LuBanknote, LuPencil, LuTriangleAlert } from "react-icons/lu";
import { useConfig, useCaixa, useSessao } from "@/context/AppContext";
import { montarComprovanteFechamento } from "@/features/impressao/dados/impressao";
import ImprimirComprovanteCaixa from "./ImprimirComprovanteCaixa";
import "./FechamentoModal.css";
import { METODOS_POR_ID } from "@/constants/metodosPagamento";


function fmtR(v) { return "R$ " + Number(v ?? 0).toFixed(2); }
function parsVal(s) { return Math.max(0, parseFloat(String(s ?? "").replace(",", ".")) || 0); }

/**
 * Início da conferência: a hora em que o caixa foi aberto. Sem sessão
 * registrada — ou com um valor ilegível guardado na config — cai no começo
 * do dia local.
 *
 * O guarda é o ponto: `new Date("qualquer coisa").getTime()` devolve NaN, e
 * toda comparação `>= NaN` é false. Uma abertura ilegível fazia o filtro
 * descartar TODAS as vendas — o modal dizia "0 vendas hoje", gravava
 * totalVendas 0 no fechamento e mostrava o caixa cheio como sobra.
 *
 * @param {string|number|null|undefined} sessaoAbertaEm
 * @param {number} [agora] timestamp de referência (injetável para teste)
 * @returns {number} timestamp em ms
 */
export function inicioSessao(sessaoAbertaEm, agora = Date.now()) {
  const abertura = sessaoAbertaEm == null || sessaoAbertaEm === ""
    ? NaN
    : new Date(sessaoAbertaEm).getTime();
  if (Number.isFinite(abertura)) return abertura;
  const inicioDoDia = new Date(agora);
  inicioDoDia.setHours(0, 0, 0, 0);
  return inicioDoDia.getTime();
}

function buildSistema(sales, fundoAtual, sessaoAbertaEm, meios, movimentosCaixa) {
  const inicio = inicioSessao(sessaoAbertaEm);
  // Leva 15.3 — vendas canceladas ficam fora do fechamento
  const hoje = (sales ?? []).filter(s => s && !s.cancelada && new Date(s.at).getTime() >= inicio);
  const m = {};
  const naoMapeados = {};
  meios.forEach(k => { m[k] = 0; });
  hoje.forEach(v => { Object.entries(totalPorMetodo(v)).forEach(([metodo, valor]) => {
    if (m[metodo] !== undefined) {
      m[metodo] += valor;
    } else {
      naoMapeados[metodo] = (naoMapeados[metodo] ?? 0) + valor;
    }
  }); });
  // F005 — só os movimentos desta abertura de caixa. Sem o recorte, a sangria
  // de ontem derrubaria o esperado de hoje.
  const movimentos = movimentosDaSessao(movimentosCaixa, inicio);
  const sangrias    = totalPorTipo(movimentos, "sangria");
  const suprimentos = totalPorTipo(movimentos, "suprimento");
  if (m.dinheiro !== undefined) {
    // esperado = fundo + entradas em dinheiro + suprimentos − sangrias
    // (CAIXA.md). Sem as duas últimas parcelas, todo dinheiro tirado da gaveta
    // por um motivo legítimo aparecia aqui como falta.
    m.dinheiro += fundoAtual + ajusteEsperadoDinheiro(movimentos);
  }
  return { hoje, m, naoMapeados, sangrias, suprimentos };
}

export default function FechamentoModal({ sales, fundoAtual, sessaoAbertaEm, onConfirm, onClose }) {
  const { meiosPagamento, metodosCustom } = useConfig();
  const { movimentosCaixa } = useCaixa();
  const { tenant, currentUser } = useSessao();
  const meios = meiosPagamento?.length ? meiosPagamento : Object.keys(METODOS_POR_ID);
  const customLabels = useMemo(
    () => Object.fromEntries((metodosCustom ?? []).map(m => [m.id, m.label])),
    [metodosCustom]
  );

  const [salvando,    setSalvando]    = useState(false);
  const [observacao,  setObservacao]  = useState("");
  // Passo de sucesso: fechado o caixa, a tela vira o comprovante (com
  // botão de imprimir) em vez de fechar direto. `null` = ainda no form.
  const [registrado,  setRegistrado]  = useState(null);

  const { hoje, m: sistema, naoMapeados, sangrias, suprimentos } = useMemo(
    () => buildSistema(sales, fundoAtual, sessaoAbertaEm, meios, movimentosCaixa),
    [sales, fundoAtual, sessaoAbertaEm, meios, movimentosCaixa]
  );

  const totalVendas = round2(hoje.reduce((s, v) => s + (v.total ?? 0), 0));

  // Método ainda não digitado mostra o valor do sistema. Derivado na hora, e
  // não congelado num `useState`, para acompanhar meio de pagamento que só
  // apareceu depois de o modal abrir (config chega por realtime): com o
  // retrato antigo a linha nova ficava vazia e o total conferido acusava uma
  // falta que não existia. String vazia é escolha do operador e vale zero.
  const [conf, setConf] = useState({});
  const confDe = (k) => conf[k] ?? (sistema[k] ?? 0).toFixed(2);

  const setMetodo = (k, v) => setConf(prev => ({ ...prev, [k]: v }));

  // O esperado em caixa é a soma da coluna "Sistema" — só entra o que tem
  // linha para conferir. Antes era `totalVendas + fundo`, que incluía o valor
  // de método NÃO configurado (fiado, método removido da config): esse valor
  // não tem campo onde ser digitado, então o caixa exato era acusado de falta
  // pelo valor inteiro do método, e a falsa falta ficava gravada no
  // fechamento. round2 em toda ponta: sem ele, 16.10 × 3 dá 48.300000000000004
  // e o caixa conferido no centavo aparecia em vermelho como "Falta R$ 0.00".
  const totalSistema   = round2(meios.reduce((s, k) => s + (sistema[k] ?? 0), 0));
  const totalConferido = round2(meios.reduce((s, k) => s + parsVal(confDe(k)), 0));
  const diferencaTotal = round2(totalConferido - totalSistema);
  const situacao       = situacaoCaixa(diferencaTotal);
  const totalNaoMapeado = round2(Object.values(naoMapeados).reduce((s, v) => s + v, 0));

  const handleConfirm = async () => {
    if (salvando) return;
    setSalvando(true);
    const conferidoPorMetodo = {};
    meios.forEach(k => { conferidoPorMetodo[k] = parsVal(confDe(k)); });
    try {
      // `totalEsperado` é o que o relatório, a exportação e o Jarvas precisam
      // para não recalcularem `totalVendas + fundo` e ressuscitarem a falsa
      // falta dos métodos sem linha de conferência.
      const resultado = await onConfirm({
        totalVendas, totalEsperado: totalSistema, totalConferido, conferidoPorMetodo,
        observacao: observacao.trim() || null,
      });
      // Quem chama mantém o modal aberto no erro; aqui só avançamos para o
      // comprovante quando o fechamento foi de fato gravado.
      if (resultado?.error) return;
      const porMetodo = meios.map(metodo => ({
        rotulo: METODOS_POR_ID[metodo]?.label ?? rotuloMetodo(metodo, customLabels),
        sistema: sistema[metodo] ?? 0,
        conferido: parsVal(confDe(metodo)),
      }));
      setRegistrado({
        totalVendas,
        fundo: fundoAtual,
        suprimentos,
        sangrias,
        totalEsperado: totalSistema,
        totalConferido,
        diferenca: diferencaTotal,
        situacao,
        porMetodo,
        observacao: observacao.trim() || null,
      });
    } finally {
      // Quem chama mantém o modal aberto quando a gravação falha, para o
      // operador saber que NÃO registrou. Sem liberar o botão aqui, o "tente
      // novamente" do aviso era impossível: travava em "Fechando..." de vez.
      setSalvando(false);
    }
  };

  return (
    <div
      {...fecharAoClicarFora(onClose)}
      className="fechamento-modal"
    >
      <div className="fechamento-modal__caixa">

        {registrado ? (
          <>
            {/* Passo de sucesso — caixa fechado, agora o comprovante */}
            <div className="fechamento-modal__sucesso">
              <div className="fechamento-modal__sucesso-icone">
                <LuLock size={22} />
              </div>
              <div>
                <div className="fechamento-modal__sucesso-titulo">Caixa fechado</div>
                <div className="fechamento-modal__sucesso-sub">
                  {ROTULO_SITUACAO[registrado.situacao]} · conferido {fmtR(registrado.totalConferido)}
                </div>
              </div>
            </div>

            <ImprimirComprovanteCaixa
              montarDocumento={(configImpressao) => montarComprovanteFechamento({
                ...registrado,
                autor: currentUser?.name,
                tenant,
                configImpressao,
              })}
            />

            <button
              type="button"
              onClick={onClose}
              className="fechamento-modal__concluir"
            >
              Concluir
            </button>
          </>
        ) : (
        <>
        {/* Header */}
        <div className="fechamento-modal__topo">
          <div className="fechamento-modal__icone">
            <LuLock size={22} />
          </div>
          <div>
            <div className="fechamento-modal__titulo">Fechar Caixa</div>
            <div className="fechamento-modal__subtitulo">
              {hoje.length} venda{hoje.length !== 1 ? "s" : ""} hoje · confira e ajuste os valores se necessário
            </div>
          </div>
        </div>

        {/* Tabela de conferência */}
        <div className="fechamento-modal__tabela">
          {/* Cabeçalho da tabela */}
          <div className="fechamento-modal__tabela-cabecalho">
            <span>Método</span>
            <span className="fechamento-modal__col-direita">Sistema</span>
            <span className="fechamento-modal__col-direita fechamento-modal__col-conferido">
              <LuPencil size={10} /> Conferido
            </span>
          </div>

          {meios.map(metodo => {
            const { Icon, label } = METODOS_POR_ID[metodo] ?? { label: rotuloMetodo(metodo, customLabels), Icon: LuBanknote };
            const sistemaVal = sistema[metodo] ?? 0;
            const confVal    = parsVal(confDe(metodo));
            const diff       = round2(confVal - sistemaVal);
            const hasDiff    = Math.abs(diff) > TOLERANCIA_CENTAVO;
            const isPositive = diff >= 0;
            const sinal      = isPositive ? "sobra" : "falta";

            return (
              <div key={metodo} className="fechamento-modal__linha">
                <div className="fechamento-modal__linha-grade">
                  {/* Nome do método */}
                  <div>
                    <div className="fechamento-modal__metodo-nome">
                      <Icon size={15} className="fechamento-modal__metodo-icone" />
                      {label}
                    </div>
                    {metodo === "dinheiro" && (
                      <div className="fechamento-modal__fundo-nota">
                        inclui fundo {fmtR(fundoAtual)}
                        {/* Sem dizer aqui de onde veio o desconto, o operador
                            só via um esperado menor e não sabia por quê. */}
                        {sangrias    > 0 && <> · − retiradas {fmtR(sangrias)}</>}
                        {suprimentos > 0 && <> · + reforços {fmtR(suprimentos)}</>}
                      </div>
                    )}
                  </div>

                  {/* Valor sistema (read-only) */}
                  <div className="fechamento-modal__valor-sistema">
                    {fmtR(sistemaVal)}
                  </div>

                  {/* Input conferido */}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={confDe(metodo)}
                    onChange={e => setMetodo(metodo, e.target.value)}
                    className={`fechamento-modal__input-conferido${hasDiff ? ` fechamento-modal__input-conferido--${sinal}` : ""}`}
                  />
                </div>

                {/* Diferença por linha */}
                {hasDiff && (
                  <div className={`fechamento-modal__diferenca-linha fechamento-modal__diferenca-linha--${sinal}`}>
                    {isPositive ? "+" : ""}{fmtR(diff)} {isPositive ? "sobra" : "falta"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Banner de métodos não mapeados */}
        {Object.keys(naoMapeados).length > 0 && (
          <div className="fechamento-modal__banner">
            <LuTriangleAlert size={16} className="fechamento-modal__banner-icone" />
            <div className="fechamento-modal__banner-texto">
              <strong>
                R$ {totalNaoMapeado.toFixed(2)} em métodos não configurados:
              </strong>{" "}
              {Object.entries(naoMapeados).map(([metodo, valor], i, arr) =>
                `${rotuloMetodo(metodo, customLabels)} (R$ ${valor.toFixed(2)})${i < arr.length - 1 ? ", " : ""}`
              ).join("")}
              {/* Sem esta frase o operador via o aviso e não entendia por que a
                  diferença não fechava — agora fica claro que o valor está
                  fora da conferência, e o que fazer para trazê-lo para dentro. */}
              <div className="fechamento-modal__banner-ajuda">
                Fica fora da conferência do caixa. Ative o método em Configurações para conferi-lo aqui.
              </div>
            </div>
          </div>
        )}

        {/* Resumo */}
        <div className="fechamento-modal__resumo">
          <Row label="Total de Vendas (sistema)" value={fmtR(totalVendas)} muted />
          <Row label={`Fundo de Caixa`} value={fmtR(fundoAtual)} muted />
          {/* F005 — as duas parcelas do meio da fórmula do CAIXA.md só
              aparecem quando existem, para não poluir o caixa que não
              movimentou nada. */}
          {suprimentos > 0 && <Row label="Reforços de troco (entrou)" value={`+ ${fmtR(suprimentos)}`} muted />}
          {sangrias    > 0 && <Row label="Retiradas do caixa (saiu)"  value={`− ${fmtR(sangrias)}`}    muted />}
          <div className="fechamento-modal__linha-resumo fechamento-modal__linha-resumo--esperado">
            <span className="fechamento-modal__total-esperado-label">Total Esperado em Caixa</span>
            <span className="fechamento-modal__total-esperado-valor">{fmtR(totalSistema)}</span>
          </div>
          <div className="fechamento-modal__linha-resumo">
            <span className="fechamento-modal__total-conferido-label">Total Conferido</span>
            <span className="fechamento-modal__total-conferido-valor">{fmtR(totalConferido)}</span>
          </div>

          {/* Diferença total */}
          <div className={`fechamento-modal__diferenca fechamento-modal__diferenca--${situacao === "falta" ? "falta" : "ok"}`}>
            <span className="fechamento-modal__diferenca-label">
              {ROTULO_SITUACAO[situacao]}
            </span>
            <span className="fechamento-modal__diferenca-valor">
              {situacao === "sobra" ? "+" : ""}{fmtR(diferencaTotal)}
            </span>
          </div>
        </div>

        {/* Observação */}
        <div className="fechamento-modal__obs">
          <div className="fechamento-modal__obs-label">
            Observação (opcional)
          </div>
          <textarea
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            placeholder="Ex: sobra de R$ 10 devolvida ao caixa, cliente X pagou amanhã..."
            maxLength={400}
            rows={3}
            className={`fechamento-modal__obs-textarea${observacao ? " fechamento-modal__obs-textarea--preenchida" : ""}`}
          />
          {observacao && (
            <div className="fechamento-modal__obs-contador">
              {observacao.length}/400
            </div>
          )}
        </div>

        {/* Botões */}
        <div className="fechamento-modal__botoes">
          <button
            onClick={onClose}
            className="fechamento-modal__btn-cancelar"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={salvando}
            className="fechamento-modal__btn-confirmar"
          >
            {salvando ? "Fechando..." : <><LuLock size={14} />Confirmar Fechamento</>}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div className="fechamento-modal__linha-resumo">
      <span className="fechamento-modal__row-label">{label}</span>
      <span className={`fechamento-modal__row-valor${muted ? " fechamento-modal__row-valor--apagado" : ""}`}>{value}</span>
    </div>
  );
}
