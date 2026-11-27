import EquipeEntregadores from "@/features/delivery/desktop/EquipeEntregadores";
import FechamentoEntregadores from "@/features/delivery/desktop/FechamentoEntregadores";
import { useState } from "react";


// ════════════════════════════════════════════════════════════════
// ABA — Entregadores (equipe de entrega + fechamento do dia)
// ════════════════════════════════════════════════════════════════
//
// Duas coisas numa aba, por sub-seção (Princípio nº 1 — uma tela, um
// assunto claro):
//   • Equipe: cadastrar/editar/ativar entregadores (nome, telefone e o
//     valor padrão por entrega). Desativar preserva histórico — nunca
//     apaga, senão o fechamento passado sumia.
//   • Fechamento do dia: escolhe o período e mostra, por entregador,
//     quantas entregas confirmadas, quantas em rota e QUANTO PAGAR. Paga
//     só a corrida concluída (status 'entregue') — dinheiro é conservador.
//
// A lista de entregadores vem de cima (DeliveryView) — a mesma que o
// seletor do cartão de pedido usa, sem recarregar duplicado.
export default function AbaEntregadores({
  isAdmin,
  entregadores,
  recarregar,
  aviso,
  currentUser,
  caixaAberto,
  dinheiroNaGaveta,
  registrarMovimentoCaixa,
}) {
  const [secao, setSecao] = useState("equipe");

  return (
    <div className="delivery-view__entregadores">
      <div className="delivery-view__sub-abas">
        <button
          type="button"
          onClick={() => setSecao("equipe")}
          className={`delivery-view__sub-aba${secao === "equipe" ? " delivery-view__sub-aba--ativa" : ""}`}
        >
          Equipe
        </button>
        <button
          type="button"
          onClick={() => setSecao("fechamento")}
          className={`delivery-view__sub-aba${secao === "fechamento" ? " delivery-view__sub-aba--ativa" : ""}`}
        >
          Pagamento
        </button>
      </div>

      {secao === "equipe" ? (
        <EquipeEntregadores
          isAdmin={isAdmin}
          entregadores={entregadores}
          recarregar={recarregar}
          aviso={aviso}
        />
      ) : (
        <FechamentoEntregadores
          entregadores={entregadores}
          aviso={aviso}
          isAdmin={isAdmin}
          currentUser={currentUser}
          caixaAberto={caixaAberto}
          dinheiroNaGaveta={dinheiroNaGaveta}
          registrarMovimentoCaixa={registrarMovimentoCaixa}
        />
      )}
    </div>
  );
}
