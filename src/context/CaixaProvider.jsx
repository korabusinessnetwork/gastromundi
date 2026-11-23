import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CaixaContext } from "./CaixaContext";
import { useFuncaoEstavel } from "@/hooks/useFuncaoEstavel";
import { useOffline } from "./OfflineContext";
import { useSessao } from "./SessaoContext";
import { gravarConfig } from "./gravarConfig";
import { gravarVendaNormalizada, marcarVendaCancelada, assinarVendas } from "@/features/caixa/dados/vendas";
import { gravarFechamento, registrarMovimento, excluirLancamentosDaVenda } from "@/features/caixa/dados/caixa";
import { lerValor, validarMovimento } from "@/lib/caixaMovimentos";
import { emitirEvento } from "@/lib/jarvas";
import { logAction } from "@/lib/logger";
import { isErroDeRede } from "@/lib/offline/rede";
import { reportarFalha, reportarInconsistencia } from "@/lib/observabilidade";
import { sanitizeInput } from "@/utils/crypto";

// Postgres: coluna inexistente (migration ainda não aplicada). A carga, no
// AppContext, usa o mesmo código para o mesmo caso.
const PG_COLUNA_INEXISTENTE = "42703";

/**
 * Dono do estado do caixa (tarefa 2.9 do plano de refatoração): vendas,
 * fechamentos, fundo, abertura e sessão do caixa, sangrias e suprimentos, as
 * ações de vender, cancelar venda, fechar o caixa e registrar movimento, e o
 * tempo real das vendas entre caixas.
 *
 * Quem lê ou age usa `useCaixa()`. Quem CARREGA (a abertura do app, do banco
 * ou da cópia offline) usa o canal interno `useCaixaCarga()`, que só o
 * `AppProvider` deve chamar.
 *
 * O usuário logado vem do `SessaoProvider` e a fila offline do `OfflineProvider`,
 * os dois por fora deste.
 */
const CaixaCargaContext = createContext(null);

export function useCaixaCarga() {
  const ctx = useContext(CaixaCargaContext);
  if (!ctx) throw new Error("useCaixaCarga deve ser usado dentro de <CaixaProvider>");
  return ctx;
}

