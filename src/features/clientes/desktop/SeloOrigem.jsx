import { LuStore, LuBike } from "react-icons/lu";
import { origemDoCliente } from "@/features/clientes/dados/clientes";

/**
 * De onde veio o cadastro, com a mesma palavra que o menu usa ("Frente de
 * caixa") — quem lê o selo já sabe em que tela aquele cliente apareceu.
 */
export default function SeloOrigem({ cliente }) {
  const delivery = origemDoCliente(cliente) === "delivery";
  return (
    <span className={`clientes-view__selo clientes-view__selo--${delivery ? "delivery" : "pdv"}`}>
      {delivery ? <LuBike size={11} /> : <LuStore size={11} />}
      {delivery ? "Delivery" : "Frente de caixa"}
    </span>
  );
}
