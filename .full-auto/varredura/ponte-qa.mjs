/**
 * Ponte de QA: emula o Supabase (auth + PostgREST) em cima do Postgres local.
 * Existe só para a varredura poder rodar o app de verdade num navegador sem
 * tocar em banco de produção. Não faz parte do produto.
 *
 * Uso: node ponte-qa.mjs --porta 54321 --banco qa_base --pg 55432
 *
 * O que NÃO emula, de propósito, e por isso responde 501 em vez de inventar
 * resposta: select com recurso embutido (`select=*,tabela(*)`), realtime,
 * storage e edge functions. Fluxo que dependa disso sai como NAO_TESTADO.
 */
import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const PORTA = Number(arg("porta", 54321));
const BANCO = arg("banco", "qa_base");
const PG_PORTA = Number(arg("pg", 55432));
const SEGREDO = "qa-segredo-local-sem-valor";

const pool = new pg.Pool({ host: "/tmp", port: PG_PORTA, user: "postgres", database: BANCO, max: 10 });

const naoEmulado = [];   // o que o app pediu e a ponte não sabe fazer
const chamadas = [];     // trilha para o relatório da suíte

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function criarToken(claims) {
  const cabecalho = b64({ alg: "HS256", typ: "JWT" });
  const corpo = b64({ ...claims, iat: Math.floor(Date.now() / 1e3), exp: Math.floor(Date.now() / 1e3) + 3600 });
  const assinatura = crypto.createHmac("sha256", SEGREDO).update(`${cabecalho}.${corpo}`).digest("base64url");
  return `${cabecalho}.${corpo}.${assinatura}`;
}
function lerToken(req) {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!t || t.split(".").length !== 3) return null;
  try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()); } catch { return null; }
}

// roda a consulta com o papel e os claims do chamador, igual ao PostgREST
async function comoUsuario(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const papel = claims?.role === "authenticated" ? "authenticated" : "anon";
    await c.query(`SET LOCAL ROLE ${papel}`);
    await c.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims || { role: "anon" })]);
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
  finally { c.release(); }
}

const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "LIKE", ilike: "ILIKE" };
const ident = (s) => `"${String(s).replace(/"/g, "")}"`;

// separa "a.is.null,b.eq.x" respeitando parenteses aninhados
function fatiarLista(s) {
  const partes = []; let atual = ""; let nivel = 0;
  for (const c of s) {
    if (c === "(") nivel++;
    if (c === ")") nivel--;
    if (c === "," && nivel === 0) { partes.push(atual); atual = ""; continue; }
    atual += c;
  }
  if (atual) partes.push(atual);
  return partes;
}

function umaCondicao(expr, vals) {
  const m = /^([\w]+)\.(\w+)\.(.*)$/s.exec(expr);
  if (!m) { naoEmulado.push(`condicao nao entendida: ${expr}`); return null; }
  const [, col, op, valor] = m;
  if (op === "is") return `${ident(col)} IS ${valor.toLowerCase() === "null" ? "NULL" : valor}`;
  if (op === "in") {
    const lista = valor.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
    vals.push(lista); return `${ident(col)} = ANY($${vals.length})`;
  }
  if (!OPS[op]) { naoEmulado.push(`operador nao emulado: ${op} em ${col}`); return null; }
  vals.push(valor); return `${ident(col)} ${OPS[op]} $${vals.length}`;
}

function montarFiltros(params, vals) {
  const onde = [];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (k === "or" || k === "and") {
      const partes = fatiarLista(v.replace(/^\(|\)$/g, "")).map((e) => umaCondicao(e, vals)).filter(Boolean);
      if (partes.length) onde.push(`(${partes.join(k === "or" ? " OR " : " AND ")})`);
      continue;
    }
    const m = /^(\w+)\.(.*)$/s.exec(v);
    if (!m) { naoEmulado.push(`filtro sem operador: ${k}=${v}`); continue; }
    const [, op, valor] = m;
    if (op === "is") { onde.push(`${ident(k)} IS ${valor.toLowerCase() === "null" ? "NULL" : valor}`); continue; }
    if (op === "in") {
      const lista = valor.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
      vals.push(lista); onde.push(`${ident(k)} = ANY($${vals.length})`); continue;
    }
    if (!OPS[op]) { naoEmulado.push(`operador nao emulado: ${op} em ${k}`); continue; }
    vals.push(valor); onde.push(`${ident(k)} ${OPS[op]} $${vals.length}`);
  }
  return onde.length ? ` WHERE ${onde.join(" AND ")}` : "";
}

