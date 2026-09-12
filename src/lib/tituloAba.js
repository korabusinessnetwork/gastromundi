import { MARCA_PLATAFORMA } from "./tema";

/**
 * Título da aba do navegador, por tela.
 *
 * O problema que isto resolve é de quem opera, não de estética: a aba dizia
 * "KORA" em todas as telas do estabelecimento, então quem trabalha com a frente
 * de caixa, a cozinha e o relatório abertos em três abas (que é o normal no
 * balcão) via três abas idênticas e tinha de clicar em cada uma para descobrir
 * qual era qual. E o nome do estabelecimento não aparecia em lugar nenhum ali,
 * o que num produto white-label é a marca da plataforma na aba de um cliente.
 *
 * O nome da TELA vem primeiro de propósito: é o que muda entre as abas, e o
 * navegador corta o fim do título quando a aba é estreita. O nome do
 * estabelecimento fica depois, para diferenciar quem abre dois estabelecimentos
 * ao mesmo tempo.
 */

/**
 * Rótulos em português do dia a dia, iguais aos da barra lateral. Sem o caminho
 * na frente e sem jargão: quem lê a aba é o operador.
 */
export const NOMES_DE_TELA = {
  "/app": "Início",
  "/app/pdv": "Frente de caixa",
  "/app/produtos": "Produtos",
  "/app/delivery": "Delivery",
  "/app/relatorio": "Relatórios",
  "/app/configuracoes": "Configurações",
  "/app/estoque": "Estoque",
  "/app/financeiro": "Financeiro",
  "/app/cozinha": "Cozinha",
  "/app/clientes": "Clientes",
  "/app/admin": "Gestão",
  "/app/notas-fiscais": "Notas fiscais",
  "/app/fiscal": "Configuração fiscal",
};

/** As telas de `/app` têm título próprio; o resto segue com a marca do tenant. */
export function ehRotaDoApp(caminho) {
  const c = typeof caminho === "string" ? caminho : "";
  return c === "/app" || c.startsWith("/app/");
}

/** Nome da tela a partir do caminho, tolerante a barra final e a rota nova. */
export function nomeDaTela(caminho) {
  const c = (typeof caminho === "string" ? caminho : "").replace(/\/+$/, "") || "/app";
  return NOMES_DE_TELA[c] ?? null;
}

/**
 * "Frente de caixa, GASTROMUNDI".
 *
 * Sem nome de estabelecimento (bootstrap em voo, leitura de tenant que falhou),
 * cai na marca da plataforma em vez de deixar a aba sem identidade. Rota que
 * ainda não está no mapa devolve só a marca, que é o comportamento de antes:
 * uma tela nova não pode nascer com a aba escrita errada.
 */
export function tituloDaAba(caminho, nomeTenant) {
  const marca = (typeof nomeTenant === "string" && nomeTenant.trim()) || MARCA_PLATAFORMA;
  const tela = nomeDaTela(caminho);
  return tela ? `${tela}, ${marca}` : marca;
}
