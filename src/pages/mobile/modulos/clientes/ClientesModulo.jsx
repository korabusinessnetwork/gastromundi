import { useEffect, useMemo, useState } from "react";
import {
  LuArrowLeft,
  LuSearch,
  LuUsers,
  LuPhone,
  LuFileText,
  LuMapPin,
  LuBadgeCheck,
  LuTriangleAlert,
  LuCheck,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { formatarDocumento } from "@/lib/documento";
import { formatarTelefone } from "@/lib/deliveryPedidos";
import { fmtDinheiro } from "@/pages/mobile/fmt";
import {
  listarClientes,
  buscarHistoricoCliente,
  calcularSaldoDevedor,
  sanitizarTermoBusca,
  registrarPagamentoFiado,
} from "@/lib/clientes";
import "../modulos.css";
import "./ClientesModulo.css";

/**
 * ClientesModulo — tela mobile de Clientes no Palm.
 *
 * Propósito no celular: consultar o cliente e o fiado dele na hora do
 * atendimento — não é o cadastro completo do desktop (ClientesView), é
 * uma lista rápida + detalhe com histórico e baixa de fiado. Reusa
 * inteiramente src/lib/clientes.js (mesma fonte de verdade do desktop);
 * a única consulta própria desta tela é o somatório de fiado em aberto
 * por cliente (para ordenar/badge da lista) — src/lib/clientes.js não
 * expõe isso em lote, então busca-se `lancamentos` direto e o resultado
 * passa por `calcularSaldoDevedor` (a mesma regra pura do resto do app)
 * agrupado por cliente, em vez de reimplementar o filtro de status.
 *
 * Navegação: lista → detalhe é um "afunda" dentro da própria tela (sem
 * modal): tocar no cartão abre o detalhe, voltar do detalhe volta pra
 * lista, voltar da lista chama `onVoltar` (sai do módulo). Um só sentido
 * de "voltar" em cada tela, sem surpresa.
 */

const LIMITE_HISTORICO_EXIBIDO = 200;

/** Soma de fiado em aberto por cliente, a partir de `lancamentos` de todos
 * os clientes de uma vez (evita 1 consulta por cliente na lista). */
async function buscarFiadoEmAberto() {
  const { data, error } = await supabase
    .from("lancamentos")
    .select("cliente_id, valor, status")
    .eq("tipo", "receita")
    .in("status", ["previsto", "vencido"])
    .not("cliente_id", "is", null)
    .limit(5000);
  if (error) return { mapa: new Map(), error };

  const porCliente = new Map();
  for (const lancamento of data ?? []) {
    const lista = porCliente.get(lancamento.cliente_id) ?? [];
    lista.push(lancamento);
    porCliente.set(lancamento.cliente_id, lista);
  }
  const mapa = new Map();
  for (const [clienteId, lancamentos] of porCliente) {
    mapa.set(clienteId, calcularSaldoDevedor(lancamentos));
  }
  return { mapa, error: null };
}

export default function ClientesModulo({ onVoltar }) {
  const { currentUser } = useApp();

  const [busca, setBusca] = useState("");
  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [fiadoMapa, setFiadoMapa] = useState(new Map());
  const [totalClientes, setTotalClientes] = useState(null);

  const [clienteSelecionado, setClienteSelecionado] = useState(null);

  // Lista filtrada por busca (debounce — não dispara consulta a cada tecla).
  useEffect(() => {
    let cancelado = false;
    const t = setTimeout(async () => {
      setCarregando(true);
      setErro("");
      const termo = sanitizarTermoBusca(busca);
      const { data, error } = await listarClientes({ busca: termo });
      if (cancelado) return;
      setCarregando(false);
      if (error) {
        setErro("Não foi possível carregar os clientes agora.");
        return;
      }
      setClientes(data ?? []);
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [busca]);

  // Estatísticas do header (total de clientes e quem tem fiado em aberto) —
  // independentes da busca, para o subtítulo não "piscar" enquanto filtra.
  const carregarEstatisticas = async () => {
    const [{ data: todos }, { mapa }] = await Promise.all([
      listarClientes({}),
      buscarFiadoEmAberto(),
    ]);
    setTotalClientes(todos?.length ?? 0);
    setFiadoMapa(mapa);
  };

  useEffect(() => {
    carregarEstatisticas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const listaOrdenada = useMemo(() => {
    return [...clientes].sort((a, b) => {
      const saldoA = fiadoMapa.get(a.id) ?? 0;
      const saldoB = fiadoMapa.get(b.id) ?? 0;
      if (saldoA > 0 && saldoB <= 0) return -1;
      if (saldoB > 0 && saldoA <= 0) return 1;
      if (saldoA !== saldoB) return saldoB - saldoA;
      return String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR");
    });
  }, [clientes, fiadoMapa]);

  const totalComFiado = useMemo(
    () => [...fiadoMapa.values()].filter((v) => v > 0).length,
    [fiadoMapa],
  );

  if (clienteSelecionado) {
    return (
      <DetalheCliente
        cliente={clienteSelecionado}
        usuario={currentUser?.username}
        onVoltar={() => setClienteSelecionado(null)}
        onPagamentoRegistrado={carregarEstatisticas}
      />
    );
  }

  return (
    <div className="mod-tela">
      <header className="mod-header">
        <div className="mod-header__textos">
          <h1 className="mod-header__titulo">Clientes</h1>
          <p className="mod-header__subtitulo">
            {totalClientes == null
              ? "Carregando…"
              : `${totalClientes === 1 ? "1 cliente" : `${totalClientes} clientes`} · ${
                  totalComFiado === 1 ? "1 com fiado em aberto" : `${totalComFiado} com fiado em aberto`
                }`}
          </p>
        </div>
        <button type="button" className="mod-header__voltar" onClick={onVoltar} aria-label="Voltar">
          <LuArrowLeft aria-hidden="true" />
        </button>
      </header>

      <label className="mod-busca">
        <LuSearch aria-hidden="true" />
        <input
          type="search"
          inputMode="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone…"
          aria-label="Buscar cliente por nome ou telefone"
        />
      </label>

      {erro ? (
        <p className="mod-erro" role="alert">
          {erro}
        </p>
      ) : null}

      {carregando ? (
        <p className="mod-carregando">Carregando clientes…</p>
      ) : listaOrdenada.length === 0 ? (
        <div className="mod-vazio">
          <LuUsers aria-hidden="true" />
          <p className="mod-vazio__titulo">Nenhum cliente encontrado</p>
          <p className="mod-vazio__texto">
            {busca.trim() ? "Tente buscar por outro nome ou telefone." : "Ainda não há clientes cadastrados."}
          </p>
        </div>
      ) : (
        <div className="mod-lista">
          {listaOrdenada.map((cliente) => (
            <CartaoCliente
              key={cliente.id}
              cliente={cliente}
              saldo={fiadoMapa.get(cliente.id) ?? 0}
              onAbrir={() => setClienteSelecionado(cliente)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoCliente({ cliente, saldo, onAbrir }) {
  const deve = saldo > 0;
  return (
    <button
      type="button"
      className={`mod-cartao mod-cartao--tocavel ${deve ? "mod-cartao--red" : "mod-cartao--green"}`}
      onClick={onAbrir}
    >
      <div className="mod-cartao__topo">
        <div className="clientes-modulo__identidade">
          <span className="mod-cartao__titulo">{cliente.nome}</span>
          {cliente.telefone ? (
            <span className="mod-cartao__sub clientes-modulo__telefone">
              <LuPhone aria-hidden="true" />
              {formatarTelefone(cliente.telefone)}
            </span>
          ) : null}
        </div>
        <div className="clientes-modulo__saldo">
          {deve ? (
            <>
              <span className="clientes-modulo__valor clientes-modulo__valor--devedor">{fmtDinheiro(saldo)}</span>
              <span className="mod-badge mod-badge--erro">
                <LuTriangleAlert aria-hidden="true" />
                Fiado
              </span>
            </>
          ) : (
            <span className="mod-badge mod-badge--ok">
              <LuBadgeCheck aria-hidden="true" />
              Em dia
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function DetalheCliente({ cliente, usuario, onVoltar, onPagamentoRegistrado }) {
  const [vendas, setVendas] = useState([]);
  const [lancamentosFiado, setLancamentosFiado] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [confirmandoId, setConfirmandoId] = useState(null);
  const [baixando, setBaixando] = useState(false);
  const [erroBaixa, setErroBaixa] = useState("");

  const carregarHistorico = async () => {
    setCarregando(true);
    setErro("");
    const { vendas: v, lancamentosFiado: l, error } = await buscarHistoricoCliente(cliente.id);
    setCarregando(false);
    if (error) {
      setErro("Não foi possível carregar o histórico agora.");
      return;
    }
    setVendas(v.slice(0, LIMITE_HISTORICO_EXIBIDO));
    setLancamentosFiado(l);
  };

  useEffect(() => {
    carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id]);

  const saldoDevedor = calcularSaldoDevedor(lancamentosFiado);
  const contasEmAberto = lancamentosFiado.filter((l) => l.status === "previsto" || l.status === "vencido");

  const handleConfirmarPagamento = async (lancamentoId) => {
    if (baixando) return;
    setBaixando(true);
    setErroBaixa("");
    const { error } = await registrarPagamentoFiado(lancamentoId, usuario);
    setBaixando(false);
    setConfirmandoId(null);
    if (error) {
      setErroBaixa("Não foi possível registrar o pagamento agora. Toque de novo.");
      return;
    }
    await carregarHistorico();
    onPagamentoRegistrado?.();
  };

  return (
    <div className="mod-tela">
      <header className="mod-header">
        <div className="mod-header__textos">
          <h1 className="mod-header__titulo">{cliente.nome}</h1>
          <p className="mod-header__subtitulo">
            {cliente.telefone ? formatarTelefone(cliente.telefone) : "Sem telefone cadastrado"}
          </p>
        </div>
        <button type="button" className="mod-header__voltar" onClick={onVoltar} aria-label="Voltar para a lista">
          <LuArrowLeft aria-hidden="true" />
        </button>
      </header>

      {erro ? (
        <p className="mod-erro" role="alert">
          {erro}
        </p>
      ) : null}
      {erroBaixa ? (
        <p className="mod-erro" role="alert">
          {erroBaixa}
        </p>
      ) : null}

      {carregando ? (
        <p className="mod-carregando">Carregando histórico…</p>
      ) : (
        <>
          <div className="mod-cartao">
            {cliente.documento ? (
              <div className="mod-linha">
                <span>
                  <LuFileText aria-hidden="true" className="clientes-modulo__iconeLinha" />
                  {cliente.documento_tipo === "cnpj" ? "CNPJ" : "CPF"}
                </span>
                <strong>{formatarDocumento(cliente.documento, cliente.documento_tipo)}</strong>
              </div>
            ) : null}
            {cliente.endereco ? (
              <div className="mod-linha">
                <span>
                  <LuMapPin aria-hidden="true" className="clientes-modulo__iconeLinha" />
                  Endereço
                </span>
                <strong className="clientes-modulo__valorTexto">{cliente.endereco}</strong>
              </div>
            ) : null}
            <div className="mod-linha">
              <span>Saldo de fiado</span>
              <strong
                className={
                  saldoDevedor > 0
                    ? "clientes-modulo__saldoValor clientes-modulo__saldoValor--devedor"
                    : "clientes-modulo__saldoValor clientes-modulo__saldoValor--ok"
                }
              >
                {saldoDevedor > 0 ? fmtDinheiro(saldoDevedor) : "Em dia"}
              </strong>
            </div>
          </div>

          {contasEmAberto.length > 0 ? (
            <div className="mod-cartao">
              <p className="clientes-modulo__secaoTitulo">Contas em aberto</p>
              <div className="clientes-modulo__contas">
                {contasEmAberto.map((l) => (
                  <div key={l.id} className="clientes-modulo__conta">
                    <div className="mod-linha">
                      <span>
                        {l.descricao ?? "Fiado"}
                        {" · venc. "}
                        {l.vencimento ? new Date(l.vencimento).toLocaleDateString("pt-BR") : "—"}
                        {l.status === "vencido" ? (
                          <span className="clientes-modulo__vencido"> · Vencido</span>
                        ) : null}
                      </span>
                      <strong>{fmtDinheiro(l.valor)}</strong>
                    </div>

                    {confirmandoId === l.id ? (
                      <div className="clientes-modulo__confirmarLinha">
                        <button
                          type="button"
                          className="mod-botao mod-botao--fantasma"
                          onClick={() => setConfirmandoId(null)}
                          disabled={baixando}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="mod-botao mod-botao--ok"
                          onClick={() => handleConfirmarPagamento(l.id)}
                          disabled={baixando}
                        >
                          <LuCheck aria-hidden="true" />
                          {baixando ? "Registrando…" : "Confirmar pagamento"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="mod-botao mod-botao--ok mod-botao--bloco"
                        onClick={() => setConfirmandoId(l.id)}
                      >
                        <LuCheck aria-hidden="true" />
                        Registrar pagamento
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mod-cartao">
            <p className="clientes-modulo__secaoTitulo">Histórico de compras</p>
            {vendas.length === 0 ? (
              <p className="clientes-modulo__vazioTexto">Nenhuma venda registrada para este cliente ainda.</p>
            ) : (
              <div className="clientes-modulo__vendas">
                {vendas.map((v) => (
                  <div key={v.id} className="mod-linha">
                    <span>
                      {v.comanda ? `Comanda ${v.comanda}` : "Venda"}
                      {" · "}
                      {v.at ? new Date(v.at).toLocaleDateString("pt-BR") : "—"}
                    </span>
                    <strong>{fmtDinheiro(v.total)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
