import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local");
}

export const supabase = createClient(url, key);

// TODO: remove diag logs
console.log("[supabase:init]", {
  urlPresent:  !!url,
  keyPresent:  !!key,
  urlPrefix:   url ? url.slice(0, 20) : "MISSING",
  keyLength:   key ? key.length : 0,
  mode:        import.meta.env.MODE,
});
