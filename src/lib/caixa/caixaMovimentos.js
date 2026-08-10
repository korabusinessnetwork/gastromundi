import { round2 } from "../vendas/vendas";

/**
 * Sangria e suprimento — as duas parcelas do meio da fórmula do CAIXA.md:
 *
 *   esperado = fundo + entradas em dinheiro + suprimentos − sangrias − estornos
 *
 * Sem elas, todo dinheiro retirado da gaveta por um motivo legítimo (levar o
 * excesso ao cofre, pagar o entregador de gás) virava "falta de caixa" no
 * fechamento — e nada dizia quem tirou, quanto e por quê.
 *
 * Tudo aqui é função pura: a tela usa para desabilitar o botão e dizer o
 * motivo ANTES do operador errar (Princípio nº 1), e o fechamento usa a mesma
 * conta para chegar no valor esperado. Sem round-trip, sem duplicar fórmula.
 *
 * Dinheiro em `numeric` + `round2`, como o resto da camada de caixa
 * (`vendas.total`, `lancamentos.valor`, `src/lib/caixa/caixa.js`) — ver o cabeçalho
 * de `supabase/migrations/20260916_caixa_movimentos.sql`.
 */

/** Padrão do limite de sangria sem autorização, em reais. */
export const LIMITE_SANGRIA_PADRAO = 200;

/** Motivo curto demais não é motivo — a auditoria precisa ler isso depois. */
export const MOTIVO_MIN = 3;

/** Rótulos das duas operações, do jeito que o operador fala. */
export const ROTULO_TIPO = { sangria: "Sangria", suprimento: "Suprimento" };

/**
 * Interpreta o valor digitado pelo operador.
 *
 * O teclado do PDV escreve `50,00` — `Number("50,00")` é `NaN`, e um `NaN`
 * silencioso viraria uma sangria de zero gravada no banco. Devolve `null`
 * quando não dá para ler um número.
 *
 * @param {any} entrada
 * @returns {number|null}
 */
export function lerValor(entrada) {
  if (typeof entrada === "number") return Number.isFinite(entrada) ? round2(entrada) : null;
  const texto = String(entrada ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (texto === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? round2(n) : null;
}

/**
 * Só os movimentos da sessão de caixa atual.
 *
 * `inicioMs` vem de `inicioSessao` (FechamentoModal) — recebido como número
 * de propósito: importar o modal aqui fecharia um ciclo com o AppContext.
 *
 * @param {Array<{created_at?: string}>} movimentos
 * @param {number} inicioMs
 */
export function movimentosDaSessao(movimentos, inicioMs) {
  const corte = Number.isFinite(inicioMs) ? inicioMs : 0;
  return (movimentos ?? []).filter(m => {
    if (!m) return false;
    const t = new Date(m.created_at).getTime();
    return Number.isFinite(t) && t >= corte;
  });
}

/**
 * Soma dos valores de um tipo (`"sangria"` ou `"suprimento"`).
 *
 * @param {Array<{tipo?: string, valor?: any}>} movimentos
 * @param {string} tipo
 */
export function totalPorTipo(movimentos, tipo) {
  const soma = (movimentos ?? []).reduce((acc, m) => {
    if (!m || m.tipo !== tipo) return acc;
    const v = Number(m.valor);
    return Number.isFinite(v) ? acc + v : acc;
  }, 0);
  return round2(soma);
}

/**
 * Quanto os movimentos mexem no dinheiro esperado na gaveta:
 * `suprimentos − sangrias`. Negativo quando saiu mais do que entrou.
 *
 * @param {Array<{tipo?: string, valor?: any}>} movimentos
 */
export function ajusteEsperadoDinheiro(movimentos) {
  return round2(totalPorTipo(movimentos, "suprimento") - totalPorTipo(movimentos, "sangria"));
}

/**
 * Numerário disponível para sangrar agora: o que existe fisicamente na gaveta.
 *
 * @param {{fundo?: any, vendasDinheiro?: any, movimentos?: Array}} p
 */
export function dinheiroDisponivel({ fundo, vendasDinheiro, movimentos } = {}) {
  const base = round2(Number(fundo) || 0) + round2(Number(vendasDinheiro) || 0);
  return round2(base + ajusteEsperadoDinheiro(movimentos));
}

/**
 * Sangria acima do limite precisa de autorização (CAIXA.md, matriz de
 * permissões). Suprimento nunca precisa — pôr dinheiro na gaveta não é risco.
 *
 * Limite ausente, zero ou ilegível cai no padrão: melhor pedir senha à toa do
 * que liberar sangria ilimitada por causa de uma config torta.
 *
 * @param {{tipo?: string, valor?: any, limite?: any}} p
 */
export function exigeAutorizacao({ tipo, valor, limite } = {}) {
  if (tipo !== "sangria") return false;
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return false;
  return v > limiteSangriaValido(limite);
}

/**
 * Normaliza o limite vindo da config do estabelecimento (decisão 017 — o
 * número é por tenant, nunca cravado no código da tela).
 *
 * @param {any} limite
 */
export function limiteSangriaValido(limite) {
  const n = Number(limite);
  return Number.isFinite(n) && n > 0 ? round2(n) : LIMITE_SANGRIA_PADRAO;
}

/**
 * Valida o movimento antes de qualquer coisa ir ao banco.
 *
 * Devolve `{ ok, erro }` com o erro escrito no português do balcão — a tela
 * mostra esse texto ao lado do botão desabilitado, em vez de deixar confirmar
 * e explicar depois.
 *
 * @param {{tipo?: string, valor?: any, motivo?: any, disponivel?: any}} p
 * @returns {{ok: boolean, erro: string|null}}
 */
export function validarMovimento({ tipo, valor, motivo, disponivel } = {}) {
  if (tipo !== "sangria" && tipo !== "suprimento") {
    return { ok: false, erro: "Escolha se é uma retirada ou um reforço de troco." };
  }
  const v = lerValor(valor);
  if (v == null) return { ok: false, erro: "Digite quanto está saindo ou entrando." };
  if (v <= 0) return { ok: false, erro: "O valor precisa ser maior que zero." };

  const texto = String(motivo ?? "").trim();
  if (texto.length < MOTIVO_MIN) {
    return { ok: false, erro: "Escreva o motivo — é ele que aparece na conferência do caixa." };
  }

  if (tipo === "sangria") {
    const emCaixa = round2(Number(disponivel) || 0);
    if (emCaixa <= 0) {
      return { ok: false, erro: "Não há dinheiro na gaveta para retirar." };
    }
    if (v > emCaixa) {
      return { ok: false, erro: `A gaveta tem R$ ${emCaixa.toFixed(2).replace(".", ",")} — não dá para retirar mais que isso.` };
    }
  }

  return { ok: true, erro: null };
}
