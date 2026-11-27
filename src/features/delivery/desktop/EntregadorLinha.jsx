import { LuBike, LuCheck, LuPencil, LuPower, LuPowerOff, LuX } from "react-icons/lu";
import { atualizarEntregador, definirAtivoEntregador, nomeEntregadorValido } from "@/features/delivery/dados/entregadores";
import { formatarReais } from "@/features/delivery/regras/admin";
import { formatarTelefone } from "@/features/delivery/dados/deliveryPedidos";
import { useState } from "react";


export default function EntregadorLinha({ entregador, isAdmin, recarregar, aviso }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(entregador.nome || "");
  const [tel, setTel] = useState(entregador.telefone || "");
  const [valor, setValor] = useState(
    entregador.valor_por_entrega ? String(entregador.valor_por_entrega) : ""
  );
  const [salvando, setSalvando] = useState(false);
  const ativo = entregador.ativo !== false;

  const iniciarEdicao = () => {
    setNome(entregador.nome || "");
    setTel(entregador.telefone || "");
    setValor(entregador.valor_por_entrega ? String(entregador.valor_por_entrega) : "");
    setEditando(true);
  };

  const salvar = async () => {
    if (!nomeEntregadorValido(nome) || salvando) return;
    setSalvando(true);
    const { error } = await atualizarEntregador(entregador.id, {
      nome,
      telefone: tel,
      valor_por_entrega: valor,
    });
    setSalvando(false);
    if (error) return aviso(error.message || "Não foi possível salvar.", "err");
    setEditando(false);
    aviso("Entregador atualizado.", "ok");
    await recarregar();
  };

  const alternarAtivo = async () => {
    const { error } = await definirAtivoEntregador(entregador.id, !ativo);
    if (error) return aviso("Não foi possível mudar o status do entregador.", "err");
    aviso(ativo ? "Entregador desativado." : "Entregador reativado.", "ok");
    await recarregar();
  };

  if (editando) {
    return (
      <div className="delivery-view__entregador-linha delivery-view__entregador-linha--edit">
        <input
          type="text"
          className="delivery-view__input"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome"
          autoFocus
        />
        <input
          type="tel"
          className="delivery-view__input"
          value={tel}
          onChange={(e) => setTel(e.target.value)}
          placeholder="Telefone (opcional)"
        />
        <div className="delivery-view__entregador-valor-campo">
          <span className="delivery-view__entregador-valor-cifrao">R$</span>
          <input
            type="text"
            inputMode="decimal"
            className="delivery-view__input delivery-view__input--valor"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div className="delivery-view__entregador-linha-acoes">
          <button
            type="button"
            className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--primario"
            onClick={salvar}
            disabled={!nomeEntregadorValido(nome) || salvando}
          >
            <LuCheck size={13} /> Salvar
          </button>
          <button
            type="button"
            className="delivery-view__btn delivery-view__btn--sm"
            onClick={() => setEditando(false)}
          >
            <LuX size={13} /> Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`delivery-view__entregador-linha${ativo ? "" : " delivery-view__entregador-linha--inativo"}`}>
      <div className="delivery-view__entregador-linha-info">
        <span className="delivery-view__entregador-linha-nome">
          <LuBike size={14} /> {entregador.nome}
          {!ativo && <span className="delivery-view__entregador-tag-inativo">inativo</span>}
        </span>
        <span className="delivery-view__entregador-linha-detalhe">
          {entregador.telefone ? formatarTelefone(entregador.telefone) : "Sem telefone"}
          {" · "}
          {formatarReais(entregador.valor_por_entrega || 0)} por entrega
        </span>
      </div>
      {isAdmin && (
        <div className="delivery-view__entregador-linha-acoes">
          <button
            type="button"
            className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--icone"
            onClick={iniciarEdicao}
            title="Editar entregador"
          >
            <LuPencil size={14} />
          </button>
          <button
            type="button"
            className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--icone"
            onClick={alternarAtivo}
            title={ativo ? "Desativar (não aparece no seletor de pedidos)" : "Reativar entregador"}
          >
            {ativo ? <LuPowerOff size={14} /> : <LuPower size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}
