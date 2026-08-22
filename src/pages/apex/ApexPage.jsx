import { useCallback, useEffect, useState } from "react";
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
import ApexAgendamento from "./ApexAgendamento";

/**
 * Site institucional do apex kora.codes (landing de vendas — handoff
 * "design_handoff_site_kora", hi-fi). Quem cai aqui é um dono de
 * restaurante/bar/café avaliando o produto; o funil é atenção →
 * confiança/prova → oferta, terminando em "agendar demonstração".
 *
 * Cada estabelecimento cliente continua acessando pelo seu subdomínio
 * (vai direto ao login com a marca dele) — o site tem um "Entrar"
 * discreto na nav para quem chegar aqui por engano.
 *
 * O AGENDAMENTO MORA AQUI, e não dentro de uma seção, porque ele é o
 * caminho principal da página inteira: nav, herói, funcionalidades,
 * construtor de plano e fechamento abrem o MESMO formulário. Antes só o
 * construtor pedia contato, e todos os outros CTAs mandavam o visitante
 * para o protótipo /demo — ou seja, o caminho mais visível da página
 * nunca perguntava quem era a pessoa.
 *
 * Cada CTA diz de onde veio (`origem`) e, quando faz sentido, o que a
 * pessoa montou (`plano`). Isso chega no Console junto com o lead: um
 * contato vindo do herói e um vindo do construtor de plano com R$ 389
 * em módulos não são a mesma conversa.
 *
 * Sem Supabase até alguém clicar: o formulário só grava quando enviado.
 * Uma seção por componente/arquivo (padrão do projeto), CSS
 * co-localizado (decisões 018/023), tokens --kora-* escopados em .apex.
 */

const CONTATO_URL = import.meta.env.VITE_CONTATO_URL || "";

export default function ApexPage() {
  // `null` = fechado. Aberto guarda de onde o clique veio e, se houver,
  // o plano montado — o formulário mostra o resumo só quando existe.
  const [agendamento, setAgendamento] = useState(null);

  useEffect(() => {
    document.title = "KORA — O PDV que se adapta a você";
  }, []);

  const abrirAgendamento = useCallback((origem, plano = null) => {
    setAgendamento({ origem, plano });
  }, []);

  const fecharAgendamento = useCallback(() => setAgendamento(null), []);

  return (
    <div className="apex">
      <ApexNav onAgendar={() => abrirAgendamento("apex_nav")} />
      <main>
        <ApexHero onAgendar={() => abrirAgendamento("apex_hero")} />
        <ApexProva />
        <ApexInimigo />
        <ApexFuncionalidades
          onAgendar={() => abrirAgendamento("apex_funcionalidades")}
        />
        <ApexComoFunciona />
        <ApexPlanos
          onAgendar={(plano) => abrirAgendamento("apex_planos", plano)}
        />
        <ApexFaq />
        <ApexDemo
          contatoUrl={CONTATO_URL}
          onAgendar={() => abrirAgendamento("apex_fechamento")}
        />
      </main>
      <ApexRodape />

      <ApexAgendamento
        aberto={agendamento !== null}
        onFechar={fecharAgendamento}
        plano={agendamento?.plano ?? null}
        origem={agendamento?.origem}
      />
    </div>
  );
}
