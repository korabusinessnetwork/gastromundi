// Telefone brasileiro — regra ÚNICA de máscara e validação.
//
// O defeito que isto conserta: o cadastro de cliente aceitava "123" como
// telefone e salvava calado. Telefone é o contato mínimo obrigatório para
// fiado e delivery — um número quebrado só aparece quando alguém precisa
// ligar e não consegue. O CPF ao lado já avisava na hora; o telefone não.
//
// A formatação já existia em `deliveryPedidos.js`; ela passou a viver aqui
// para não repetir o erro de ter duas contas para a mesma coisa.

/** Só os dígitos (remove máscara, espaços e o +55 quando vier colado). */
export function apenasDigitosTelefone(tel) {
  return String(tel ?? "").replace(/\D/g, "");
}

/** Formata telefone BR: (11) 91234-5678 / (11) 1234-5678. Sem casar, devolve como veio. */
export function formatarTelefone(tel) {
  const d = apenasDigitosTelefone(tel);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(tel ?? "").trim();
}

/**
 * Máscara progressiva para digitação: vai fechando parênteses e hífen
 * conforme o operador digita, e não deixa passar de 11 dígitos.
 */
export function mascararTelefone(tel) {
  const d = apenasDigitosTelefone(tel).slice(0, 11);
  if (d.length <= 2) return d;
  const ddd = `(${d.slice(0, 2)}`;
  if (d.length <= 6) return `${ddd}) ${d.slice(2)}`;
  if (d.length <= 10) return `${ddd}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `${ddd}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Telefone válido = DDD (11 a 99) + 8 dígitos (fixo) ou 9 dígitos começando
 * em 9 (celular). Vazio NÃO é válido aqui — quem decide se o campo é
 * obrigatório é a tela; esta função só responde "esse número existe?".
 */
export function telefoneValido(tel) {
  const d = apenasDigitosTelefone(tel);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  // Celular no Brasil tem 9 dígitos e o primeiro é sempre 9.
  if (d.length === 11 && d[2] !== "9") return false;
  // Fixo nunca começa em 0 ou 1.
  if (d.length === 10 && (d[2] === "0" || d[2] === "1")) return false;
  return true;
}
