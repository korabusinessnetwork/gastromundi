// Como a comanda aparece na tela, no log e no cupom: número puro vira
// "Comanda 7"; nome livre ("Mesa VIP", "Balcão") passa intacto.
//
// Estava escrito oito vezes (carrinho, grade, finalização, cancelamento,
// cozinha, impressão e celular). Refatoração 4.2: uma regra, um lugar.
export function fmtComanda(nome) {
  return /^\d+$/.test(String(nome ?? "").trim()) ? `Comanda ${nome}` : nome;
}
