/**
 * Documento do cliente — CPF ou CNPJ (F010). Módulo PURO, sem I/O,
 * testável com fixtures. Fonte única de verdade para:
 *   - validação por dígitos verificadores (módulo 11), não só comprimento;
 *   - máscara progressiva para exibir enquanto o operador digita.
 *
 * O CNPJ nasceu na validação fiscal (validarConfigFiscal.js) e foi
 * centralizado aqui — aquele módulo reexporta `validarCnpj` deste, para
 * não haver duas implementações do mesmo dígito verificador.
 *
 * Convenção de armazenamento: o banco guarda SÓ OS DÍGITOS (sem máscara),
 * junto de `documento_tipo` ('cpf' | 'cnpj'). A máscara é só de exibição.
 */

/** Remove tudo que não for dígito. Aceita null/undefined/número. */
export function apenasDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * Valida um CPF pelos dois dígitos verificadores (módulo 11) — não só o
 * comprimento. Aceita com ou sem máscara. Função pura clássica.
 *
 * @param {string} cpf
 * @returns {boolean}
 */
export function validarCpf(cpf) {
  const s = apenasDigitos(cpf);
  if (s.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(s)) return false; // todos os dígitos iguais

  // dv(qtd): dígito verificador sobre os `qtd` primeiros dígitos, com
  // pesos decrescentes (qtd+1 .. 2). resto 0/1 → 0.
  const dv = (qtd) => {
    let soma = 0;
    for (let i = 0; i < qtd; i++) soma += Number(s[i]) * (qtd + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  if (dv(9) !== Number(s[9])) return false;
  if (dv(10) !== Number(s[10])) return false;
  return true;
}

/**
 * Valida um CNPJ pelos dígitos verificadores (módulo 11) — não só o
 * comprimento. Aceita com ou sem máscara. Função pura clássica.
 *
 * @param {string} cnpj
 * @returns {boolean}
 */
export function validarCnpj(cnpj) {
  const s = apenasDigitos(cnpj);
  if (s.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(s)) return false; // todos os dígitos iguais

  const dv = (base) => {
    let soma = 0;
    let peso = base.length - 7; // 5 para os 12 primeiros; 6 para os 13
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  if (dv(s.slice(0, 12)) !== Number(s[12])) return false;
  if (dv(s.slice(0, 13)) !== Number(s[13])) return false;
  return true;
}

/**
 * Valida um documento pelo tipo escolhido no toggle (cpf/cnpj).
 * Qualquer coisa diferente de 'cnpj' é tratada como CPF (default do form).
 *
 * @param {string} valor
 * @param {'cpf'|'cnpj'} tipo
 * @returns {boolean}
 */
export function validarDocumento(valor, tipo) {
  return tipo === "cnpj" ? validarCnpj(valor) : validarCpf(valor);
}

// Posições (índice do dígito) onde entra cada separador da máscara.
const MASCARA = {
  cpf: [[3, "."], [6, "."], [9, "-"]],            // 000.000.000-00
  cnpj: [[2, "."], [5, "."], [8, "/"], [12, "-"]], // 00.000.000/0000-00
};
const MAX_DIGITOS = { cpf: 11, cnpj: 14 };

/**
 * Máscara PROGRESSIVA para exibição: formata o que já foi digitado sem
 * exigir o documento completo (bom para digitação ao vivo). Trunca no
 * tamanho do tipo. Não valida — só formata os dígitos recebidos.
 *
 * @param {string} valor  dígitos (com ou sem máscara)
 * @param {'cpf'|'cnpj'} tipo
 * @returns {string}
 */
export function formatarDocumento(valor, tipo) {
  const t = tipo === "cnpj" ? "cnpj" : "cpf";
  const d = apenasDigitos(valor).slice(0, MAX_DIGITOS[t]);
  const mascara = MASCARA[t];
  let out = "";
  for (let i = 0; i < d.length; i++) {
    for (const [pos, sep] of mascara) if (i === pos) out += sep;
    out += d[i];
  }
  return out;
}
