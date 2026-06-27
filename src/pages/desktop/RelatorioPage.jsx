import { useApp } from "@/context/AppContext";
import RelatorioView from "@/components/desktop/views/relatorio/RelatorioView";

export default function RelatorioPage() {
  const app = useApp();
  return <RelatorioView {...app} />;
}
