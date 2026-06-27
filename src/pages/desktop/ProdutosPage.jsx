import { useOutletContext } from "react-router-dom";
import ProdutosView from "@/components/desktop/views/ProdutosView";

export default function ProdutosPage() {
  const { notify } = useOutletContext();
  return <ProdutosView notify={notify} />;
}
