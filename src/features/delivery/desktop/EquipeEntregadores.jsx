import EntregadorLinha from "@/features/delivery/desktop/EntregadorLinha";
import { LuPlus, LuBike } from "react-icons/lu";
import { criarEntregador, nomeEntregadorValido } from "@/features/delivery/dados/entregadores";
import { useMemo, useState } from "react";


// ── Equipe: cadastro / edição / ativar-desativar ────────────────────
export default function EquipeEntregadores({ isAdmin, entregadores, recarregar, aviso }) {
  const [novoNome, setNovoNome] = useState("");
  const [novoTel, setNovoTel] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [salvando, setSalvando] = useState(false);

  const podeAdicionar = nomeEntregadorValido(novoNome) && !salvando;

  const adicionar = async () => {
    if (!podeAdicionar) return;
    setSalvando(true);
    const { error } = await criarEntregador({
      nome: novoNome,
      telefone: novoTel,
      valor_por_entrega: novoValor,
    });
    setSalvando(false);
    if (error) return aviso(error.message || "Não foi possível cadastrar o entregador.", "err");
    setNovoNome("");
    setNovoTel("");
    setNovoValor("");
    aviso("Entregador cadastrado.", "ok");
    await recarregar();
  };

  const ordenados = useMemo(
    () =>
      [...(entregadores || [])].sort((a, b) =>
        String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR")
      ),
    [entregadores]
  );

  return (
    <>
      {isAdmin && (
        <div className="delivery-view__entregador-form">
          <div className="delivery-view__entregador-form-campos">
            <input
              type="text"
              className="delivery-view__input"
              placeholder="Nome do entregador"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && podeAdicionar) adicionar(); }}
            />
            <input
              type="tel"
              className="delivery-view__input"
              placeholder="Telefone (opcional)"
              value={novoTel}
              onChange={(e) => setNovoTel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && podeAdicionar) adicionar(); }}
            />
            <div className="delivery-view__entregador-valor-campo">
              <span className="delivery-view__entregador-valor-cifrao">R$</span>
              <input
                type="text"
                inputMode="decimal"
                className="delivery-view__input delivery-view__input--valor"
                placeholder="0,00"
                value={novoValor}
                onChange={(e) => setNovoValor(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && podeAdicionar) adicionar(); }}
                title="Valor padrão por entrega (você pode ajustar por pedido)"
              />
              <span className="delivery-view__entregador-valor-legenda">por entrega</span>
            </div>
          </div>
          <button
            type="button"
            className="delivery-view__btn delivery-view__btn--primario"
            onClick={adicionar}
            disabled={!podeAdicionar}
            title={podeAdicionar ? "Cadastrar entregador" : "Informe ao menos o nome"}
          >
            <LuPlus size={15} /> Adicionar
          </button>
        </div>
      )}

      {ordenados.length === 0 ? (
        <div className="delivery-view__vazio">
          <div className="delivery-view__vazio-emoji"><LuBike aria-hidden="true" /></div>
          <div className="delivery-view__vazio-titulo">Nenhum entregador cadastrado</div>
          <div className="delivery-view__vazio-desc">
            {isAdmin
              ? "Cadastre seus entregadores acima para atribuí-los aos pedidos."
              : "Peça a um administrador para cadastrar a equipe de entrega."}
          </div>
        </div>
      ) : (
        <div className="delivery-view__entregador-lista">
          {ordenados.map((e) => (
            <EntregadorLinha
              key={e.id}
              entregador={e}
              isAdmin={isAdmin}
              recarregar={recarregar}
              aviso={aviso}
            />
          ))}
        </div>
      )}
    </>
  );
}
