import { useState } from "react";

// Add-ons por estabelecimento, o cartão de primeiro acesso, a cópia dos dados e a busca.
export function useEstadoCadastroConsole() {
  const [addonsPorTenant, setAddonsPorTenant] = useState({});
  const [addonsMudaram, setAddonsMudaram] = useState(false);
  const [sucesso, setSucesso] = useState(null);
  // Estado do botão "Copiar dados de acesso" do cartão de primeiro acesso.
  // `copiaFalhou` existe porque engolir a falha seria pior do que não ter o
  // botão: o dono acharia que copiou e mandaria uma mensagem vazia.
  const [copiado, setCopiado] = useState(false);
  const [copiaFalhou, setCopiaFalhou] = useState(false);
  // O mesmo par, agora por CARD da lista (CONSOLE-UX 16): guarda o id do
  // estabelecimento cujo acesso acabou de ser copiado — e não um booleano —
  // porque com um booleano todos os cards diriam "Copiado!" ao mesmo tempo.
  const [acessoCopiadoId, setAcessoCopiadoId] = useState(null);
  const [acessoFalhouId, setAcessoFalhouId] = useState(null);
  const [busca, setBusca] = useState("");

  return {
    addonsPorTenant, setAddonsPorTenant, addonsMudaram, setAddonsMudaram, sucesso, setSucesso,
    copiado, setCopiado, copiaFalhou, setCopiaFalhou, acessoCopiadoId, setAcessoCopiadoId,
    acessoFalhouId, setAcessoFalhouId, busca, setBusca,
  };
}
