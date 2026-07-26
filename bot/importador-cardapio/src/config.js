// ──────────────────────────────────────────────────────────────────
// Configuracao do bot — lida do ambiente (.env via dotenv). Nada de
// segredo/URL hardcodado (regra do projeto): tudo vem de variavel de
// ambiente e falha cedo, com mensagem clara, se algo faltar.
// ──────────────────────────────────────────────────────────────────

import "dotenv/config";

function exigir(nome) {
  const valor = process.env[nome];
  if (!valor || !String(valor).trim()) {
    throw new Error(
      `Variavel de ambiente ${nome} ausente. Copie .env.example para .env e preencha.`
    );
  }
  return String(valor).trim();
}

/**
 * Le e valida a configuracao. Lanca (com mensagem amigavel) se faltar algo
 * obrigatorio — prevencao de erro em vez de falhar la na frente no login.
 * @returns {{supabaseUrl:string, supabaseAnonKey:string, email:string, senha:string, pastaEntrada:string}}
 */
export function carregarConfig() {
  return {
    supabaseUrl: exigir("SUPABASE_URL"),
    supabaseAnonKey: exigir("SUPABASE_ANON_KEY"),
    email: exigir("BOT_EMAIL"),
    senha: exigir("BOT_PASSWORD"),
    pastaEntrada: process.env.WATCH_DIR?.trim() || "./entrada",
  };
}
