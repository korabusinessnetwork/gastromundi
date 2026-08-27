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
  LuUsers, LuSearch, LuPlus, LuPhone, LuMapPin,
  LuX, LuCircleAlert, LuBadgeCheck, LuArrowLeft, LuPencil, LuTrash2,
} from "react-icons/lu";
import {
  listarClientes, cadastrarCliente, atualizarCliente, validarCadastroCliente,
  buscarHistoricoCliente, registrarPagamentoFiado, calcularSaldoDevedor,
  anonimizarCliente, registrarAcessoDocumento,
} from "@/lib/clientes";
import { apenasDigitos, validarDocumento, formatarDocumento } from "@/lib/documento";
import { mascararTelefone, telefoneValido, formatarTelefone } from "@/lib/telefone";
import CampoDocumento from "@/components/shared/CampoDocumento";
import DocumentoProtegido from "@/components/shared/DocumentoProtegido";
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
  // Documento é opcional; o toggle escolhe cpf/cnpj (default cpf) e a máscara
  // segue o tipo. Guardamos o valor já mascarado só para exibir no input.
  const [novoDocTipo, setNovoDocTipo] = useState("cpf");
  const [novoDocumento, setNovoDocumento] = useState("");
  const [novoEndereco, setNovoEndereco] = useState("");
  const [novoObs, setNovoObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroCadastro, setErroCadastro] = useState(null);

  const [clienteAberto, setClienteAberto] = useState(null);
  const [clienteEditando, setClienteEditando] = useState(null);

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
  }, [busca]);

  const abrirCadastro = () => {
    setNovoNome(""); setNovoTelefone(""); setNovoEndereco(""); setNovoObs("");
    setNovoDocTipo("cpf"); setNovoDocumento("");
    setErroCadastro(null);
    setShowCadastro(true);
  };

  // Ao trocar cpf↔cnpj, remascara os dígitos já digitados no novo formato.
  const trocarDocTipo = (tipo) => {
    setNovoDocTipo(tipo);
    setNovoDocumento((atual) => formatarDocumento(atual, tipo));
  };

  // Documento é opcional: só bloqueia o cadastro se foi preenchido e está inválido.
  const docInvalido = apenasDigitos(novoDocumento).length > 0
    && !validarDocumento(novoDocumento, novoDocTipo);
  // Só reclama depois que o operador começou a digitar — avisar num campo
  // ainda vazio é ruído.
  const telefoneInvalido = novoTelefone.trim().length > 0 && !telefoneValido(novoTelefone);
  const cadastroBloqueado = salvando || !novoNome.trim() || !telefoneValido(novoTelefone) || docInvalido;

  const handleCadastrar = async () => {
    if (cadastroBloqueado) return;
    setSalvando(true);
    setErroCadastro(null);
    const { data, error } = await cadastrarCliente(
      {
        nome: novoNome, telefone: novoTelefone,
        documento: novoDocumento, documentoTipo: novoDocTipo,
        endereco: novoEndereco, observacoes: novoObs,
      },
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
          <div className="clientes-view__titulo" style={{ fontWeight: 800 }}>Clientes</div>
          <div className="clientes-view__subtitulo" style={{ color: varColor(C.muted) }}>Cadastro, histórico de compras e fiado</div>
        </div>
        <button
          onClick={abrirCadastro}
          className="clientes-view__btn-novo"
          style={{ background: varColor(C.accent), boxShadow: `0 4px 16px ${alfa(C.accent, "44")}` }}
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
            <div className="clientes-view__msg-estado">Carregando clientes...</div>
          </div>
        ) : clientes.length === 0 ? (
          <div className="clientes-view__estado">
            <LuUsers size={44} style={{ opacity: 0.3 }} />
            <div className="clientes-view__titulo-estado" style={{ fontWeight: 600 }}>
              {busca.trim() ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
            </div>
            {!busca.trim() && (
              <div className="clientes-view__msg-vazio">Clique em "Novo Cliente" para cadastrar o primeiro</div>
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
                <div className="clientes-view__card-nome">{c.nome}</div>
                {c.telefone && (
                  <div className="clientes-view__card-linha">
                    <LuPhone size={13} /> {formatarTelefone(c.telefone)}
                  </div>
                )}
                {c.documento && (
                  <div className="clientes-view__card-linha">
                    {/* Na lista o CPF fica sempre oculto: o cartão inteiro já é
                        um botão (abre o cliente), então não cabe outro botão
                        aqui dentro. Quem precisa do número completo abre o
                        cadastro e clica em "Ver" — e aí fica registrado. */}
                    <DocumentoProtegido documento={c.documento} tipo={c.documento_tipo} />
                  </div>
                )}
                {c.endereco && (
                  <div className="clientes-view__card-linha">
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
              {/* Telefone entrava sem nenhuma checagem: "123" era aceito e
                  salvo calado, enquanto o CPF logo abaixo avisava na hora.
                  Agora os dois se comportam igual — máscara enquanto digita e
                  aviso embaixo do campo. */}
              <div>
                <label className="clientes-view__label">Telefone</label>
                <input
                  value={novoTelefone}
                  onChange={(e) => setNovoTelefone(mascararTelefone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  inputMode="numeric"
                  aria-invalid={telefoneInvalido}
                  className="clientes-view__input"
                />
                {telefoneInvalido && (
                  <div className="clientes-view__hint-campo">Telefone incompleto — informe DDD e número.</div>
                )}
              </div>
              <CampoDocumento
                tipo={novoDocTipo}
                valor={novoDocumento}
                onTipo={trocarDocTipo}
                onValor={setNovoDocumento}
                invalido={docInvalido}
              />
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
                disabled={cadastroBloqueado}
                className="clientes-view__btn-confirmar"
                style={{
                  background: cadastroBloqueado ? varColor(C.faint) : varColor(C.accent),
                  cursor: cadastroBloqueado ? "not-allowed" : "pointer",
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
          podeExcluir={currentUser?.role === "admin" || currentUser?.role === "gerente"}
          // Mesma régua da exclusão: quem responde pelo cadastro é quem pode
          // abrir o CPF por inteiro. Garçom e caixa continuam com o cliente
          // (precisam para delivery e fiado), mas veem o documento oculto.
          podeVerDocumento={currentUser?.role === "admin" || currentUser?.role === "gerente"}
          sz={sz}
          onClose={() => setClienteAberto(null)}
          onEditar={() => setClienteEditando(clienteAberto)}
          onExcluido={(id) => {
            setClienteAberto(null);
            setClientes((prev) => prev.filter((c) => c.id !== id));
          }}
        />,
        document.body,
      )}

      {/* ── Modal: edição do cliente (abre por cima do detalhe) ── */}
      {clienteEditando && (
        <ClienteEdicao
          cliente={clienteEditando}
          usuario={currentUser?.username}
          onClose={() => setClienteEditando(null)}
          onSalvo={(atualizado) => {
            setClienteEditando(null);
            setClienteAberto(atualizado);
            setClientes((prev) => prev.map((c) => (c.id === atualizado.id ? { ...c, ...atualizado } : c)));
          }}
        />
      )}
    </div>
  );
}

function ClienteDetalhe({ cliente, usuario, podeExcluir, podeVerDocumento, sz, onClose, onEditar, onExcluido }) {
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

  useEffect(() => { carregar(); }, [cliente.id]);

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

/**
 * Edição de um cliente já cadastrado — mesmos campos do cadastro rápido
 * (nome + telefone obrigatórios; CPF/CNPJ, endereço e observações opcionais).
 * Abre por cima do detalhe e, ao salvar, devolve a linha atualizada via
 * `onSalvo` para a tela refletir na hora, sem recarregar a lista. Botão
 * "Salvar" só habilita quando o cadastro é válido (previne erro, princípio nº 1).
 */
function ClienteEdicao({ cliente, usuario, onClose, onSalvo }) {
  const [nome, setNome] = useState(cliente.nome ?? "");
  const [telefone, setTelefone] = useState(mascararTelefone(cliente.telefone ?? ""));
  const [docTipo, setDocTipo] = useState(cliente.documento_tipo === "cnpj" ? "cnpj" : "cpf");
  const [documento, setDocumento] = useState(
    cliente.documento ? formatarDocumento(cliente.documento, cliente.documento_tipo) : "",
  );
  const [endereco, setEndereco] = useState(cliente.endereco ?? "");
  const [obs, setObs] = useState(cliente.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  // Ao trocar cpf↔cnpj, remascara os dígitos já digitados no novo formato.
  const trocarDocTipo = (tipo) => {
    setDocTipo(tipo);
    setDocumento((atual) => formatarDocumento(atual, tipo));
  };

  const docInvalido = apenasDigitos(documento).length > 0 && !validarDocumento(documento, docTipo);
  const telefoneInvalido = telefone.trim().length > 0 && !telefoneValido(telefone);
  const { valido } = validarCadastroCliente({ nome, telefone, documento, documentoTipo: docTipo });
  const bloqueado = salvando || !valido;

  const handleSalvar = async () => {
    if (bloqueado) return;
    setSalvando(true);
    setErro(null);
    const { data, error } = await atualizarCliente(
      cliente.id,
      { nome, telefone, documento, documentoTipo: docTipo, endereco, observacoes: obs },
      usuario,
    );
    setSalvando(false);
    if (error) { setErro(error.message ?? "Não foi possível salvar as alterações."); return; }
    onSalvo(data);
  };

  return createPortal(
    <div {...fecharAoClicarFora(onClose)} className="clientes-view__overlay" style={{ zIndex: 9300 }}>
      <div className="clientes-view__modal">
        <div className="clientes-view__modal-topo">
          <div className="clientes-view__modal-titulo">Editar cliente</div>
          <button onClick={onClose} className="clientes-view__modal-fechar">
            <LuX size={18} />
          </button>
        </div>

        <div className="clientes-view__campos">
          <div>
            <label className="clientes-view__label">Nome</label>
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do cliente"
              className="clientes-view__input"
            />
          </div>
          <div>
            <label className="clientes-view__label">Telefone</label>
            <input
              value={telefone}
              onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
              placeholder="(00) 00000-0000"
              inputMode="numeric"
              aria-invalid={telefoneInvalido}
              className="clientes-view__input"
            />
            {telefoneInvalido && (
              <div className="clientes-view__hint-campo">Telefone incompleto — informe DDD e número.</div>
            )}
          </div>
          <CampoDocumento
            tipo={docTipo}
            valor={documento}
            onTipo={trocarDocTipo}
            onValor={setDocumento}
            invalido={docInvalido}
          />
          <div>
            <label className="clientes-view__label">Endereço <span style={{ fontWeight: 400, textTransform: "none" }}>(para delivery, opcional)</span></label>
            <input
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, número, bairro..."
              className="clientes-view__input"
            />
          </div>
          <div>
            <label className="clientes-view__label">Observações <span style={{ fontWeight: 400, textTransform: "none" }}>(opcional)</span></label>
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: sem cebola, apto 302..."
              className="clientes-view__input"
            />
          </div>
        </div>

        {erro && <div className="clientes-view__erro-form">{erro}</div>}

        <div className="clientes-view__modal-botoes">
          <button onClick={onClose} className="clientes-view__btn-cancelar">
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={bloqueado}
            className="clientes-view__btn-confirmar"
            style={{
              background: bloqueado ? varColor(C.faint) : varColor(C.accent),
              cursor: bloqueado ? "not-allowed" : "pointer",
            }}
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
