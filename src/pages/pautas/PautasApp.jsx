import { PautasProvider, usePautas } from "@/context/PautasContext";
import PautasLoginPage from "./PautasLoginPage";
import PautasPage from "./PautasPage";
import "./PautasTema.css";
import "./PautasApp.css";

/**
 * Raiz do host das Pautas (ex.: pautas.kora.codes).
 *
 * Não há rotas aqui de propósito: o host tem duas telas e quem escolhe entre
 * elas é a sessão. Sem sessão de sócio, login; com sessão, a lista.
 *
 * Segurança: a checagem de sessão acontece ANTES de montar a tela protegida
 * (regra "sempre verificar autenticação antes de renderizar rotas
 * protegidas"), e a fronteira real continua sendo a RLS de `public.pautas`,
 * que exige um JWT do namespace @pautas.local.
 *
 * Por que é intuitiva (Princípio nº1): quem já entrou uma vez cai direto na
 * lista — sem tela intermediária, sem escolher para onde ir. Enquanto a
 * sessão é conferida aparece uma frase humana ("Abrindo as pautas…") em vez
 * de um piscar entre login e lista.
 */
function PautasRaiz() {
  const { slug, carregando } = usePautas();

  if (carregando) {
    return (
      <div className="pautas-app__espera">
        <p>Abrindo as pautas…</p>
      </div>
    );
  }

  return slug ? <PautasPage /> : <PautasLoginPage />;
}

export default function PautasApp() {
  return (
    <PautasProvider>
      <PautasRaiz />
    </PautasProvider>
  );
}
