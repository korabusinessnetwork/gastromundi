import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { useApp } from "@/context/AppContext";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import {
  LuUsers, LuSearch, LuPlus, LuPhone, LuMapPin, LuFileText,
  LuX, LuCircleAlert, LuBadgeCheck, LuArrowLeft,
} from "react-icons/lu";
import {
  listarClientes, cadastrarCliente, buscarHistoricoCliente,
  registrarPagamentoFiado, calcularSaldoDevedor,
} from "@/lib/clientes";
import "./ClientesView.css";

/**
 * F010 — Clientes (docs/03_REGRAS_DE_NEGOCIO/CLIENTES.md).
 *
 * Lista/busca clientes, cadastro rápido (nome + telefone obrigatórios)
 * e, ao abrir um cliente, mostra histórico de compras e o fiado (via
 * Financeiro — não é um sistema à parte): saldo devedor em destaque e
 * ação de registrar pagamento (baixa da conta a receber).
 */
export default function ClientesView() {
  const { currentUser } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const [showCadastro, setShowCadastro] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");
  const [novoEndereco, setNovoEndereco] = useState("");
  const [novoObs, setNovoObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroCadastro, setErroCadastro] = useState(null);

  const [clienteAberto, setClienteAberto] = useState(null);

  const carregar = async (termo) => {
    setCarregando(true);
    setErro(null);
    const { data, error } = await listarClientes({ busca: termo });
    setCarregando(false);
    if (error) { setErro("Não foi possível carregar os clientes agora."); return; }
    setClientes(data ?? []);
  };

  useEffect(() => {
    const t = setTimeout(() => carregar(busca), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const abrirCadastro = () => {
    setNovoNome(""); setNovoTelefone(""); setNovoEndereco(""); setNovoObs("");
    setErroCadastro(null);
    setShowCadastro(true);
  };

  const handleCadastrar = async () => {
    if (salvando) return;
    setSalvando(true);
    setErroCadastro(null);
    const { data, error } = await cadastrarCliente(
      { nome: novoNome, telefone: novoTelefone, endereco: novoEndereco, observacoes: novoObs },
      currentUser?.username,
    );
    setSalvando(false);
    if (error) { setErroCadastro(error.message ?? "Não foi possível cadastrar o cliente."); return; }
    setShowCadastro(false);
    await carregar(busca);
    setClienteAberto(data);
  };

  return (
    <div className="clientes-view" style={{ background: varColor(C.bg) }}>

      {/* Header */}
      <div className="clientes-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Clientes</div>
          <div className="clientes-view__subtitulo" style={{ color: varColor(C.muted), fontSize: sz.fontSm }}>Cadastro, histórico de compras e fiado</div>
        </div>
        <button
          onClick={abrirCadastro}
          className="clientes-view__btn-novo"
          style={{ background: varColor(C.accent), fontSize: sz.fontBase, boxShadow: `0 4px 16px ${alfa(C.accent, "44")}` }}
        >
          <LuPlus size={16} /> Novo Cliente
        </button>
      </div>

      {/* Busca */}
      <div className="clientes-view__busca-wrap" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
        <div className="clientes-view__busca">
          <LuSearch size={15} color={varColor(C.muted)} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="clientes-view__busca-input"
            style={{ fontSize: sz.fontBase }}
          />
        </div>
      </div>

      {/* Lista */}
      <div className="clientes-view__lista-area" style={{ padding: `0 ${sz.pad}px ${sz.pad}px` }}>
        {erro && (
          <div className="clientes-view__alerta" style={{ background: alfa(C.red, "12") }}>
            <LuCircleAlert size={18} /> {erro}
          </div>
        )}

        {carregando ? (
          <div className="clientes-view__estado">
            <div style={{ fontSize: sz.fontBase }}>Carregando clientes...</div>
          </div>
        ) : clientes.length === 0 ? (
          <div className="clientes-view__estado">
            <LuUsers size={44} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>
              {busca.trim() ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
            </div>
            {!busca.trim() && (
              <div style={{ fontSize: sz.fontSm }}>Clique em "Novo Cliente" para cadastrar o primeiro</div>
            )}
          </div>
        ) : (
          <div className="clientes-view__grid" style={{ gap: sz.gap }}>
            {clientes.map((c) => (
              <button
                key={c.id}
                onClick={() => setClienteAberto(c)}
                className="clientes-view__card"
              >
                <div className="clientes-view__card-nome" style={{ fontSize: sz.fontBase + 1 }}>{c.nome}</div>
                {c.telefone && (
                  <div className="clientes-view__card-linha" style={{ fontSize: sz.fontSm }}>
                    <LuPhone size={13} /> {c.telefone}
                  </div>
                )}
                {c.endereco && (
                  <div className="clientes-view__card-linha" style={{ fontSize: sz.fontSm }}>
                    <LuMapPin size={13} /> {c.endereco}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal: cadastro rápido ── */}
      {showCadastro && createPortal(
        <div
          {...fecharAoClicarFora(() => setShowCadastro(false))}
          className="clientes-view__overlay"
        >
          <div className="clientes-view__modal">
            <div className="clientes-view__modal-topo">
              <div className="clientes-view__modal-titulo">Novo Cliente</div>
              <button onClick={() => setShowCadastro(false)} className="clientes-view__modal-fechar">
                <LuX size={18} />
              </button>
            </div>

            <div className="clientes-view__campos">
              <div>
                <label className="clientes-view__label">Nome</label>
                <input
                  autoFocus
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Nome do cliente"
                  className="clientes-view__input"
                />
              </div>
              <div>
                <label className="clientes-view__label">Telefone</label>
                <input
                  value={novoTelefone}
                  onChange={(e) => setNovoTelefone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="clientes-view__input"
                />
              </div>
              <div>
                <label className="clientes-view__label">Endereço <span style={{ fontWeight: 400, textTransform: "none" }}>(para delivery, opcional)</span></label>
                <input
                  value={novoEndereco}
                  onChange={(e) => setNovoEndereco(e.target.value)}
                  placeholder="Rua, número, bairro..."
                  className="clientes-view__input"
                />
              </div>
              <div>
                <label className="clientes-view__label">Observações <span style={{ fontWeight: 400, textTransform: "none" }}>(opcional)</span></label>
                <input
                  value={novoObs}
                  onChange={(e) => setNovoObs(e.target.value)}
                  placeholder="Ex: sem cebola, apto 302..."
                  className="clientes-view__input"
                />
              </div>
            </div>

            {erroCadastro && (
              <div className="clientes-view__erro-form">{erroCadastro}</div>
            )}

            <div className="clientes-view__modal-botoes">
              <button onClick={() => setShowCadastro(false)} className="clientes-view__btn-cancelar">
                Cancelar
              </button>
              <button
                onClick={handleCadastrar}
                disabled={salvando || !novoNome.trim() || !novoTelefone.trim()}
                className="clientes-view__btn-confirmar"
                style={{
                  background: (salvando || !novoNome.trim() || !novoTelefone.trim()) ? varColor(C.faint) : varColor(C.accent),
                  cursor: (salvando || !novoNome.trim() || !novoTelefone.trim()) ? "not-allowed" : "pointer",
                }}
              >
                {salvando ? "Salvando..." : "Cadastrar"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Modal: detalhe do cliente ── */}
      {clienteAberto && createPortal(
        <ClienteDetalhe
          cliente={clienteAberto}
          usuario={currentUser?.username}
          sz={sz}
          onClose={() => setClienteAberto(null)}
        />,
        document.body,
      )}
    </div>
  );
}

function ClienteDetalhe({ cliente, usuario, sz, onClose }) {
  const [vendas, setVendas] = useState([]);
  const [lancamentosFiado, setLancamentosFiado] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [baixando, setBaixando] = useState(false);
  const [erroBaixa, setErroBaixa] = useState(null);

  const carregar = async () => {
    setCarregando(true);
    setErro(null);
    const { vendas: v, lancamentosFiado: l, error } = await buscarHistoricoCliente(cliente.id);
    setCarregando(false);
    if (error) { setErro("Não foi possível carregar o histórico agora."); return; }
    setVendas(v);
    setLancamentosFiado(l);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cliente.id]);

  const saldoDevedor = calcularSaldoDevedor(lancamentosFiado);
  const contasEmAberto = lancamentosFiado.filter((l) => l.status === "previsto" || l.status === "vencido");

  const handleConfirmarPagamento = async (lancamentoId) => {
    if (baixando) return;
    setBaixando(true);
    setErroBaixa(null);
    const { error } = await registrarPagamentoFiado(lancamentoId, usuario);
    setBaixando(false);
    setConfirmandoId(null);
    if (error) { setErroBaixa("Não foi possível registrar o pagamento agora."); return; }
    await carregar();
  };

  return (
    <div
      {...fecharAoClicarFora(onClose)}
      className="clientes-view__overlay"
    >
      <div className="cliente-detalhe__modal">

        {/* Header */}
        <div className="cliente-detalhe__header">
          <button onClick={onClose} className="cliente-detalhe__btn-icone">
            <LuArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <div className="cliente-detalhe__nome">{cliente.nome}</div>
            <div className="cliente-detalhe__contato">
              {cliente.telefone && <span><LuPhone size={12} style={{ verticalAlign: -1 }} /> {cliente.telefone}</span>}
              {cliente.endereco && <span><LuMapPin size={12} style={{ verticalAlign: -1 }} /> {cliente.endereco}</span>}
            </div>
          </div>
          <button onClick={onClose} className="cliente-detalhe__btn-icone">
            <LuX size={18} />
          </button>
        </div>

        <div className="cliente-detalhe__corpo">

          {erro && (
            <div className="clientes-view__alerta" style={{ padding: 14, borderRadius: 10, background: alfa(C.red, "12") }}>
              <LuCircleAlert size={16} /> {erro}
            </div>
          )}
          {erroBaixa && (
            <div className="clientes-view__alerta" style={{ padding: 14, borderRadius: 10, background: alfa(C.red, "12") }}>
              <LuCircleAlert size={16} /> {erroBaixa}
            </div>
          )}

          {carregando ? (
            <div style={{ color: varColor(C.muted), fontSize: 14, textAlign: "center", padding: 30 }}>Carregando histórico...</div>
          ) : (
            <>
              {/* Saldo devedor — destaque claro: quem deve, quanto */}
              <div className="cliente-detalhe__saldo" style={{
                background: saldoDevedor > 0 ? alfa(C.red, "12") : alfa(C.green, "12"),
                border: `1.5px solid ${alfa(saldoDevedor > 0 ? varColor(C.red) : varColor(C.green), "44")}`,
              }}>
                <div>
                  <div className="cliente-detalhe__saldo-rotulo">Saldo de fiado</div>
                  <div className="cliente-detalhe__saldo-valor" style={{ color: saldoDevedor > 0 ? varColor(C.red) : varColor(C.green) }}>
                    {saldoDevedor > 0 ? `${cliente.nome} deve R$ ${saldoDevedor.toFixed(2)}` : "Sem pendências"}
                  </div>
                </div>
                {saldoDevedor === 0 && <LuBadgeCheck size={26} color={varColor(C.green)} />}
              </div>

              {/* Contas de fiado em aberto */}
              {contasEmAberto.length > 0 && (
                <div>
                  <div className="cliente-detalhe__secao-titulo">Contas em aberto</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {contasEmAberto.map((l) => (
                      <div key={l.id} className="cliente-detalhe__conta">
                        <div>
                          <div className="cliente-detalhe__conta-descricao">{l.descricao ?? "Fiado"}</div>
                          <div className="cliente-detalhe__conta-venc">
                            Venc. {l.vencimento ? new Date(l.vencimento).toLocaleDateString("pt-BR") : "—"}
                            {l.status === "vencido" && <span style={{ color: varColor(C.red), fontWeight: 700 }}> · Vencido</span>}
                          </div>
                        </div>
                        <div className="cliente-detalhe__conta-acoes">
                          <div className="cliente-detalhe__conta-valor">R$ {Number(l.valor).toFixed(2)}</div>
                          {confirmandoId === l.id ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => setConfirmandoId(null)} className="cliente-detalhe__btn-pequeno">
                                Cancelar
                              </button>
                              <button onClick={() => handleConfirmarPagamento(l.id)} disabled={baixando} className="cliente-detalhe__btn-confirmar-pagamento" style={{ background: varColor(C.green), cursor: baixando ? "not-allowed" : "pointer" }}>
                                {baixando ? "..." : "Confirmar"}
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmandoId(l.id)} className="cliente-detalhe__btn-registrar" style={{ borderColor: alfa(C.green, "66"), background: alfa(C.green, "12"), color: varColor(C.green) }}>
                              Registrar pagamento
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico de compras */}
              <div>
                <div className="cliente-detalhe__secao-titulo">Histórico de compras</div>
                {vendas.length === 0 ? (
                  <div style={{ fontSize: 13, color: varColor(C.muted), padding: "10px 0" }}>Nenhuma venda registrada para este cliente ainda.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {vendas.map((v) => (
                      <div key={v.id} className="cliente-detalhe__venda">
                        <div style={{ fontSize: 13, color: varColor(C.muted) }}>
                          {v.comanda ? `Comanda ${v.comanda}` : "Venda"} · {new Date(v.at).toLocaleDateString("pt-BR")}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: varColor(C.text) }}>R$ {Number(v.total).toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