function montarSelect(params) {
  const s = params.get("select");
  if (!s || s === "*") return "*";
  if (s.includes("(")) { naoEmulado.push(`select com recurso embutido: ${s}`); return null; }
  return s.split(",").map((c) => ident(c.trim().split(":").pop())).join(", ");
}

function corpoDe(req) {
  return new Promise((ok) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => ok(b)); });
}
function responder(res, status, dados, extra = {}) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-expose-headers": "content-range, x-qa-nao-emulado",
    ...extra,
  });
  res.end(dados === undefined ? "" : JSON.stringify(dados));
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  const p = url.pathname;
  chamadas.push(`${req.method} ${p}${url.search}`);
  if (req.method === "OPTIONS") return responder(res, 204);

  try {
    // ── auth ────────────────────────────────────────────────────────
    if (p === "/auth/v1/token") {
      const { email, password } = JSON.parse((await corpoDe(req)) || "{}");
      const r = await pool.query(
        "SELECT id, email, raw_app_meta_data, (encrypted_password = crypt($2, encrypted_password)) AS ok FROM auth.users WHERE email = $1",
        [email, password || ""]
      );
      if (!r.rows[0]?.ok) return responder(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      const u = r.rows[0];
      const claims = { sub: u.id, email: u.email, role: "authenticated", app_metadata: u.raw_app_meta_data || {} };
      const token = criarToken(claims);
      return responder(res, 200, {
        access_token: token, token_type: "bearer", expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1e3) + 3600, refresh_token: "qa-refresh",
        user: { id: u.id, email: u.email, aud: "authenticated", role: "authenticated", app_metadata: u.raw_app_meta_data || {}, user_metadata: {}, created_at: new Date().toISOString() },
      });
    }
    if (p === "/auth/v1/logout") return responder(res, 204);
    if (p === "/auth/v1/user") {
      const c = lerToken(req);
      if (!c) return responder(res, 401, { message: "no session" });
      return responder(res, 200, { id: c.sub, email: c.email, aud: "authenticated", role: "authenticated", app_metadata: c.app_metadata || {}, user_metadata: {} });
    }

    // ── PostgREST ───────────────────────────────────────────────────
    if (p.startsWith("/rest/v1/")) {
      const claims = lerToken(req) || { role: "anon" };
      const alvo = p.slice("/rest/v1/".length);
      const params = [...url.searchParams.entries()];

      if (alvo.startsWith("rpc/")) {
        const fn = alvo.slice(4).replace(/[^a-z0-9_]/gi, "");
        const args = JSON.parse((await corpoDe(req)) || "{}");
        const nomes = Object.keys(args);
        const vals = nomes.map((n) => args[n]);
        const lista = nomes.map((n, i) => `${ident(n)} => $${i + 1}`).join(", ");
        const sql = `SELECT public.${ident(fn)}(${lista}) AS r`;
        try {
          const out = await comoUsuario(claims, (c) => c.query(sql, vals.map((v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v))));
          return responder(res, 200, out.rows[0]?.r ?? null);
        } catch (e) {
          return responder(res, 400, { message: e.message, code: e.code || "P0001", details: null, hint: null });
        }
      }

      const tabela = alvo.replace(/[^a-z0-9_]/gi, "");
      const prefer = String(req.headers.prefer || "");
      const devolve = prefer.includes("return=representation");

      if (req.method === "GET") {
        const cols = montarSelect(url.searchParams);
        if (cols === null) return responder(res, 501, { message: "select com recurso embutido nao e emulado pela ponte de QA" }, { "x-qa-nao-emulado": "embedded-select" });
        const vals = [];
        let sql = `SELECT ${cols} FROM public.${ident(tabela)}${montarFiltros(params, vals)}`;
        const ord = url.searchParams.get("order");
        if (ord) sql += ` ORDER BY ${ord.split(",").map((o) => { const [c, d] = o.split("."); return `${ident(c)} ${d === "desc" ? "DESC" : "ASC"}`; }).join(", ")}`;
        if (url.searchParams.get("limit")) sql += ` LIMIT ${Number(url.searchParams.get("limit"))}`;
        if (url.searchParams.get("offset")) sql += ` OFFSET ${Number(url.searchParams.get("offset"))}`;
        const out = await comoUsuario(claims, (c) => c.query(sql, vals));
        const unico = String(req.headers.accept || "").includes("vnd.pgrst.object");
        if (unico && out.rows.length !== 1) {
          return responder(res, 406, { code: "PGRST116", message: `JSON object requested, ${out.rows.length} rows returned` });
        }
        return responder(res, 200, unico ? out.rows[0] : out.rows, { "content-range": `0-${Math.max(out.rows.length - 1, 0)}/${out.rows.length}` });
      }

      if (req.method === "POST") {
        const corpo = JSON.parse((await corpoDe(req)) || "{}");
        const linhas = Array.isArray(corpo) ? corpo : [corpo];
        const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
        const vals = []; const tuplas = [];
        for (const l of linhas) {
          tuplas.push(`(${colunas.map((c) => { const v = l[c]; vals.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v); return `$${vals.length}`; }).join(", ")})`);
        }
        let sql = `INSERT INTO public.${ident(tabela)} (${colunas.map(ident).join(", ")}) VALUES ${tuplas.join(", ")}`;
        const conflito = url.searchParams.get("on_conflict");
        if (conflito || prefer.includes("resolution=merge-duplicates")) {
          const chaves = (conflito || "id").split(",").map(ident).join(", ");
          const set = colunas.filter((c) => !(conflito || "id").split(",").includes(c)).map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`).join(", ");
          sql += ` ON CONFLICT (${chaves}) DO ${set ? `UPDATE SET ${set}` : "NOTHING"}`;
        }
        if (devolve) sql += " RETURNING *";
        try {
          const out = await comoUsuario(claims, (c) => c.query(sql, vals));
          return responder(res, 201, devolve ? out.rows : null);
        } catch (e) { return responder(res, 400, { message: e.message, code: e.code || "P0001" }); }
      }

      if (req.method === "PATCH") {
        const corpo = JSON.parse((await corpoDe(req)) || "{}");
        const vals = []; const sets = [];
        for (const [k, v] of Object.entries(corpo)) { vals.push(v !== null && typeof v === "object" ? JSON.stringify(v) : v); sets.push(`${ident(k)} = $${vals.length}`); }
        const sql = `UPDATE public.${ident(tabela)} SET ${sets.join(", ")}${montarFiltros(params, vals)}${devolve ? " RETURNING *" : ""}`;
        try {
          const out = await comoUsuario(claims, (c) => c.query(sql, vals));
          return responder(res, 200, devolve ? out.rows : null, { "content-range": `0-0/${out.rowCount}` });
        } catch (e) { return responder(res, 400, { message: e.message, code: e.code || "P0001" }); }
      }

      if (req.method === "DELETE") {
        const vals = [];
        const sql = `DELETE FROM public.${ident(tabela)}${montarFiltros(params, vals)}${devolve ? " RETURNING *" : ""}`;
        try {
          const out = await comoUsuario(claims, (c) => c.query(sql, vals));
          return responder(res, 200, devolve ? out.rows : null, { "content-range": `0-0/${out.rowCount}` });
        } catch (e) { return responder(res, 400, { message: e.message, code: e.code || "P0001" }); }
      }
    }

    if (p === "/__qa/diagnostico") return responder(res, 200, { naoEmulado: [...new Set(naoEmulado)], chamadas: chamadas.length });
    naoEmulado.push(`rota nao emulada: ${req.method} ${p}`);
    return responder(res, 501, { message: `rota nao emulada pela ponte de QA: ${p}` });
  } catch (e) {
    return responder(res, 500, { message: String(e.message || e) });
  }
});

servidor.listen(PORTA, "127.0.0.1", () => console.log(`ponte de QA em http://127.0.0.1:${PORTA} sobre o banco ${BANCO}`));
