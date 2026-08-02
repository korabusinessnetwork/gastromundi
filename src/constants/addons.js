/**
 * Códigos de add-on pago — espelham `public.addons.codigo`
 * (supabase/migrations/20260718_addons.sql).
 *
 * Add-ons são um eixo ORTOGONAL ao plano (decisão 019, ADR-005 §3):
 * disponíveis em qualquer tier, ligados/desligados por tenant. Usar
 * estas constantes evita string solta nos hooks de NF-e/TEF.
 */
const ADDONS = {
  NFE: "nfe",
  TEF: "tef",
};

/**
 * O que cada add-on AINDA NÃO faz de ponta a ponta hoje.
 *
 * Não é regra de cliente nem marca (white-label intacto, decisão 017): é o
 * que a PLATAFORMA sabe sobre o estado da própria implementação. Fica aqui
 * porque `public.addons` guarda a descrição comercial do produto, não o
 * grau de prontidão dele — e ligar um add-on que só simula, sem avisar,
 * faria o dono vender ao cliente algo que não funciona.
 *
 * Add-on sem aviso cadastrado simplesmente não mostra aviso: um código
 * novo no catálogo nunca quebra a tela do Console.
 */
export const AVISOS_ADDON = {
  [ADDONS.NFE]:
    "A emissão só sai de verdade depois que o certificado A1 e o CSC deste " +
    "estabelecimento estiverem no servidor. Até lá, toda venda volta sem nota " +
    "emitida — a venda em si não é afetada.",
  [ADDONS.TEF]:
    "Nenhuma maquininha está integrada ainda: o PDV apenas simula a aprovação " +
    "do cartão. E, com o add-on ligado, o PDV passa a bloquear cartão quando o " +
    "estabelecimento estiver sem internet.",
};

/**
 * O que o estabelecimento PERDE no instante em que o add-on é desligado.
 *
 * Existe para a confirmação nomear a consequência em vez de perguntar "tem
 * certeza?" (CLAUDE.md: confirmar ações destrutivas com o efeito à vista).
 * Código sem frase cadastrada cai num texto genérico montado com o nome do
 * add-on — a confirmação nunca some.
 */
export const CONSEQUENCIAS_DESLIGAR = {
  [ADDONS.NFE]:
    "Ao desligar, o PDV deste estabelecimento para de emitir nota fiscal no " +
    "pagamento, a partir do próximo pedido.",
  [ADDONS.TEF]:
    "Ao desligar, o PDV deste estabelecimento para de usar a maquininha: o " +
    "cartão volta a ser lançado na mão, a partir do próximo pedido.",
};

export default ADDONS;
