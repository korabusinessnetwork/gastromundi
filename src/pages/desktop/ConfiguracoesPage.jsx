import { useOutletContext } from "react-router-dom";
import ConfiguracoesView from "@/features/configuracoes/desktop/ConfiguracoesView";

export default function ConfiguracoesPage() {
  const { notify } = useOutletContext();
  return <ConfiguracoesView notify={notify} />;
}
