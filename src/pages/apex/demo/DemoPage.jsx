import { useEffect, useState } from "react";
import "./DemoPage.css";
import DemoLogin from "./DemoLogin";
import DemoShell from "./DemoShell";
import DemoPDV from "./DemoPDV";
import DemoEstoque from "./DemoEstoque";
import DemoClientes from "./DemoClientes";
import DemoRelatorios from "./DemoRelatorios";

/**
 * Protótipo navegável do KORA no site institucional (/demo do apex).
 * Funil: o visitante clica "Ver o KORA rodando" no hero, cai numa
 * réplica da tela de login (arte genérica KORA, credenciais fictícias
 * já preenchidas) e entra num app de mentira com Frente de Caixa,
 * Estoque, Clientes e Relatórios — tudo dado fictício, em memória.
 *
 * 100% desconectada: nenhum Supabase, nenhum AppContext, nada persiste.
 * Visual do PRODUTO (tokens --gm-*), não do site (--kora-*): a graça é
 * mostrar o sistema como ele é de verdade.
 */

const TELAS = {
  pdv: DemoPDV,
  estoque: DemoEstoque,
  clientes: DemoClientes,
  relatorios: DemoRelatorios,
};

export default function DemoPage() {
  // 'login' → réplica da porta de entrada; depois a chave da tela ativa.
  const [etapa, setEtapa] = useState("login");

  useEffect(() => {
    document.title = "Demonstração — KORA";
  }, []);

  if (etapa === "login") {
    return (
      <div className="demo">
        <DemoLogin aoEntrar={() => setEtapa("pdv")} />
      </div>
    );
  }

  const TelaAtiva = TELAS[etapa] || DemoPDV;
  return (
    <div className="demo">
      <DemoShell telaAtiva={etapa} aoTrocarTela={setEtapa}>
        <TelaAtiva />
      </DemoShell>
    </div>
  );
}
