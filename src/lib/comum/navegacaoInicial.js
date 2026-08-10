import MODULOS from "@/constants/modulos";

/**
 * Rotas candidatas a "casa" do usuário, em ordem de preferência operacional.
 * Cada entrada exige a MESMA permissão (e módulo, quando houver) que a rota
 * real em `src/routes/index.jsx`. Assim, o destino escolhido aqui SEMPRE passa
 * na checagem do PrivateRoute de chegada — sem laço de redirecionamento.
 *
 * As rotas com `modulo` só são escolhidas quando o plano do tenant as inclui
 * (via `moduloHabilitado`), então o usuário nunca cai no aviso de upgrade como
 * "casa". `pdv`, `palm` e `configuracoes` não têm gating de plano.
 */
export const ROTAS_INICIAIS = [
  { perm: "pdv", rota: "/app/pdv" },
  { perm: "palm", rota: "/palm" },
  { perm: "cozinha", rota: "/app/cozinha", modulo: MODULOS.COZINHA },
  { perm: "produtos", rota: "/app/produtos", modulo: MODULOS.CARDAPIO },
  { perm: "estoque", rota: "/app/estoque", modulo: MODULOS.ESTOQUE },
  { perm: "financeiro", rota: "/app/financeiro", modulo: MODULOS.FINANCEIRO },
  { perm: "relatorio", rota: "/app/relatorio", modulo: MODULOS.RELATORIOS },
  { perm: "clientes", rota: "/app/clientes", modulo: MODULOS.CLIENTES },
  { perm: "configuracoes", rota: "/app/configuracoes" },
];

/**
 * Primeira rota cuja permissão o usuário possui (e cujo módulo, se houver,
 * está habilitado no plano). Retorna `null` quando o usuário não tem nenhuma
 * permissão de navegação — caso raro (todo cargo tem ao menos Palm ou PDV),
 * mas possível via override por funcionário; o chamador trata como "sem acesso"
 * em vez de redirecionar (evita o laço de redirecionamento).
 *
 * Função pura: `moduloHabilitado` é opcional; ausente => nenhum gating de plano.
 *
 * @param {Record<string, boolean>|null|undefined} permissions - mapa efetivo
 * @param {(modulo: string) => boolean} [moduloHabilitado]     - gating de plano
 * @returns {string|null} caminho da rota inicial, ou null se nada for acessível
 */
export function rotaInicialPermitida(permissions, moduloHabilitado) {
  const p = permissions || {};
  const okModulo =
    typeof moduloHabilitado === "function" ? moduloHabilitado : () => true;
  for (const item of ROTAS_INICIAIS) {
    if (!p[item.perm]) continue;
    if (item.modulo && !okModulo(item.modulo)) continue;
    return item.rota;
  }
  return null;
}
