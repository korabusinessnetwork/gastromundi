import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: `${sz.pad - 4}px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Clientes</div>
          <div style={{ color: C.muted, fontSize: sz.fontSm, marginTop: 2 }}>Cadastro, histórico de compras e fiado</div>
        </div>
        <button
          onClick={abrirCadastro}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 18px", borderRadius: 10, border: "none",
            background: C.accent, color: "#fff", cursor: "pointer",
            fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit",
            boxShadow: `0 4px 16px ${C.accent}44`,
          }}
        >
          <LuPlus size={16} /> Novo Cliente
        </button>
      </div>

      {/* Busca */}
      <div style={{ padding: `${sz.padSm}px ${sz.pad}px`, flexShrink: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 14px",
          background: C.surface, maxWidth: 380,
        }}>
          <LuSearch size={15} color={C.muted} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            style={{ flex: 1, border: "none", background: "none", outline: "none", color: C.text, fontSize: sz.fontBase, fontFamily: "inherit" }}
          />
        </div>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
        {erro && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderRadius: 12, background: `${C.red}12`, border: `1.5px solid ${C.red}44`, color: C.red, marginBottom: 12 }}>
            <LuCircleAlert size={18} /> {erro}
          </div>
        )}

        {carregando ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted, padding: 60 }}>
            <div style={{ fontSize: sz.fontBase }}>Carregando clientes...</div>
          </div>
        ) : clientes.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted, padding: 60 }}>
            <LuUsers size={44} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>
              {busca.trim() ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
            </div>
            {!busca.trim() && (
              <div style={{ fontSize: sz.fontSm }}>Clique em "Novo Cliente" para cadastrar o primeiro</div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(260px, 1fr))`, gap: sz.gap }}>
            {clientes.map((c) => (
              <button
                key={c.id}
                onClick={() => setClienteAberto(c)}
                style={{
                  textAlign: "left", padding: "16px 18px", borderRadius: 14,
                  border: `1px solid ${C.border}`, background: C.card,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", flexDirection: "column", gap: 6,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: sz.fontBase + 1, color: C.text }}>{c.nome}</div>
                {c.telefone && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: sz.fontSm, color: C.muted }}>
                    <LuPhone size={13} /> {c.telefone}
                  </div>
                )}
                {c.endereco && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: sz.fontSm, color: C.muted }}>
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
          onClick={(e) => { if (e.target === e.currentTarget) setShowCadastro(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 9200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div style={{ background: C.card, borderRadius: 20, padding: 28, width: "100%", maxWidth: 420, border: `1px solid ${C.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: C.text }}>Novo Cliente</div>
              <button onClick={() => setShowCadastro(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4 }}>
                <LuX size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>Nome</label>
                <input
                  autoFocus
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Nome do cliente"
                  style={{ width: "100%", marginTop: 6, padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>Telefone</label>
                <input
                  value={novoTelefone}
                  onChange={(e) => setNovoTelefone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  style={{ width: "100%", marginTop: 6, padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>Endereço <span style={{ fontWeight: 400, textTransform: "none" }}>(para delivery, opcional)</span></label>
                <input
                  value={novoEndereco}
                  onChange={(e) => setNovoEndereco(e.target.value)}
                  placeholder="Rua, número, bairro..."
                  style={{ width: "100%", marginTop: 6, padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>Observações <span style={{ fontWeight: 400, textTransform: "none" }}>(opcional)</span></label>
                <input
                  value={novoObs}
                  onChange={(e) => setNovoObs(e.target.value)}
                  placeholder="Ex: sem cebola, apto 302..."
                  style={{ width: "100%", marginTop: 6, padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>

            {erroCadastro && (
              <div style={{ fontSize: 13, color: C.red, fontWeight: 600 }}>{erroCadastro}</div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowCadastro(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 15, fontFamily: "inherit" }}>
                Cancelar
              </button>
              <button
                onClick={handleCadastrar}
                disabled={salvando || !novoNome.trim() || !novoTelefone.trim()}
                style={{
                  flex: 2, padding: "12px 0", borderRadius: 12, border: "none",
                  background: (salvando || !novoNome.trim() || !novoTelefone.trim()) ? C.faint : C.accent,
                  color: "#fff", cursor: (salvando || !novoNome.trim() || !novoTelefone.trim()) ? "not-allowed" : "pointer",
                  fontWeight: 800, fontSize: 15, fontFamily: "inherit",
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
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div style={{ background: C.card, borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "85vh", border: `1px solid ${C.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4, display: "flex" }}>
            <LuArrowLeft size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 17, color: C.text }}>{cliente.nome}</div>
            <div style={{ fontSize: 13, color: C.muted, marginTop: 2, display: "flex", gap: 12 }}>
              {cliente.telefone && <span><LuPhone size={12} style={{ verticalAlign: -1 }} /> {cliente.telefone}</span>}
              {cliente.endereco && <span><LuMapPin size={12} style={{ verticalAlign: -1 }} /> {cliente.endereco}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4, display: "flex" }}>
            <LuX size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {erro && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 10, background: `${C.red}12`, border: `1.5px solid ${C.red}44`, color: C.red }}>
              <LuCircleAlert size={16} /> {erro}
            </div>
          )}
          {erroBaixa && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 10, background: `${C.red}12`, border: `1.5px solid ${C.red}44`, color: C.red }}>
              <LuCircleAlert size={16} /> {erroBaixa}
            </div>
          )}

          {carregando ? (
            <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 30 }}>Carregando histórico...</div>
          ) : (
            <>
              {/* Saldo devedor — destaque claro: quem deve, quanto */}
              <div style={{
                padding: "16px 18px", borderRadius: 14,
                background: saldoDevedor > 0 ? `${C.red}12` : `${C.green}12`,
                border: `1.5px solid ${saldoDevedor > 0 ? C.red : C.green}44`,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>Saldo de fiado</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: saldoDevedor > 0 ? C.red : C.green, marginTop: 4 }}>
                    {saldoDevedor > 0 ? `${cliente.nome} deve R$ ${saldoDevedor.toFixed(2)}` : "Sem pendências"}
                  </div>
                </div>
                {saldoDevedor === 0 && <LuBadgeCheck size={26} color={C.green} />}
              </div>

              {/* Contas de fiado em aberto */}
              {contasEmAberto.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>Contas em aberto</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {contasEmAberto.map((l) => (
                      <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{l.descricao ?? "Fiado"}</div>
                          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                            Venc. {l.vencimento ? new Date(l.vencimento).toLocaleDateString("pt-BR") : "—"}
                            {l.status === "vencido" && <span style={{ color: C.red, fontWeight: 700 }}> · Vencido</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>R$ {Number(l.valor).toFixed(2)}</div>
                          {confirmandoId === l.id ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => setConfirmandoId(null)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                                Cancelar
                              </button>
                              <button onClick={() => handleConfirmarPagamento(l.id)} disabled={baixando} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: C.green, color: "#fff", cursor: baixando ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit" }}>
                                {baixando ? "..." : "Confirmar"}
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmandoId(l.id)} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${C.green}66`, background: `${C.green}12`, color: C.green, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit", whiteSpace: "nowrap" }}>
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
                <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, marginBottom: 8 }}>Histórico de compras</div>
                {vendas.length === 0 ? (
                  <div style={{ fontSize: 13, color: C.muted, padding: "10px 0" }}>Nenhuma venda registrada para este cliente ainda.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {vendas.map((v) => (
                      <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface }}>
                        <div style={{ fontSize: 13, color: C.muted }}>
                          {v.comanda ? `Comanda ${v.comanda}` : "Venda"} · {new Date(v.at).toLocaleDateString("pt-BR")}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>R$ {Number(v.total).toFixed(2)}</div>
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
