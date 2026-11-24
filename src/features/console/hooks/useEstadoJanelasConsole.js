import { useState } from "react";

// Qual janela do Console está aberta e para qual estabelecimento, e a fila de pedidos de conta.
export function useEstadoJanelasConsole() {
  const [modalAberto, setModalAberto] = useState(false);
  // Fila de pedidos de conta feitos no site (20260926). Vive ao lado dos
  // estabelecimentos porque é a MESMA gestão de base vista um passo antes:
  // quem ainda vai virar cliente.
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [erroSolicitacoes, setErroSolicitacoes] = useState(false);
  // Pedido que o dono está aprovando AGORA: é ele que preenche o formulário
  // de criação e, quando o estabelecimento nascer, sai da fila vinculado a
  // ele. `null` = criação avulsa, do botão "Novo estabelecimento".
  const [solicitacaoAprovando, setSolicitacaoAprovando] = useState(null);
  const [tenantSelecionado, setTenantSelecionado] = useState(null);
  const [tenantLayoutSelecionado, setTenantLayoutSelecionado] = useState(null);
  const [tenantAddonsSelecionado, setTenantAddonsSelecionado] = useState(null);
  // Linha de cobrança (do `resumirPlataforma`) que está sendo renovada pelo
  // card. Guarda a LINHA, não o tenant, porque é o que o modal de renovação
  // já sabe consumir na outra aba.
  const [linhaRenovacao, setLinhaRenovacao] = useState(null);
  // Linha cujo histórico de pagamentos está aberto. Mesmo formato do
  // `linhaRenovacao` — os dois modais consomem a linha do `resumirPlataforma`.
  const [linhaHistorico, setLinhaHistorico] = useState(null);
  // Linha cujo preço está sendo definido pelo card (CONSOLE-UX 13). Mesmo
  // formato dos outros dois — os três modais consomem a linha do resumo.
  const [linhaMensalidade, setLinhaMensalidade] = useState(null);

  return {
    modalAberto, setModalAberto, solicitacoes, setSolicitacoes, erroSolicitacoes,
    setErroSolicitacoes, solicitacaoAprovando, setSolicitacaoAprovando, tenantSelecionado,
    setTenantSelecionado, tenantLayoutSelecionado, setTenantLayoutSelecionado,
    tenantAddonsSelecionado, setTenantAddonsSelecionado, linhaRenovacao, setLinhaRenovacao,
    linhaHistorico, setLinhaHistorico, linhaMensalidade, setLinhaMensalidade,
  };
}
