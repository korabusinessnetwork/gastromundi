import { useState, useEffect } from "react";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuWallet } from "react-icons/lu";
import { useSessao, useOffline, useConfig } from "@/context/AppContext";
import { verificarSenhaAdmin } from "@/lib/adminAuth";
import { buscarClientePorId } from "@/lib/clientes";
import { ajusteExigeSenha, validarAjuste } from "@/features/caixa/regras/vendas";
// TD015: no split, cada entrada de pagamento é adicionada e removida do meio da
// lista, e cada uma carrega estado próprio de tela (o método selecionado, o campo de
// valor com foco). A chave não pode ser a posição. O `uid` vive só no state daqui:
// `buildPayloadPagamentos` e `buildPrintPagamentos` montam campo a campo, então ele
// não chega à venda nem ao cupom.
import { novoUid } from "@/lib/uidLista";
import { METODOS_PADRAO, metodoBloqueadoSemRede, trocoEmDinheiro } from "@/features/pdv/regras/pagamento";
import { METODOS_CATALOG } from "@/constants/metodosPagamento";
import { useEstadoAjusteCheckout } from "./useEstadoAjusteCheckout";
import { useEstadoRemocaoCheckout } from "./useEstadoRemocaoCheckout";
import { itensNaoCancelados } from "@/lib/comandaItens";

