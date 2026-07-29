// Preferência POR APARELHO: este computador imprime os pedidos que chegam
// de outros aparelhos (Palm no celular, outro caixa)?
//
// Mora no localStorage, e não no `config_impressao` do banco, de propósito:
// a resposta é diferente em cada máquina. Num salão com dois caixas abertos,
// os dois recebem o mesmo evento do realtime — se os dois imprimissem, cada
// pedido sairia em duas bobinas. É escolha do computador, não do
// estabelecimento.

const CHAVE = "gm:impressao:aparelho-imprime";
const EVENTO = "gm:impressao:aparelho-imprime";

/**
 * Ligado por padrão: quem instala o sistema em um computador só (a esmagadora
 * maioria) não deveria precisar descobrir uma chave escondida para o papel
 * sair. Quem abre o segundo caixa desliga lá.
 */
export function aparelhoImprimeLancamentos() {
  try {
    return window.localStorage.getItem(CHAVE) !== "nao";
  } catch {
    // Navegador com storage bloqueado não pode virar restaurante sem papel.
    return true;
  }
}

export function definirAparelhoImprimeLancamentos(valor) {
  try {
    window.localStorage.setItem(CHAVE, valor ? "sim" : "nao");
  } catch {
    // Sem storage a escolha não persiste; avisar o usuário aqui seria pior
    // que o silêncio — a tela de configuração já mostra o estado real.
  }
  try {
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    /* ambiente sem window (teste/SSR) */
  }
}

/** Avisa quando a chave muda, para o vigia ligar/desligar sem recarregar. */
export function assinarAparelhoImprime(callback) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO, callback);
  // "storage" cobre a mesma chave alterada em OUTRA aba do mesmo caixa.
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENTO, callback);
    window.removeEventListener("storage", callback);
  };
}
