import { useOutletContext } from "react-router-dom";
import ProdutosView from "@/components/produtos/ProdutosView";

export default function ProdutosPage() {
  const { notify } = useOutletContext();
  return <ProdutosView notify={notify} />;
}
