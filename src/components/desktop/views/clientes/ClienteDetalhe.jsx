import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useEffect, useState } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import {
  LuPhone, LuMapPin, LuX, LuCircleAlert, LuBadgeCheck, LuArrowLeft, LuPencil, LuTrash2
} from "react-icons/lu";
import {
  buscarHistoricoCliente, registrarPagamentoFiado, calcularSaldoDevedor, contasDeFiadoEmAberto, anonimizarCliente, registrarAcessoDocumento
} from "@/lib/clientes";
import { formatarTelefone } from "@/lib/telefone";
import DocumentoProtegido from "@/components/shared/DocumentoProtegido";

export default function ClienteDetalhe({ cliente, usuario, podeExcluir, podeVerDocumento, onClose, onEditar, onExcluido }) {
  const [vendas, setVendas] = useState([]);
  const [lancamentosFiado, setLancamentosFiado] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [baixando, setBaixando] = useState(false);
  const [erroBaixa, setErroBaixa] = useState(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExclusao, setErroExclusao] = useState(null);

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
  const contasEmAberto = contasDeFiadoEmAberto(lancamentosFiado);

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

  // Cliente que ainda deve não pode ser excluído: a conta em aberto ficaria
  // pendurada num cadastro sem nome nem telefone e ninguém mais cobraria.
  // Primeiro recebe, depois exclui.
  const exclusaoBloqueadaPorFiado = saldoDevedor > 0;

  const handleExcluir = async () => {
    if (excluindo || exclusaoBloqueadaPorFiado) return;
    setExcluindo(true);
    setErroExclusao(null);
    const { error } = await anonimizarCliente(cliente.id, usuario);
    setExcluindo(false);
    if (error) { setErroExclusao("Não foi possível excluir o cliente agora."); return; }
    onExcluido?.(cliente.id);
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
              {cliente.telefone && <span><LuPhone size={12} style={{ verticalAlign: -1 }} /> {formatarTelefone(cliente.telefone)}</span>}
              {cliente.documento && (
                <DocumentoProtegido
                  documento={cliente.documento}
                  tipo={cliente.documento_tipo}
                  tamanhoIcone={12}
                  podeRevelar={podeVerDocumento}
                  onRevelar={() => registrarAcessoDocumento(cliente.id, usuario)}
                />
              )}
              {cliente.endereco && <span><LuMapPin size={12} style={{ verticalAlign: -1 }} /> {cliente.endereco}</span>}
            </div>
          </div>
          <button onClick={onEditar} className="cliente-detalhe__btn-editar">
            <LuPencil size={14} /> Editar
          </button>
          {/* Não havia nenhuma forma de tirar um cliente do cadastro: só
              "Editar" e o X de fechar. A ação fica aqui, ao lado de
              "Editar", em vermelho e atrás de uma confirmação que diz o
              que acontece — e só para gerente/admin (CLIENTES.md). */}
          {podeExcluir && (
            <button
              onClick={() => { setConfirmandoExclusao(true); setErroExclusao(null); }}
              className="cliente-detalhe__btn-excluir"
              title="Excluir cliente"
            >
              <LuTrash2 size={14} /> Excluir
            </button>
          )}
          <button onClick={onClose} className="cliente-detalhe__btn-icone">
            <LuX size={18} />
          </button>
        </div>

        <div className="cliente-detalhe__corpo">

          {confirmandoExclusao && (
            <div className="cliente-detalhe__confirmar-exclusao" role="alertdialog" aria-label="Confirmar exclusão do cliente">
              <div className="cliente-detalhe__confirmar-titulo">
                Excluir {cliente.nome} do cadastro?
              </div>
              <div className="cliente-detalhe__confirmar-texto">
                {exclusaoBloqueadaPorFiado
                  ? `Este cliente ainda deve R$ ${saldoDevedor.toFixed(2)} de fiado. Registre o pagamento das contas em aberto antes de excluir.`
                  : "Os dados pessoais (telefone, documento, endereço e observações) são apagados e o cliente sai das listas. As vendas e os lançamentos já registrados continuam no sistema, sem identificação. Não dá para desfazer."}
              </div>
              {erroExclusao && (
                <div className="cliente-detalhe__confirmar-erro">
                  <LuCircleAlert size={14} /> {erroExclusao}
                </div>
              )}
              <div className="cliente-detalhe__confirmar-acoes">
                <button onClick={() => setConfirmandoExclusao(false)} className="cliente-detalhe__btn-pequeno">
                  {exclusaoBloqueadaPorFiado ? "Entendi" : "Cancelar"}
                </button>
                {!exclusaoBloqueadaPorFiado && (
                  <button
                    onClick={handleExcluir}
                    disabled={excluindo}
                    className="cliente-detalhe__btn-confirmar-exclusao"
                    style={{ cursor: excluindo ? "not-allowed" : "pointer" }}
                  >
                    {excluindo ? "Excluindo..." : "Sim, excluir"}
                  </button>
                )}
              </div>
            </div>
          )}

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
            <div className="cliente-detalhe__msg-carregando" style={{ color: varColor(C.muted), textAlign: "center", padding: 30 }}>Carregando histórico...</div>
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
                  <div className="cliente-detalhe__msg-vendas-vazio" style={{ color: varColor(C.muted), padding: "10px 0" }}>Nenhuma venda registrada para este cliente ainda.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {vendas.map((v) => (
                      <div key={v.id} className="cliente-detalhe__venda">
                        <div className="cliente-detalhe__venda-data" style={{ color: varColor(C.muted) }}>
                          {v.comanda ? `Comanda ${v.comanda}` : "Venda"} · {new Date(v.at).toLocaleDateString("pt-BR")}
                        </div>
                        <div className="cliente-detalhe__venda-valor" style={{ fontWeight: 700, color: varColor(C.text) }}>R$ {Number(v.total).toFixed(2)}</div>
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
