import { createClient } from "@supabase/supabase-js";
import { criarFetchComTimeout } from "./redeTimeout";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // Variáveis VITE_* são embutidas no bundle em tempo de `vite build`.
  // Em produção (Vercel) elas precisam existir nas Environment Variables do
  // projeto ANTES do build — se faltarem, o client inicializaria sem apikey
  // e o PostgREST responderia 400 "No API key found in request". Falhar aqui
  // torna a causa explícita em vez de mascarar como erro 400 em runtime.
  throw new Error(
    "VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY ausentes. " +
    "Local: configure .env.local. Produção: defina-as nas Environment Variables do Vercel e refaça o build."
  );
}

// `fetch` com prazo: requisição pendurada vira erro tratável em vez de deixar
// a tela parada sem resposta (ver redeTimeout.js).
export const supabase = createClient(url, key, {
  global: { fetch: criarFetchComTimeout((...args) => fetch(...args)) },
});