// Estado e ações da finalização da comanda: pagamentos, divisão, taxa de serviço,
// desconto e acréscimo, cliente, CPF na nota e remoção de item.
export function useCheckout({ comanda, items, onConfirm, onBack, onRemoverItem }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { currentUser, addonHabilitado } = useSessao();
  const { redeOnline } = useOffline();
  const { meiosPagamento, metodosCustom, taxaServico, metodosTef } = useConfig();
  const catalogCompleto = [
    ...METODOS_CATALOG,
    ...(metodosCustom ?? []).map(m => ({ ...m, Icon: LuWallet })),
  ];
  const ativos = meiosPagamento?.length ? meiosPagamento : METODOS_PADRAO;
  const METODOS = ativos.map(id => catalogCompleto.find(m => m.id === id)).filter(Boolean);

  const [pagamentos,    setPagamentos]    = useState([{ metodo: null, valor: 0, recebido: 0, uid: novoUid() }]);
  const [showDivisor,   setShowDivisor]   = useState(false);
  const [nPessoas,      setNPessoas]      = useState(2);
  const [confirmando,   setConfirmando]   = useState(false);
  const [erroConfirmar, setErroConfirmar] = useState("");
  const [aplicarTaxa,   setAplicarTaxa]   = useState(!!taxaServico);

  const {
    showAjuste, setShowAjuste, ajusteTipo, setAjusteTipo, ajusteMode, setAjusteMode, ajusteValor,
    setAjusteValor, ajusteAplicado, setAjusteAplicado, ajusteSenha, setAjusteSenha,
    ajusteSenhaErro, setAjusteSenhaErro, ajusteSenhaVis, setAjusteSenhaVis, aplicandoAjuste,
    setAplicandoAjuste,
  } = useEstadoAjusteCheckout();

  // F010 — cliente do fiado (fiado exige cliente identificado)
  const [clienteFiado, setClienteFiado] = useState(null);

  // Cliente vinculado à comanda (botão "Cliente" no PDV): pré-preenche o
  // cliente do checkout — identifica a venda (histórico), pré-satisfaz o
  // fiado e pré-preenche o CPF na nota. Busca o cadastro completo pelo id
  // (pending guarda só id+nome); não sobrescreve uma escolha manual.
  useEffect(() => {
    if (!comanda?.cliente_id) return;
    let ativo = true;
    buscarClientePorId(comanda.cliente_id).then(({ data }) => {
      if (ativo && data) setClienteFiado((prev) => prev ?? data);
    });
    return () => { ativo = false; };
  }, [comanda?.cliente_id]);

  // Etapa "CPF na nota" — em toda venda com nota (add-on nfe), antes de emitir
  // a NFC-e o operador informa o CPF/CNPJ do cliente ou deixa em branco.
  const [cpfNotaAberto, setCpfNotaAberto] = useState(false);

  const {
    modoRemocao, setModoRemocao, remocao, setRemocao, remSenha, setRemSenha, remSenhaErro,
    setRemSenhaErro, remSenhaVis, setRemSenhaVis, remErro, setRemErro, removendo, setRemovendo,
  } = useEstadoRemocaoCheckout();

  // Agrupa itens ativos pelo mesmo produto (name + price), somando qty e unindo obs
  const itensAgrupados = itensNaoCancelados(items).reduce((acc, item) => {
    const chave = `${item.name}||${item.price}`;
    const obs   = Array.isArray(item.obs) ? item.obs : (item.obs ? [item.obs] : []);
    if (acc[chave]) {
      acc[chave].qty += (item.qty ?? 1);
      obs.forEach(o => { if (!acc[chave].obs.includes(o)) acc[chave].obs.push(o); });
    } else {
      acc[chave] = { ...item, qty: item.qty ?? 1, obs };
    }
    return acc;
  }, {});
  const itensVisiveis = Object.values(itensAgrupados);

  // Todo valor cobrado é arredondado a centavos: taxa de 10% e ajuste
  // percentual geram frações de centavo que estouravam a tolerância do
  // split e chegavam ao pagamento com casas fantasma.
  const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

  const subtotal      = round2(itensVisiveis.reduce((s, i) => s + i.price * i.qty, 0));
  const valorTaxa     = aplicarTaxa ? round2(subtotal * 0.10) : 0;
  const baseComTaxa   = round2(subtotal + valorTaxa);

  const calcAjuste = (base, aj) => {
    if (!aj) return 0;
    const v = parseFloat(aj.valor) || 0;
    const val = aj.mode === "percentual" ? base * (v / 100) : v;
    return round2(aj.tipo === "desconto" ? -val : val);
  };
  const valorAjuste   = calcAjuste(baseComTaxa, ajusteAplicado);
  const total         = round2(Math.max(0, baseComTaxa + valorAjuste));

  // Prevenção > mensagem de erro: a validade do ajuste que está sendo digitado
  // governa o botão Aplicar e o Enter, e o motivo aparece na hora. Sem isso,
  // 150 no modo Percentual (o padrão) zerava a conta calado — o `max="100"` do
  // input é só dica de HTML, não impede digitar.
  const ajusteValidacao = validarAjuste({ tipo: ajusteTipo, mode: ajusteMode, valor: ajusteValor }, baseComTaxa);
  const podeAplicarAjuste = ajusteValidacao.valido;
  // Campo vazio não é erro do operador — é o estado inicial. Só reclama de
  // um valor de fato digitado e fora do limite.
  const ajusteErroVisivel = parseFloat(ajusteValor) > 0 ? ajusteValidacao.erro : null;

  // Desconto só sai com senha de gerente/admin — a mesma trava que remover um
  // item já tinha neste checkout. Acréscimo segue livre (aumenta o total).
  const ajusteExigeAutorizacao = ajusteExigeSenha({ tipo: ajusteTipo });
  const podeConfirmarAjuste =
    podeAplicarAjuste && !aplicandoAjuste && (!ajusteExigeAutorizacao || !!ajusteSenha.trim());

  const isSplit = pagamentos.length > 1;

  // Single-mode helpers (pagamentos[0] with total auto-synced)
  const singleMetodo   = pagamentos[0]?.metodo ?? null;
  const singleRecebido = pagamentos[0]?.recebido ?? 0;
  const singleTroco    = singleMetodo === "dinheiro" ? singleRecebido - total : 0;

  // Aggregated sum for split mode
  const somaValores = pagamentos.reduce((s, p) => s + (p.valor || 0), 0);
  const faltaAlocar = total - somaValores;

  const usaFiado = pagamentos.some(p => p.metodo === "fiado");

  // Prevenção > erro: sem internet, métodos que passam pela maquininha
  // (TEF) ficam desabilitados na hora de escolher — em vez de deixar
  // selecionar e falhar na confirmação. Só vale com o add-on TEF ativo.
  const metodoIndisponivelOffline = (id) =>
    metodoBloqueadoSemRede(id, { redeOnline, tefLigado: addonHabilitado?.("tef"), metodosTef });
  const tefOffline = pagamentos.some(p => p.metodo && metodoIndisponivelOffline(p.metodo));

  // Dinheiro com "Recebido" digitado abaixo do que aquele pagamento cobre
  // não pode confirmar — a tela já mostra "Falta: R$ x" e o botão guia.
  // Recebido em branco (0) segue valendo como "valor exato".
  // Vale nos DOIS modos: no split a trava existia desde sempre, mas no
  // pagamento único ela ficava de fora e o caixa conseguia fechar uma conta
  // de R$ 80 com R$ 50 na mão — a venda entrava cheia e o caixa nascia com
  // R$ 30 de furo, sem nada na tela dizendo que faltou. É a mesma regra do
  // PDV mobile (PdvModulo: `!ehDinheiro || recebidoNum >= total`).
  // `!== 0` e não `> 0`: valor negativo também é valor digitado. Com `> 0` um
  // "-50" escapava da trava inteira e liberava a confirmação (o campo já
  // impede digitar negativo, isto aqui é a segunda tranca).
  const dinheiroInsuficiente = isSplit
    ? pagamentos.some(
        p => p.metodo === "dinheiro" && (p.recebido || 0) !== 0 && p.recebido < p.valor - 0.005
      )
    : singleMetodo === "dinheiro" && singleRecebido !== 0 && singleRecebido < total - 0.005;

  // Quanto falta de dinheiro na mão, para o aviso do botão dizer o número em
  // vez de mandar "selecione a forma de pagamento" (que já está selecionada).
  const faltaEmDinheiro = round2(isSplit
    ? pagamentos.reduce((s, p) => s + (
        p.metodo === "dinheiro" && (p.recebido || 0) > 0 && p.recebido < p.valor - 0.005
          ? p.valor - p.recebido : 0
      ), 0)
    : Math.max(0, total - singleRecebido));

  // Tolerância de meio centavo (só ruído de float): com round2 em tudo,
  // 1 centavo não alocado é diferença real e deve bloquear a confirmação.
  const podeConfirmar = itensVisiveis.length > 0 && (isSplit
    ? pagamentos.every(p => !!p.metodo) && Math.abs(faltaAlocar) < 0.005
    : !!singleMetodo) && !dinheiroInsuficiente && (!usaFiado || !!clienteFiado) && !tefOffline;

  const updatePagamento = (idx, patch) =>
    setPagamentos(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));

  const removePagamento = (idx) =>
    setPagamentos(prev => prev.filter((_, i) => i !== idx));

  const addPagamento = () => {
    setPagamentos(prev => {
      const soma = prev.reduce((s, p) => s + (p.valor || 0), 0);
      const restante = parseFloat(Math.max(0, total - soma).toFixed(2));
      return [...prev, { metodo: null, valor: restante, recebido: 0, uid: novoUid() }];
    });
  };

  const dividirPagamento = (n) => {
    const totalCents = Math.round(total * 100);
    const base = Math.floor(totalCents / n);
    const resto = totalCents - base * n;
    const valores = Array.from({ length: n }, (_, i) => parseFloat(((i < resto ? base + 1 : base) / 100).toFixed(2)));
    setPagamentos(valores.map(v => ({ metodo: null, valor: v, recebido: 0, uid: novoUid() })));
    setShowDivisor(false);
  };

  const voltarParaUnico = () => {
    setPagamentos(prev => [{ metodo: prev[0]?.metodo ?? null, valor: total, recebido: 0, uid: prev[0]?.uid ?? novoUid() }]);
    setShowDivisor(false);
  };

  const abrirAjuste = () => {
    setAjusteValor(ajusteAplicado?.valor ?? "");
    setAjusteTipo(ajusteAplicado?.tipo ?? "desconto");
    setAjusteMode(ajusteAplicado?.mode ?? "percentual");
    setAjusteSenha("");
    setAjusteSenhaErro("");
    setAjusteSenhaVis(false);
    setShowAjuste(true);
  };

  // A senha não fica guardada em memória depois que o popup fecha.
  const fecharAjuste = () => {
    setShowAjuste(false);
    setAjusteSenha("");
    setAjusteSenhaErro("");
    setAjusteSenhaVis(false);
  };

  // Aplica o desconto/acréscimo. No desconto, a senha é conferida ANTES —
  // se não confere, o popup continua aberto com o motivo e nada é aplicado.
  const aplicarAjuste = async () => {
    if (!podeConfirmarAjuste) return;
    const ajuste = { tipo: ajusteTipo, mode: ajusteMode, valor: ajusteValor };

    if (!ajusteExigeAutorizacao) {
      setAjusteAplicado(ajuste);
      fecharAjuste();
      return;
    }

    setAplicandoAjuste(true);
    setAjusteSenhaErro("");
    try {
      const { ok, erro } = await verificarSenhaAdmin(ajusteSenha);
      if (!ok) {
        setAjusteSenhaErro(erro || "Senha incorreta. Apenas admin ou gerente pode dar desconto.");
        return;
      }
      setAjusteAplicado(ajuste);
      fecharAjuste();
    } finally {
      setAplicandoAjuste(false);
    }
  };

  // Leva 15.1 — abre o popup de remoção para um item agrupado da lista
  const abrirRemocao = (item) => {
    setRemocao({ item, qtyMax: item.qty, qtySel: 1, motivo: "" });
    setRemSenha("");
    setRemSenhaErro("");
    setRemSenhaVis(false);
    setRemErro("");
  };

  const confirmarRemocao = async () => {
    if (!remocao || removendo) return;
    if (!remocao.motivo.trim() || !remSenha.trim()) return;
    setRemovendo(true);
    setRemErro("");
    try {
      const { ok, erro } = await verificarSenhaAdmin(remSenha);
      if (!ok) {
        setRemSenhaErro(erro || "Senha incorreta. Apenas admin ou gerente pode cancelar itens.");
        return;
      }
      const { error } = await onRemoverItem(
        { name: remocao.item.name, price: remocao.item.price },
        remocao.qtySel,
        remocao.motivo.trim()
      );
      if (error) {
        setRemErro("Não foi possível remover o item. Tente novamente.");
        return;
      }
      // Removeu tudo que estava na lista? Sai do modo de remoção.
      const removeuTudo = itensVisiveis.length === 1 && remocao.qtySel >= remocao.qtyMax;
      if (removeuTudo) setModoRemocao(false);
      setRemocao(null);
    } finally {
      setRemovendo(false);
    }
  };

  const buildPayloadPagamentos = () => isSplit
    ? pagamentos.map(p => ({
        metodo:   p.metodo,
        valor:    p.valor,
        recebido: p.metodo === "dinheiro" ? (p.recebido || 0) : 0,
        troco:    p.metodo === "dinheiro" ? trocoEmDinheiro(p.recebido, p.valor) : 0,
      }))
    : [{ metodo: singleMetodo, valor: total, recebido: singleRecebido, troco: singleMetodo === "dinheiro" ? trocoEmDinheiro(singleRecebido, total) : 0 }];

  // Finaliza de fato a venda. `dest` é o destinatário fiscal (CPF/CNPJ na nota)
  // resolvido na etapa "CPF na nota": objeto = documento informado, null = nota
  // anônima. `undefined` (venda sem NFC-e) deixa o hook puxar o documento do
  // cliente vinculado automaticamente, como antes.
  const finalizar = async (dest) => {
    if (confirmando) return;
    setConfirmando(true);
    setErroConfirmar("");
    const payloadPagamentos = buildPayloadPagamentos();
    try {
      // clienteId = vínculo persistido da venda (Financeiro/fiado); cliente =
      // o objeto completo, usado só para puxar o CPF/CNPJ do destinatário da
      // NFC-e automaticamente (destDoCliente). Quando não há cliente, ambos
      // ficam nulos e a nota sai anônima, como antes.
      const resultado = await onConfirm({ pagamentos: payloadPagamentos, total, taxaServico: aplicarTaxa, valorTaxa, ajuste: ajusteAplicado, valorAjuste, clienteId: clienteFiado?.id ?? null, cliente: clienteFiado ?? null, dest });
      if (resultado?.error) {
        setErroConfirmar(resultado.error?.message || "Não foi possível registrar o pagamento. Tente novamente.");
      }
    } catch (err) {
      setErroConfirmar(err?.message || "Não foi possível registrar o pagamento. Tente novamente.");
    } finally {
      // Sucesso navega para fora do checkout (setState pós-desmonte é no-op
      // no React 18); em falha o botão volta a ficar clicável em vez de
      // travar em "Processando..." para sempre.
      setConfirmando(false);
    }
  };

  const handleConfirm = () => {
    if (!podeConfirmar || confirmando || cpfNotaAberto) return;
    setErroConfirmar("");
    // Toda venda com nota (add-on nfe) passa pela etapa "CPF na nota" antes de
    // emitir — inclusive cartão/TEF. O operador informa o documento do cliente
    // ou deixa em branco (nota anônima); só então a venda é finalizada.
    if (addonHabilitado?.("nfe")) {
      setCpfNotaAberto(true);
      return;
    }
    // Sem NFC-e: finaliza direto (fluxo idêntico a antes desta etapa existir).
    finalizar(undefined);
  };

  // Etapa "CPF na nota" concluída: fecha a etapa e finaliza com o dest resolvido
  // (documento informado ou null para nota anônima).
  const confirmarCpfNota = (dest) => {
    setCpfNotaAberto(false);
    finalizar(dest);
  };

  const buildPrintPagamentos = () => {
    if (isSplit) {
      return pagamentos.map(p => ({
        metodo:   p.metodo,
        valor:    p.valor,
        recebido: p.metodo === "dinheiro" ? (p.recebido || 0) : 0,
        troco:    p.metodo === "dinheiro" ? trocoEmDinheiro(p.recebido, p.valor) : 0,
      }));
    }
    return [{ metodo: singleMetodo, valor: total, recebido: singleRecebido, troco: singleMetodo === "dinheiro" ? trocoEmDinheiro(singleRecebido, total) : 0 }];
  };

  // F015 — dados para os templates de impressão (comprovante/pré-nota).
  const montarVendaParaImpressao = () => ({
    comanda: comanda?.comanda,
    items: itensVisiveis,
    valorTaxa,
    ajuste: ajusteAplicado,
    valorAjuste,
    total,
    pagamentos: buildPrintPagamentos(),
  });

  const isMob = sz.checkoutResumo === 0;

  return {
    pagamentos, setPagamentos, showDivisor, setShowDivisor, nPessoas, setNPessoas, confirmando,
    setConfirmando, erroConfirmar, setErroConfirmar, aplicarTaxa, setAplicarTaxa, clienteFiado,
    setClienteFiado, cpfNotaAberto, setCpfNotaAberto, width, currentUser, addonHabilitado,
    redeOnline, meiosPagamento, metodosCustom, taxaServico, metodosTef, showAjuste,
    setShowAjuste, ajusteTipo, setAjusteTipo, ajusteMode, setAjusteMode, ajusteValor,
    setAjusteValor, ajusteAplicado, setAjusteAplicado, ajusteSenha, setAjusteSenha,
    ajusteSenhaErro, setAjusteSenhaErro, ajusteSenhaVis, setAjusteSenhaVis, aplicandoAjuste,
    setAplicandoAjuste, modoRemocao, setModoRemocao, remocao, setRemocao, remSenha, setRemSenha,
    remSenhaErro, setRemSenhaErro, remSenhaVis, setRemSenhaVis, remErro, setRemErro, removendo,
    setRemovendo, sz, catalogCompleto, ativos, METODOS, itensAgrupados, itensVisiveis, round2,
    subtotal, valorTaxa, baseComTaxa, calcAjuste, valorAjuste, total, ajusteValidacao,
    podeAplicarAjuste, ajusteErroVisivel, ajusteExigeAutorizacao, podeConfirmarAjuste, isSplit,
    singleMetodo, singleRecebido, singleTroco, somaValores, faltaAlocar, usaFiado,
    metodoIndisponivelOffline, tefOffline, dinheiroInsuficiente, faltaEmDinheiro, podeConfirmar,
    updatePagamento, removePagamento, addPagamento, dividirPagamento, voltarParaUnico,
    abrirAjuste, fecharAjuste, aplicarAjuste, abrirRemocao, confirmarRemocao,
    buildPayloadPagamentos, finalizar, handleConfirm, confirmarCpfNota, buildPrintPagamentos,
    montarVendaParaImpressao, isMob, comanda, items, onConfirm, onBack, onRemoverItem,
  };
}
