// O dia UTC vira às 21h de Brasília: a nota lançada à noite nascia com a data
// de emissão de amanhã e a entrada de estoque caía no dia seguinte.
// A quantidade convertida vai direto para o saldo do estoque: sem arredondar,
// 3 × 0,35 grava 1.0499999999999998 e o saldo carrega a sujeira para sempre.
// TD015: a linha da nota carrega estado próprio (busca do produto, dropdown
// aberto), então a chave de renderização não pode ser a posição na lista.
import { useNotasFiscais } from "@/features/estoque/hooks/useNotasFiscais";
import NotaManual from "./notasFiscais/NotaManual";
import NotaDetalhe from "./notasFiscais/NotaDetalhe";
import NotaAssistenteXml from "./notasFiscais/NotaAssistenteXml";
import NotaLista from "./notasFiscais/NotaLista";
import "./NotasFiscaisTab.css";

export default function NotasFiscaisTab({ fornecedores = [], onAddFornecedor }) {
  const nf = useNotasFiscais({ fornecedores, onAddFornecedor });

  if (nf.view === "manual") return <NotaManual nf={nf} />;
  if (nf.view === "detalhe" && nf.notaDetalhe) return <NotaDetalhe nf={nf} />;
  if (nf.view === "wizard") return <NotaAssistenteXml nf={nf} />;
  return <NotaLista nf={nf} />;
}
