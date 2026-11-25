import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSessao } from "@/context/AppContext";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import {
  LuUsers, LuSearch, LuPlus, LuPhone, LuMapPin, LuX, LuCircleAlert
} from "react-icons/lu";
import {
  listarClientes, cadastrarCliente
} from "@/lib/clientes";
import { apenasDigitos, validarDocumento, formatarDocumento } from "@/lib/documento";
import { mascararTelefone, telefoneValido, formatarTelefone } from "@/lib/telefone";
import CampoDocumento from "@/components/shared/CampoDocumento";
import DocumentoProtegido from "@/components/shared/DocumentoProtegido";
import "./ClientesView.css";
import ClienteDetalhe from "./clientes/ClienteDetalhe";
import ClienteEdicao from "./clientes/ClienteEdicao";
import { ehGerencia } from "@/constants/roles";

/**
 * F010 — Clientes (docs/03_REGRAS_DE_NEGOCIO/CLIENTES.md).
 *
 * Lista/busca clientes, cadastro rápido (nome + telefone obrigatórios)
 * e, ao abrir um cliente, mostra histórico de compras e o fiado (via
 * Financeiro — não é um sistema à parte): saldo devedor em destaque e
 * ação de registrar pagamento (baixa da conta a receber).
 */
export default function ClientesView() {
  const { currentUser } = useSessao();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div
      className="clientes-view"
      style={{ "--clientes-pad": `${sz.pad}px`, "--clientes-pad-sm": `${sz.padSm}px`, "--clientes-gap": `${sz.gap}px` }}
    >

      {/* Header */}
      <div className="clientes-view__header">
        <div>
          <div className="clientes-view__titulo">Clientes</div>
          <div className="clientes-view__subtitulo">Cadastro, histórico de compras e fiado</div>
        </div>
        <button
          onClick={abrirCadastro}
          className="clientes-view__btn-novo"
        >
          <LuPlus size={16} /> Novo Cliente
        </button>
      </div>

      {/* Busca */}
      <div className="clientes-view__busca-wrap">
        <div className="clientes-view__busca">
          <LuSearch size={15} className="clientes-view__busca-icone" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="clientes-view__busca-input"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="clientes-view__lista-area">
        {erro && (
          <div className="clientes-view__alerta" role="alert">
            <LuCircleAlert size={18} /> {erro}
          </div>
        )}

        {carregando ? (
          <div className="clientes-view__estado">
            <div className="clientes-view__msg-estado">Carregando clientes...</div>
          </div>
        ) : clientes.length === 0 ? (
          <div className="clientes-view__estado">
            <LuUsers size={44} className="clientes-view__icone-vazio" />
            <div className="clientes-view__titulo-estado">
              {busca.trim() ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
            </div>
            {!busca.trim() && (
              <div className="clientes-view__msg-vazio">Clique em "Novo Cliente" para cadastrar o primeiro</div>
            )}
          </div>
        ) : (
          <div className="clientes-view__grid">
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
                  <div className="clientes-view__hint-campo">Telefone incompleto, informe DDD e número.</div>
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
                <label className="clientes-view__label">Endereço <span className="clientes-view__label-opcional">(para delivery, opcional)</span></label>
                <input
                  value={novoEndereco}
                  onChange={(e) => setNovoEndereco(e.target.value)}
                  placeholder="Rua, número, bairro..."
                  className="clientes-view__input"
                />
              </div>
              <div>
                <label className="clientes-view__label">Observações <span className="clientes-view__label-opcional">(opcional)</span></label>
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
          podeExcluir={ehGerencia(currentUser)}
          // Mesma régua da exclusão: quem responde pelo cadastro é quem pode
          // abrir o CPF por inteiro. Garçom e caixa continuam com o cliente
          // (precisam para delivery e fiado), mas veem o documento oculto.
          podeVerDocumento={ehGerencia(currentUser)}
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
