/**
 * MIGRAÇÃO DE USUÁRIOS — Fase 1 do Supabase Auth
 *
 * O que faz:
 *   1. Busca todos os usuários da tabela public.users
 *   2. Para cada um sem auth_id, cria uma conta em auth.users
 *      (email interno: username@gastromundi.local)
 *   3. Define uma senha temporária aleatória (o usuário não usa isso
 *      ainda — o login ainda é pelo sistema antigo na Fase 1)
 *   4. Salva o auth_id de volta na tabela users
 *
 * Pré-requisitos:
 *   - Node.js 18+
 *   - Copie o arquivo .env.local para .env.migration (ou exporte as vars)
 *   - VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios
 *
 * Como rodar:
 *   node scripts/migrar_usuarios_auth.mjs
 *
 * IMPORTANTE: usa SUPABASE_SERVICE_ROLE_KEY (nunca exposta no frontend).
 * Rode apenas uma vez, em ambiente seguro (sua máquina ou CI privado).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomBytes } from "crypto";

// ── Lê .env.migration ou variáveis de ambiente ──────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(".env.migration", "utf8");
    const vars = {};
    for (const line of raw.split("\n")) {
      const [k, ...rest] = line.split("=");
      if (k && rest.length) vars[k.trim()] = rest.join("=").trim().replace(/^"|"$/g, "");
    }
    return vars;
  } catch {
    return {};
  }
}

const env = { ...loadEnv(), ...process.env };

const SUPABASE_URL          = env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY      = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(`
❌  Variáveis não encontradas.
    Crie o arquivo .env.migration com:

    VITE_SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=eyJ...

    Encontre a service_role key em:
    Dashboard › Settings › API › service_role (secret)
  `);
  process.exit(1);
}

// service_role ignora RLS — nunca use no frontend
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function senhaTemporaria() {
  // 32 bytes aleatórios — não será usada pelo usuário ainda (Fase 1)
  return randomBytes(32).toString("hex");
}

async function main() {
  console.log("🔍 Buscando usuários em public.users...");

  const { data: users, error } = await supabase
    .from("users")
    .select("id, username, name, role, auth_id")
    .eq("active", true);

  if (error) {
    console.error("❌ Erro ao buscar usuários:", error.message);
    process.exit(1);
  }

  console.log(`✅ ${users.length} usuário(s) encontrado(s).\n`);

  let criados  = 0;
  let pulados  = 0;
  let erros    = 0;

  for (const user of users) {
    const email = `${user.username}@gastromundi.local`;

    if (user.auth_id) {
      console.log(`⏭  ${user.username} — já tem auth_id, pulando.`);
      pulados++;
      continue;
    }

    // Cria conta no Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password:      senhaTemporaria(),
      email_confirm: true,            // não precisa confirmar email
      user_metadata: {
        name:     user.name,
        username: user.username,
        role:     user.role,
      },
    });

    if (authErr) {
      // Pode já existir se rodar o script novamente
      if (authErr.message.includes("already been registered")) {
        // Tenta buscar o auth_id existente
        const { data: { users: existentes } } = await supabase.auth.admin.listUsers();
        const existente = existentes.find(u => u.email === email);
        if (existente) {
          await supabase.from("users").update({ auth_id: existente.id }).eq("id", user.id);
          console.log(`🔗  ${user.username} — vinculado ao auth existente (${existente.id.slice(0,8)}…)`);
          criados++;
          continue;
        }
      }
      console.error(`❌  ${user.username} — erro ao criar:`, authErr.message);
      erros++;
      continue;
    }

    // Salva auth_id na tabela users
    const { error: updateErr } = await supabase
      .from("users")
      .update({ auth_id: authData.user.id })
      .eq("id", user.id);

    if (updateErr) {
      console.error(`❌  ${user.username} — criado no Auth mas falhou ao salvar auth_id:`, updateErr.message);
      erros++;
    } else {
      console.log(`✅  ${user.username} (${user.role}) → auth_id ${authData.user.id.slice(0,8)}…`);
      criados++;
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Criados:  ${criados}
  Pulados:  ${pulados}
  Erros:    ${erros}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${erros === 0
  ? "🎉 Migração concluída. Próximo passo: ative o hook no painel do Supabase."
  : "⚠️  Corrija os erros e rode novamente — o script é idempotente (seguro de re-rodar)."
}
  `);
}

main().catch(e => { console.error(e); process.exit(1); });