export function CaixaProvider({ children }) {
  // O usuário logado mora no SessaoProvider, por fora deste (tarefa 2.9).
  const { currentUser } = useSessao();
  // A fila offline mora no OfflineProvider, por fora deste (tarefa 2.9).
  const { enfileirarOffline } = useOffline();
  const [sales,       setSalesLocal]       = useState([]);
  const [fechamentos, setFechamentosLocal] = useState([]);
  const [fundoAtual,      setFundoAtualLocal]    = useState(0);
  const [caixaAberto,     setCaixaAbertoLocal]   = useState(true);
  const [sessaoAbertaEm,  setSessaoAbertaEmLocal] = useState(null);
  const [movimentosCaixa, setMovimentosCaixaLocal] = useState([]);

  // ── Actions: Sales ────────────────────────────────────────────
  // TD009 (etapa 3) — a venda é gravada SÓ nas tabelas relacionais.
  // `sales` era a fonte de verdade e a gravação relacional era backup
  // fire-and-forget; invertida a fonte, o contrato inverteu junto: aqui se
  // espera o resultado e se decide a partir dele.
  const addSale = async (sale) => {
    setSalesLocal(prev => [sale, ...prev]);

    const resultado = await gravarVendaNormalizada(sale, {
      onFalha: ({ etapa, error, venda_id }) => {
        // Sem internet a venda vai para a fila offline logo abaixo e sobe
        // depois: caminho previsto, não inconsistência. Registrar aqui
        // encheria a trilha do Jarvas toda vez que o wi-fi do salão cai.
        if (isErroDeRede(error)) return;
        console.error(`gravação de venda (${etapa}) venda ${venda_id}:`, error);
        reportarFalha(error, { acao: "persistirVendaNormalizada", etapa, tabela: "vendas", venda_id });
        // Trilha durável: em vez de só console, deixa rastro pro Jarvas.
        emitirEvento("venda.gravacao.incompleta", "pdv", {
          venda_id,
          etapa,
          erro: error?.message ?? error?.code ?? String(error),
        }, currentUser?.username);
      },
    });

    if (!resultado.cabecalhoGravado) {
      const error = resultado.falhas[0]?.error ?? { message: "Falha ao gravar a venda." };
      // Sem internet (métodos não-TEF): a venda fica na fila local e sobe
      // sozinha quando a conexão voltar. O evento fica para o reenvio
      // confirmado (executarOpOffline), senão duplicaria.
      if (isErroDeRede(error)) {
        enfileirarOffline({ tipo: "insert_venda", payload: { id: sale.id, data: sale } });
        return { error: null, offline: true };
      }
      // A2 da auditoria — a venda NÃO existe no banco (RLS, constraint...).
      // Sem desfazer o otimista ela continuava somando no Saldo do Dia até
      // alguém recarregar a página: o caixa fechava o dia com dinheiro que
      // nunca foi gravado. addPending/updatePending/removePending já
      // desfaziam; a única ação que mexe em dinheiro era a que não desfazia.
      // (o reportarFalha já saiu no onFalha acima, com a etapa que falhou)
      setSalesLocal(prev => prev.filter(v => v.id !== sale.id));
      console.error("addSale error:", JSON.stringify(error, null, 2));
      throw error;
    }

    // Cabeçalho gravou e uma filha falhou: a venda EXISTE e está incompleta.
    // Não se desfaz nem se lança — mandar o operador refazer duplicaria a
    // receita. A inconsistência já foi registrada no onFalha acima, e o
    // retorno diz a verdade sobre o dinheiro: a venda aconteceu.
    // `jaExistia` cobre o clique duplo em finalizar: venda já gravada não
    // vira um segundo `venda.finalizada` para o Jarvas.
    if (!resultado.jaExistia) {
      emitirEvento("venda.finalizada", "pdv", {
        venda_id: sale.id,
        total: sale.total ?? null,
        metodo: sale.metodo ?? sale.payment ?? null,
        itens: Array.isArray(sale.items) ? sale.items.length : null,
      }, currentUser?.username);
    }

    // Mesmo contrato das demais actions: { error } sempre presente.
    return { error: null };
  };

  // Leva 15.3 — cancela uma venda já fechada (comanda fechada).
  //
  // TD009 (etapa 3): cancelar virou MARCA em `vendas`, não remoção.
  // Antes o cancelamento marcava `data.cancelada` no blob de `sales` e
  // APAGAVA as linhas relacionais: o blob guardava a auditoria e apagar as
  // linhas tirava a venda dos relatórios sem precisar de migration. Sem o
  // blob, apagar as linhas apagaria a venda cancelada do banco inteiro.
  // Agora as quatro colunas de `vendas` (migration 20260920) guardam o
  // estado, e itens e pagamentos ficam de pé como trilha de auditoria.
  // Lançamentos financeiros continuam removidos: receita cancelada não é
  // receita.
  const cancelarVendaFechada = async (vendaId, motivo) => {
    const alvo = sales.find(s => s && s.id === vendaId);
    if (!alvo) return { error: { code: "venda_nao_encontrada", message: "Venda não encontrada." } };
    if (alvo.cancelada) return { error: { code: "ja_cancelada", message: "Esta venda já foi cancelada." } };

    const canceladaPor = currentUser?.name ?? currentUser?.username ?? null;
    const canceladaEm = new Date().toISOString();
    const cancelada = {
      ...alvo,
      cancelada: true,
      motivoCancelamento: motivo,
      canceladaPor,
      canceladaEm,
    };

    // .select() após o update: PostgREST devolve sucesso HTTP com 0 linhas
    // quando a RLS filtra tudo ou o id não existe (mesmo padrão do
    // updateUser) — sem checar, a UI fingiria que cancelou.
    const { data: linhas, error } = await marcarVendaCancelada(vendaId, { motivo, canceladaPor, canceladaEm });
    if (error) {
      // 42703 = coluna inexistente: a migration 20260920 não foi aplicada.
      // Falha explícita de propósito. Fingir sucesso seria pior que o erro:
      // o operador acharia que cancelou e a venda seguiria somando no
      // relatório. Não há fallback pelo caminho antigo — a venda nova nem
      // existe mais em `sales` para receber a marca no blob.
      if (error.code === PG_COLUNA_INEXISTENTE) {
        reportarInconsistencia("cancelamento sem a coluna no banco", { acao: "cancelarVendaFechada", tabela: "vendas", venda_id: vendaId });
        return { error: {
          code: "migration_pendente",
          message: "Cancelamento indisponível: a atualização do banco (20260920_vendas_cancelamento) ainda não foi aplicada. Avise o responsável pelo sistema.",
        } };
      }
      return { error };
    }
    if (!linhas || linhas.length === 0) {
      reportarInconsistencia("write afetou 0 linhas", { acao: "cancelarVendaFechada", tabela: "vendas", venda_id: vendaId });
      return { error: { code: "no_rows_updated", message: "Nenhuma linha atualizada, venda inexistente ou sem permissão." } };
    }

    const { error: eLanc } = await excluirLancamentosDaVenda(vendaId);
    if (eLanc) console.error("cancelarVendaFechada lancamentos:", eLanc);

    setSalesLocal(prev => prev.map(s => (s && s.id === vendaId ? cancelada : s)));

    logAction(currentUser?.username, "venda:cancelar", {
      msg: `Venda cancelada · ${alvo.comanda ?? vendaId} · R$ ${Number(alvo.total ?? 0).toFixed(2)} · motivo: ${motivo}`,
      name: currentUser?.name, role: currentUser?.role, venda_id: vendaId, motivo,
    });
    emitirEvento("venda.cancelada", "pdv", {
      venda_id: vendaId, total: alvo.total ?? null, motivo,
    }, currentUser?.username);
    return { error: null };
  };

  // ── Actions: Fechamentos ──────────────────────────────────────
  const addFechamento = async (f) => {
    setFechamentosLocal(prev => [f, ...prev]);
    const { error } = await gravarFechamento(f);
    if (error) {
      console.error("addFechamento error:", error);
      reportarFalha(error, { acao: "addFechamento", tabela: "fechamentos" });
      setFechamentosLocal(prev => prev.filter(x => x.id !== f.id));
      return { error };
    }
    emitirEvento("caixa.fechado", "caixa", {
      total_vendas: f?.totalVendas ?? null,
      total_conferido: f?.totalConferido ?? null,
    }, currentUser?.username);
    return { error: null };
  };

  // ── Actions: Movimentos de caixa (F005) ───────────────────────
  // Sangria (dinheiro sai) e suprimento (troco entra). Sem otimismo: só
  // entra no estado local depois que o banco confirmou — um movimento que
  // "existe" só na tela mudaria o valor esperado do fechamento sem lastro.
  const registrarMovimentoCaixa = async ({ tipo, valor, motivo, autorizadoPor, disponivel } = {}) => {
    // O botão só aparece com o caixa aberto, mas outro dispositivo pode ter
    // fechado o caixa com este modal já na tela: o movimento entraria numa
    // sessão que o fechamento não vai mais somar.
    if (!caixaAberto) {
      return { error: { message: "O caixa está fechado, abra o caixa antes de movimentar dinheiro." } };
    }

    const { ok, erro } = validarMovimento({ tipo, valor, motivo, disponivel });
    if (!ok) return { error: { message: erro } };

    const linha = {
      tipo,
      // O mesmo parser da validação: `validarMovimento` aceita "50,00" via
      // `lerValor`, e gravar com `Number` transformaria isso em NaN (→ null
      // no JSON → violação de NOT NULL). Também garante que o que persiste é
      // o valor arredondado que o usuário confirmou na tela.
      valor: lerValor(valor),
      motivo: sanitizeInput(String(motivo).trim()),
      autor: currentUser?.username ?? "",
      autorizado_por: autorizadoPor ? sanitizeInput(String(autorizadoPor)) : null,
      sessao_aberta_em: sessaoAbertaEm ?? null,
    };

    const { data, error } = await registrarMovimento(linha);

    if (error) {
      console.error("registrarMovimentoCaixa error:", error);
      reportarFalha(error, { acao: "registrarMovimentoCaixa", tabela: "caixa_movimentos", tipo });
      return { error };
    }

    setMovimentosCaixaLocal(prev => [data, ...prev]);
    emitirEvento(tipo === "sangria" ? "caixa.sangria" : "caixa.suprimento", "caixa", {
      valor: data.valor,
      autorizado: !!data.autorizado_por,
    }, currentUser?.username);
    logAction(currentUser?.username, `caixa:${tipo}`, {
      msg: `${tipo === "sangria" ? "Sangria" : "Suprimento"} de R$ ${Number(data.valor).toFixed(2)} · ${data.motivo}`,
      name: currentUser?.name,
      role: currentUser?.role,
      autorizado_por: data.autorizado_por,
    });
    return { error: null, movimento: data };
  };

  // ── Actions: Caixa em config (fundo, abertura, sessão) ─────────
  const setFundoAtual = async (val) => {
    const anterior = fundoAtual;
    setFundoAtualLocal(val);
    return gravarConfig("fundo_atual", val, () => setFundoAtualLocal(anterior));
  };

  const setCaixaAberto = async (val) => {
    const anterior = caixaAberto;
    setCaixaAbertoLocal(val);
    const res = await gravarConfig("caixa_aberto", val, () => setCaixaAbertoLocal(anterior));
    if (!res.error && val) emitirEvento("caixa.aberto", "caixa", {}, currentUser?.username);
    return res;
  };

  const setSessaoAbertaEm = async (val) => {
    const anterior = sessaoAbertaEm;
    setSessaoAbertaEmLocal(val);
    return gravarConfig("sessao_aberta_em", val, () => setSessaoAbertaEmLocal(anterior));
  };

  // ── Realtime: vendas fechadas (saldo do dia entre dispositivos) ──
  // Leva 15.4 — sem isso, cada caixa só enxergava as próprias vendas e o
  // Saldo do Dia / fechamento divergiam entre dispositivos (bug A4/TD010).
  // Requer Realtime habilitado na tabela `sales` (Database → Replication).
  useEffect(() => {
    return assinarVendas((payload) => {
        if (payload.eventType === "INSERT") {
          const venda = payload.new?.data;
          if (!venda?.id) return;
          setSalesLocal(prev => prev.find(s => s && s.id === venda.id) ? prev : [venda, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          // Cancelamento (15.3) e outras edições do blob propagam na hora.
          const venda = payload.new?.data;
          if (!venda?.id) return;
          setSalesLocal(prev => prev.map(s => (s && s.id === venda.id ? venda : s)));
        } else if (payload.eventType === "DELETE") {
          const id = payload.old?.id;
          if (id) setSalesLocal(prev => prev.filter(s => !s || s.id !== id));
        }
    });
  }, []);


  // ── Carga (só o AppProvider chama) ──────────────────────────────
  const valorCarga = useMemo(() => ({
    definirVendas: setSalesLocal,
    definirFechamentos: setFechamentosLocal,
    definirMovimentos: setMovimentosCaixaLocal,
    definirFundo: setFundoAtualLocal,
    definirCaixaAberto: setCaixaAbertoLocal,
    definirSessaoAbertaEm: setSessaoAbertaEmLocal,
  }), []);

  // ── Valor memorizado (ver as tarefas 2.2 e 2.7) ─────────────────
  // Vendas, fechamentos, fundo, abertura do caixa e sangrias/suprimentos.
  const addSaleEstavel                 = useFuncaoEstavel(addSale);
  const cancelarVendaFechadaEstavel    = useFuncaoEstavel(cancelarVendaFechada);
  const addFechamentoEstavel           = useFuncaoEstavel(addFechamento);
  const registrarMovimentoCaixaEstavel = useFuncaoEstavel(registrarMovimentoCaixa);
  const setFundoAtualEstavel           = useFuncaoEstavel(setFundoAtual);
  const setCaixaAbertoEstavel          = useFuncaoEstavel(setCaixaAberto);
  const setSessaoAbertaEmEstavel       = useFuncaoEstavel(setSessaoAbertaEm);
  const valorCaixa = useMemo(() => ({
    sales, fechamentos, fundoAtual, caixaAberto, sessaoAbertaEm, movimentosCaixa,
    addSale: addSaleEstavel, cancelarVendaFechada: cancelarVendaFechadaEstavel,
    addFechamento: addFechamentoEstavel, registrarMovimentoCaixa: registrarMovimentoCaixaEstavel,
    setFundoAtual: setFundoAtualEstavel, setCaixaAberto: setCaixaAbertoEstavel,
    setSessaoAbertaEm: setSessaoAbertaEmEstavel,
  }), [sales, fechamentos, fundoAtual, caixaAberto, sessaoAbertaEm, movimentosCaixa,
    addSaleEstavel, cancelarVendaFechadaEstavel, addFechamentoEstavel, registrarMovimentoCaixaEstavel,
    setFundoAtualEstavel, setCaixaAbertoEstavel, setSessaoAbertaEmEstavel]);

  return (
    <CaixaCargaContext.Provider value={valorCarga}>
      <CaixaContext.Provider value={valorCaixa}>
        {children}
      </CaixaContext.Provider>
    </CaixaCargaContext.Provider>
  );
}
