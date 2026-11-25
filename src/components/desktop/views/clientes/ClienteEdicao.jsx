import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState } from "react";
import { createPortal } from "react-dom";
import {
  LuX
} from "react-icons/lu";
import {
  atualizarCliente, validarCadastroCliente
} from "@/lib/clientes";
import { apenasDigitos, validarDocumento, formatarDocumento } from "@/lib/documento";
import { mascararTelefone, telefoneValido } from "@/lib/telefone";
import CampoDocumento from "@/components/shared/CampoDocumento";

/**
 * Edição de um cliente já cadastrado — mesmos campos do cadastro rápido
 * (nome + telefone obrigatórios; CPF/CNPJ, endereço e observações opcionais).
 * Abre por cima do detalhe e, ao salvar, devolve a linha atualizada via
 * `onSalvo` para a tela refletir na hora, sem recarregar a lista. Botão
 * "Salvar" só habilita quando o cadastro é válido (previne erro, princípio nº 1).
 */
export default function ClienteEdicao({ cliente, usuario, onClose, onSalvo }) {
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
    <div {...fecharAoClicarFora(onClose)} className="clientes-view__overlay clientes-view__overlay--edicao">
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
              <div className="clientes-view__hint-campo">Telefone incompleto, informe DDD e número.</div>
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
            <label className="clientes-view__label">Endereço <span className="clientes-view__label-opcional">(para delivery, opcional)</span></label>
            <input
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Rua, número, bairro..."
              className="clientes-view__input"
            />
          </div>
          <div>
            <label className="clientes-view__label">Observações <span className="clientes-view__label-opcional">(opcional)</span></label>
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
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
