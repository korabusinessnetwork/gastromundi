/**
 * Registro das telas de módulo do Palm.
 *
 * Cada módulo do hub "Mais" tem a sua tela mobile própria (JSX + CSS
 * co-localizados, decisão 018). Este arquivo é o único ponto que liga a
 * `chave` do módulo — a mesma de `MODULOS_MAIS` no shell — à tela dele,
 * para que MobilePage não precise conhecer os caminhos um a um.
 *
 * Carregamento sob demanda (`lazy`): o garçom que só lança pedido não
 * baixa o código de Financeiro, Relatórios e companhia. O shell envolve
 * o render num `<Suspense>`.
 *
 * Contrato de toda tela daqui: `export default function XModulo({ onVoltar })`,
 * importando `../modulos.css` (base visual compartilhada) + o seu próprio CSS.
 */
import { lazy } from "react";
// A base visual vem junto do registro (e não só de dentro de cada tela) para
// que o estado "Abrindo…" do Suspense já saia estilizado.
import "./modulos.css";

export const TELAS_MODULO = {
  pdv: lazy(() => import("./pdv/PdvModulo")),
  produtos: lazy(() => import("./cardapio/CardapioModulo")),
  estoque: lazy(() => import("./estoque/EstoqueModulo")),
  cozinha: lazy(() => import("./cozinha/CozinhaModulo")),
  delivery: lazy(() => import("./delivery/DeliveryModulo")),
  financeiro: lazy(() => import("./financeiro/FinanceiroModulo")),
  relatorio: lazy(() => import("./relatorios/RelatoriosModulo")),
  clientes: lazy(() => import("./clientes/ClientesModulo")),
  // Configurações não é um cartão de `MODULOS_MAIS`: entra pela engrenagem do
  // hub "Mais". Mora aqui mesmo assim porque obedece ao mesmo contrato
  // (`{ onVoltar }`) e usa o mesmo `<Suspense>` do shell.
  configuracoes: lazy(() => import("./configuracoes/ConfiguracoesModulo")),
};

/**
 * Existe tela nativa no celular para esta chave? Enquanto não existir, o
 * cartão continua levando para a rota de desktop com o aviso "melhor no
 * computador" — o hub nunca promete uma tela que não tem.
 */
export function temTelaMobile(chave) {
  return Object.prototype.hasOwnProperty.call(TELAS_MODULO, chave);
}
