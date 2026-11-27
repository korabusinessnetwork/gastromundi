import { useState } from "react";
import {
  LuPencil, LuTrash2, LuX, LuUtensils } from "react-icons/lu";
import {
  formatarReais
} from "@/features/delivery/deliveryAdmin";

export default function CardProduto({ item, isAdmin, ehAddon, onEditar, onRemover, onToggle }) {
  const nome = item.produto?.name || "(produto removido do PDV)";
  const preco = item.produto?.price;
  const [confirmar, setConfirmar] = useState(false);

  return (
    <div className="delivery-view__card">
      <div className="delivery-view__card-topo">
        {item.foto_url ? (
          <img className="delivery-view__card-foto" src={item.foto_url} alt={nome} />
        ) : (
          <div className="delivery-view__card-emoji"><LuUtensils aria-hidden="true" /></div>
        )}
        <div className="delivery-view__card-corpo">
          {/* Disponibilidade fica AQUI, ao lado do nome, e não dentro do
              "Editar". Tirar um item do ar é a coisa mais frequente do dia
              (acabou o ingrediente) e precisa ser um clique na grade, não
              abrir modal, achar a chave, salvar e fechar. Dentro do editar
              ela também virava rascunho: só valia depois do "Salvar". */}
          <div className="delivery-view__card-nome-linha">
            <div className="delivery-view__card-nome">{nome}</div>
            <button
              onClick={onToggle}
              disabled={!isAdmin}
              role="switch"
              aria-checked={!!item.disponivel}
              aria-label={`Oferecer ${nome} no cardápio online`}
              title={item.disponivel
                ? "Está no cardápio online. Clique para tirar do ar."
                : "Fora do cardápio online. Clique para voltar a oferecer."}
              className={`delivery-view__disp delivery-view__disp--compacto delivery-view__disp--${item.disponivel ? "on" : "off"}`}
            >
              {/* Só o trilho e a bolinha, sem a palavra. Aqui o card tem
                  300px e a chave com texto comia 130 deles: "Hmaburguer de
                  cheedar" virava "Hmabur…", e cardápio em que não se lê o
                  nome do produto não serve. O estado continua dito por
                  extenso no title e no aria-label; na tabela de Produtos,
                  que tem coluna própria, a palavra aparece. */}
              <span className="delivery-view__disp-trilho" aria-hidden="true">
                <span className="delivery-view__disp-bola" />
              </span>
            </button>
          </div>
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
