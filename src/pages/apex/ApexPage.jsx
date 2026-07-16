import { useEffect } from "react";
import "./ApexPage.css";
import ApexNav from "./ApexNav";
import ApexHero from "./ApexHero";
import ApexProva from "./ApexProva";
import ApexInimigo from "./ApexInimigo";
import ApexFuncionalidades from "./ApexFuncionalidades";
import ApexComoFunciona from "./ApexComoFunciona";
import ApexPlanos from "./ApexPlanos";
import ApexFaq from "./ApexFaq";
import ApexDemo from "./ApexDemo";
import ApexRodape from "./ApexRodape";

/**
 * Site institucional do apex kora.codes (landing de vendas — handoff
 * "design_handoff_site_kora", hi-fi). Quem cai aqui é um dono de
 * restaurante/bar/café avaliando o produto; o funil é atenção →
 * confiança/prova → oferta, terminando em "agendar demonstração"
 * (fluxo de contato = VITE_CONTATO_URL; sem a env, os CTAs de demo
 * apontam para a âncora #demo e o fechamento cai no login).
 *
 * Cada estabelecimento cliente continua acessando pelo seu subdomínio
 * (vai direto ao login com a marca dele) — o site tem um "Entrar"
 * discreto na nav para quem chegar aqui por engano.
 *
 * Estática: sem rotas, sem Supabase, sem estado. Uma seção por
 * componente/arquivo (padrão do projeto), CSS co-localizado
 * (decisões 018/023), tokens --kora-* escopados em .apex.
 */

const CONTATO_URL = import.meta.env.VITE_CONTATO_URL || "";

export default function ApexPage() {
  useEffect(() => {
    document.title = "KORA — O PDV que se adapta a você";
  }, []);

  return (
    <div className="apex">
      <ApexNav contatoUrl={CONTATO_URL} />
      <main>
        <ApexHero />
        <ApexProva />
        <ApexInimigo />
        <ApexFuncionalidades contatoUrl={CONTATO_URL} />
        <ApexComoFunciona />
        <ApexPlanos contatoUrl={CONTATO_URL} />
        <ApexFaq />
        <ApexDemo contatoUrl={CONTATO_URL} />
      </main>
      <ApexRodape />
    </div>
  );
}
