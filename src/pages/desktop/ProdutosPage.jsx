import { useOutletContext } from "react-router-dom";
import ProdutosView from "@/features/cardapio/desktop/ProdutosView";

export default function ProdutosPage() {
  const { notify } = useOutletContext();
  return <ProdutosView notify={notify} />;
}
