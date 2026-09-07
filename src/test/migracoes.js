// ──────────────────────────────────────────────────────────────────
// Ajuda para os guards de SQL: qual migração VALE hoje.
//
// Migrations são histórico imutável. As antigas continuam no disco com a
// versão antiga de cada função, e o que está no banco é o que a ÚLTIMA
// definição diz. Uma corretiva posterior que copie uma RPC sem alguma das
// guardas conquistadas a apaga do banco sem erro nenhum — e a regra volta
// a não existir em silêncio.
//
// Por isso todo guard confere o texto da última definição, não o da
// migração que introduziu a regra. Isto morava copiado em cada arquivo de
// guard; três cópias da mesma conta é como uma delas fica para trás.
// ──────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

export const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");

/** Todos os .sql, em ordem cronológica (o nome começa com a data). */
export function migracoes() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

/**
 * O texto da migração que define `nomeFuncao` por último — a que vale.
 * String vazia quando nenhuma a define (o guard falha com clareza).
 * @param {string} nomeFuncao
 * @returns {string}
 */
export function ultimaDefinicaoDe(nomeFuncao) {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nomeFuncao}\\b`);
  const arquivos = migracoes().filter((f) =>
    re.test(readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
  );
  const ultimo = arquivos.at(-1);
  return ultimo ? readFileSync(join(MIGRATIONS_DIR, ultimo), "utf8") : "";
}
