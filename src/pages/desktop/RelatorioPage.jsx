import RelatorioView from "@/features/relatorios/desktop/RelatorioView";

// O RelatorioView lê do contexto por conta própria e não recebe propriedade
// nenhuma. Repassar o contexto inteiro como props só fazia esta página ser
// redesenhada a cada mudança do app (tarefa 2.8 do plano de refatoração).
export default function RelatorioPage() {
  return <RelatorioView />;
}
