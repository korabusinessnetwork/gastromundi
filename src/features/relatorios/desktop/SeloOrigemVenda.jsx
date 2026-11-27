import { LuStore, LuBike } from "react-icons/lu";
import { origemDaVenda, ROTULO_ORIGEM } from "@/features/relatorios/regras/relatorioDelivery";

/** De onde veio a venda: frente de caixa ou delivery. */
export default function SeloOrigemVenda({ venda }) {
  const delivery = origemDaVenda(venda) === "delivery";
  const Icone = delivery ? LuBike : LuStore;
  return (
    <span className={`relatorio-view__selo-origem relatorio-view__selo-origem--${delivery ? "delivery" : "pdv"}`}>
      <Icone size={12} /> {ROTULO_ORIGEM[delivery ? "delivery" : "pdv"]}
    </span>
  );
}
