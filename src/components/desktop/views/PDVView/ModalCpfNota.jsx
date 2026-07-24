import { useState } from "react";
import { createPortal } from "react-dom";
import { LuX, LuFileText } from "react-icons/lu";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { apenasDigitos, validarDocumento, formatarDocumento } from "@/lib/documento";
import { destDoCliente } from "@/lib/nfceVenda";
import CampoDocumento from "@/components/shared/CampoDocumento";
import "./ModalCpfNota.css";

/**
 * Etapa "CPF na nota" — aparece ao finalizar a venda quando o add-on `nfe`
 * está ligado (em TODA venda com nota, inclusive cartão/TEF). O operador
 * informa o CPF/CNPJ do cliente para sair na NFC-e ou deixa em branco: nesse
 * caso a nota sai anônima (comportamento padrão).
 *
 * Intuitividade (princípio nº 1):
 * - Uma ação óbvia: o botão verde diz o que vai acontecer ("Emitir sem CPF"
 *   quando vazio, "Emitir com CPF/CNPJ" quando preenchido).
 * - Prevenção > erro: só emite com documento quando ele é válido (dígito
 *   verificador, módulo 11); deixar em branco é sempre permitido — ninguém é
 *   forçado a digitar.
 * - Se a venda tem cliente vinculado com documento, o campo já vem preenchido
 *   (o operador não redigita).
 *
 * Reúsa o mesmo toggle CPF/CNPJ do cadastro (CampoDocumento) para consistência
 * total. Não grava nem emite nada: só monta o `dest` e devolve via
 * onConfirmar(dest); a emissão continua fire-and-forget no fluxo de finalização.
 */
export default function ModalCpfNota({ total = 0, cliente = null, onConfirmar, onCancelar }) {
  const [tipo, setTipo] = useState(cliente?.documento_tipo === "cnpj" ? "cnpj" : "cpf");
  const [valor, setValor] = useState(
    cliente?.documento ? formatarDocumento(cliente.documento, cliente.documento_tipo) : ""
  );

  // Trocar o tipo re-mascara os dígitos já digitados sob a nova máscara.
  const trocarTipo = (t) => {
    setTipo(t);
    setValor(formatarDocumento(valor, t));
  };

  const digitos    = apenasDigitos(valor);
  const preenchido = digitos.length > 0;
  const docValido  = validarDocumento(valor, tipo);
  const invalido   = preenchido && !docValido; // preenchido e inconsistente
  const podeEmitir = !preenchido || docValido; // vazio (anônima) OU documento válido

  const docLabel = tipo === "cnpj" ? "CNPJ" : "CPF";

  const confirmar = () => {
    if (!podeEmitir) return;
    if (!preenchido) {
      onConfirmar(null); // sem documento → NFC-e anônima
      return;
    }
    // Só leva o nome do cliente para a nota quando o documento digitado ainda
    // é o do cliente vinculado — evita nome de A com documento de B.
    const nome =
      cliente?.documento && apenasDigitos(cliente.documento) === digitos ? cliente.nome : undefined;
    onConfirmar(destDoCliente({ documento: valor, documento_tipo: tipo, nome }) ?? null);
  };

  return createPortal(
    <div {...fecharAoClicarFora(onCancelar)} className="modal-cpf-nota__overlay">
      <div className="modal-cpf-nota__modal" role="dialog" aria-modal="true" aria-label="CPF na nota fiscal">
        <div className="modal-cpf-nota__header">
          <div className="modal-cpf-nota__titulo-wrap">
            <span className="modal-cpf-nota__icone" aria-hidden="true"><LuFileText size={20} /></span>
            <div>
              <div className="modal-cpf-nota__titulo">CPF na nota fiscal</div>
              <div className="modal-cpf-nota__subtitulo">
                Opcional — informe o documento do cliente ou deixe em branco.
              </div>
            </div>
          </div>
          <button type="button" onClick={onCancelar} className="modal-cpf-nota__fechar" aria-label="Voltar">
            <LuX size={20} />
          </button>
        </div>

        <div className="modal-cpf-nota__corpo">
          <CampoDocumento
            tipo={tipo}
            valor={valor}
            onTipo={trocarTipo}
            onValor={setValor}
            invalido={invalido}
            label="CPF / CNPJ do cliente"
            onEnter={confirmar}
          />
          {!invalido && (
            <div className="modal-cpf-nota__consequencia">
              {preenchido
                ? `A nota sairá com o ${docLabel} informado.`
                : "Sem documento, a nota sairá anônima (sem CPF)."}
            </div>
          )}
        </div>

        <div className="modal-cpf-nota__acoes">
          <button type="button" onClick={onCancelar} className="modal-cpf-nota__btn-voltar">
            Voltar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!podeEmitir}
            autoFocus
            className="modal-cpf-nota__btn-emitir"
          >
            {preenchido ? `Emitir com ${docLabel}` : "Emitir sem CPF"}
            <span className="modal-cpf-nota__btn-total">R$ {Number(total).toFixed(2)}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
