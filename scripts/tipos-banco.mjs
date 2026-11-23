// Gera src/types/database.d.ts a partir do schema de produção (fase 0.3 do
// plano de refatoração, decisão D2: só os tipos do banco, usados via JSDoc).
//
// Uso: npm run tipos:banco
//
// Fala com a API de gerenciamento do Supabase (api.supabase.com). O token NÃO
// mora no código nem em variável do projeto:
// - na sessão de nuvem do Claude, o proxy do ambiente "gastromundi" injeta o
//   token sozinho;
// - numa máquina local, exporte SUPABASE_ACCESS_TOKEN (Account, Access Tokens,
//   em supabase.com) só no terminal que vai rodar o comando.
//
// O projeto é escolhido por SUPABASE_PROJECT_REF. Sem ela, e com um projeto
// só na conta, usa esse; com mais de um, lista e pede para escolher.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const API = "https://api.supabase.com/v1";
const SAIDA = join(RAIZ, "src", "types", "database.d.ts");

const cabecalhos = {};
if (process.env.SUPABASE_ACCESS_TOKEN) {
  cabecalhos.Authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
}

async function pedir(caminho) {
  const resposta = await fetch(API + caminho, { headers: cabecalhos });
  if (!resposta.ok) {
    throw new Error(`${caminho}: HTTP ${resposta.status}. Confira o token de acesso do Supabase.`);
  }
  return resposta.json();
}

let ref = process.env.SUPABASE_PROJECT_REF;
if (!ref) {
  const projetos = await pedir("/projects");
  if (projetos.length !== 1) {
    console.log("Mais de um projeto na conta. Rode de novo com SUPABASE_PROJECT_REF=<ref>:");
    for (const p of projetos) console.log(`  ${p.id ?? p.ref}  ${p.name}`);
    process.exit(2);
  }
  ref = projetos[0].id ?? projetos[0].ref;
}

const { types } = await pedir(`/projects/${ref}/types/typescript?included_schemas=public`);
mkdirSync(join(RAIZ, "src", "types"), { recursive: true });
writeFileSync(
  SAIDA,
  "// Gerado por `npm run tipos:banco` a partir do schema de produção. Não edite à mão:\n" +
  "// rode o comando de novo depois de aplicar migration.\n\n" + types,
);
console.log(`Tipos do schema public gravados em ${SAIDA}`);
