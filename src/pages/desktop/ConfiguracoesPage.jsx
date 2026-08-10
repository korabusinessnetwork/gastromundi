import { useOutletContext } from "react-router-dom";
import ConfiguracoesView from "@/components/configuracoes/ConfiguracoesView";

export default function ConfiguracoesPage() {
  const { notify } = useOutletContext();
  return <ConfiguracoesView notify={notify} />;
}
