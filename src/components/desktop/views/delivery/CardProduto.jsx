import { useState } from "react";
import {
  LuPencil, LuTrash2, LuX
} from "react-icons/lu";
import {
  formatarReais
} from "@/lib/deliveryAdmin";

export default function CardProduto({ item, isAdmin, ehAddon, onEditar, onRemover, onToggle }) {
  const nome = item.produto?.name || "(produto removido do PDV)";
  const preco = item.produto?.price;
  const emoji = item.produto?.emoji || "🍽️";
  const [confirmar, setConfirmar] = useState(false);

  return (
    <div className="delivery-view__card">
      <div className="delivery-view__card-topo">
        {item.foto_url ? (
          <img className="delivery-view__card-foto" src={item.foto_url} alt={nome} />
        ) : (
          <div className="delivery-view__card-emoji">{emoji}</div>
        )}
        <div className="delivery-view__card-corpo">
          <div className="delivery-view__card-nome">{nome}</div>
          {item.descricao ? (
            <div className="delivery-view__card-desc">{item.descricao}</div>
          ) : (
            <div className="delivery-view__card-desc delivery-view__card-desc--vazia">
              Sem descrição, clique em editar para caprichar.
            </div>
          )}
        </div>
      </div>

      <div className="delivery-view__card-divisor" />

      <div className="delivery-view__card-preco-linha">
        <span className="delivery-view__card-preco">
          {preco != null ? formatarReais(preco) : "—"}
        </span>
        <button
          onClick={onToggle}
          disabled={!isAdmin}
          className={`delivery-view__pill delivery-view__pill--${item.disponivel ? "on" : "off"}`}
          title="Ligar/desligar no cardápio"
        >
          <span className="delivery-view__card-dot" />
          {item.disponivel ? "Disponível" : "Indisponível"}
        </button>
      </div>

      {isAdmin && (
        <div className="delivery-view__card-acoes">
          {confirmar ? (
            <>
              <button
                onClick={onRemover}
                className="delivery-view__card-editar delivery-view__card-editar--perigo"
              >
                <LuTrash2 size={15} /> Confirmar remoção
              </button>
              <button
                onClick={() => setConfirmar(false)}
                className="delivery-view__card-remover delivery-view__card-remover--neutro"
                title="Cancelar"
              >
                <LuX size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onEditar}
                className="delivery-view__card-editar"
              >
                <LuPencil size={15} /> Editar
              </button>
              <button
                onClick={() => setConfirmar(true)}
                className="delivery-view__card-remover"
                title={ehAddon ? "Tirar do delivery" : "Excluir"}
              >
                <LuTrash2 size={16} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
