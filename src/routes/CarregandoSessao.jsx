import "./CarregandoSessao.css";

/**
 * Espera de uma rota protegida enquanto a sessão ainda está sendo restaurada.
 *
 * A sessão local mora no `sessionStorage`, que é por aba: numa aba nova aberta
 * direto em `/app/pdv` (link colado, favorito, janela restaurada), o
 * `currentUser` é nulo enquanto o `getSession()` do Supabase está no ar. Sem
 * esta espera, a pessoa era mandada ao login mesmo tendo token válido e voltava
 * ao destino segundos depois, piscando duas telas no caminho.
 *
 * Sem marca: o tenant pode nem estar carregado ainda, e a porta de entrada
 * jamais deve vestir a marca de outro estabelecimento (decisão 017). A cor vem
 * dos tokens --gm-*, então quando o tema já está aplicado ela combina.
 *
 * Só aparece depois de 200ms, por atraso na animação em vez de timer em JS: com
 * a sessão em cache a restauração termina antes disso e ninguém vê nada piscar.
 */
export default function CarregandoSessao() {
  return (
    <div className="carregando-sessao" role="status" aria-live="polite">
      Carregando…
    </div>
  );
}
