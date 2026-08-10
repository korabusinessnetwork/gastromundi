import { useApp } from "@/context/AppContext";
import RelatorioView from "@/components/relatorios/RelatorioView";

export default function RelatorioPage() {
  const app = useApp();
  return <RelatorioView {...app} />;
}
