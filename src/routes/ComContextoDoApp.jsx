import { Outlet } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";

/**
 * Rota-mãe das telas que precisam do estado do app (sessão, tenant,
 * produtos, caixa, realtime).
 *
 * Antes o AppProvider ficava em volta do roteador inteiro, no main.jsx.
 * O efeito colateral: quem só abria a VITRINE em kora.codes — que não
 * tem login, não tem tenant e não mostra dado nenhum do banco — já
 * chegava restaurando sessão, buscando o estabelecimento e abrindo uma
 * conexão permanente de realtime com o Supabase. Uma página de venda
 * ficava conversando com o banco por visitante anônimo, à toa: sem
 * sessão a RLS não deixa passar nada mesmo.
 *
 * Agora o provider é a rota-mãe SÓ das telas do produto (login, PDV,
 * palm, console, cardápio). Vitrine, demonstração e página de endereço
 * inexistente ficam de fora: abrem sem tocar no Supabase. Quem sai da
 * vitrine para o login monta o provider ali; quem volta para a vitrine
 * o desmonta, e a conexão de realtime fecha junto.
 *
 * Não é lazy de propósito: o login é a porta de entrada de todo
 * estabelecimento e continua vindo no primeiro carregamento, sem uma
 * ida extra ao servidor no instante em que o tempo mais pesa.
 */
export default function ComContextoDoApp() {
  return (
    <AppProvider>
      <Outlet />
    </AppProvider>
  );
}
