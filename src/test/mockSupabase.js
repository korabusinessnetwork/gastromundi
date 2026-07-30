import { vi } from "vitest";

/**
 * Fábrica de um mock do client Supabase para testes de componente.
 *
 * Cobre os padrões usados no app: `from(table).select/insert/update/
 * delete/upsert(...)` encadeável com `.eq/.order/.limit/.gte/.in/
 * .single(...)` e "thenable" (funciona tanto `await supabase.from(x)
 * .insert(y)` quanto `.insert(y).select().single()`); `rpc(name, args)`;
 * `channel(name).on(event, cb).subscribe()` + `removeChannel`;
 * `auth.getSession()`.
 *
 * Os callbacks passados para `channel(nome).on(...)` ficam guardados: use
 * `emitRealtime(nome, payload)` para simular a chegada de um evento do
 * Postgres e testar a sincronia entre dispositivos.
 *
 * Todas as chamadas passam por `vi.fn()`, então dá pra inspecionar
 * quem chamou o quê. Use `setTableResult`/`setTableError` para
 * simular retorno ou erro de uma tabela específica, e `setRpcResult`/
 * `setRpcError` para uma RPC específica.
 */
export function createMockSupabase() {
  const tableResults = {};
  const tableErrors = {};
  const tableHandlers = {};
  const rpcResults = {};
  const rpcErrors = {};
  const calls = []; // { table, method, args }[] — trilha de chamadas, na ordem

  function makeQueryBuilder(table, method, args) {
    const record = { table, method, args };
    calls.push(record);

    const builder = {};
    const chainable = ["select", "eq", "neq", "not", "is", "order", "limit", "gt", "gte", "lt", "lte", "in", "match", "or", "contains", "single", "maybeSingle"];
    for (const m of chainable) {
      builder[m] = vi.fn((...a) => {
        calls.push({ table, method: m, args: a });
        return builder;
      });
    }
    const resolve = () => {
      // O handler vem primeiro porque é o único jeito de dar respostas
      // diferentes para chamadas diferentes na MESMA tabela (ex.: um update
      // que falha e outro que passa, dentro de uma exclusão em cascata).
      const handler = tableHandlers[table];
      if (handler) {
        const r = handler({ table, method, args });
        if (r !== undefined) return r;
      }
      if (tableErrors[table]) return { data: null, error: tableErrors[table] };
      if (tableResults[table]) return tableResults[table];
      return { data: [], error: null };
    };
    builder.then = (onFulfilled, onRejected) => Promise.resolve(resolve()).then(onFulfilled, onRejected);
    builder.catch = (onRejected) => builder.then(undefined, onRejected);
    return builder;
  }

  const from = vi.fn((table) => {
    const tableApi = {};
    for (const method of ["select", "insert", "update", "delete", "upsert"]) {
      tableApi[method] = vi.fn((...args) => makeQueryBuilder(table, method, args));
    }
    return tableApi;
  });

  const rpc = vi.fn((name, params) => {
    calls.push({ rpc: name, args: [params] });
    if (rpcErrors[name]) return Promise.resolve({ data: null, error: rpcErrors[name] });
    if (rpcResults[name]) return Promise.resolve(rpcResults[name]);
    return Promise.resolve({ data: null, error: null });
  });

  // Callbacks de realtime registrados, por nome de canal. Guardar isso é o que
  // permite um teste simular a chegada de um evento do Postgres.
  const realtimeHandlers = {};
  const channel = vi.fn((nome) => {
    const ch = {};
    ch.on = vi.fn((...args) => {
      const cb = args[args.length - 1];
      if (typeof cb === "function") (realtimeHandlers[nome] ??= []).push(cb);
      return ch;
    });
    ch.subscribe = vi.fn(() => ch);
    return ch;
  });
  const removeChannel = vi.fn();

  const auth = {
    getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    signInWithPassword: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  };

  return {
    from,
    rpc,
    channel,
    removeChannel,
    auth,
    calls,
    setTableResult: (table, result) => { tableResults[table] = result; },
    setTableError: (table, error) => { tableErrors[table] = error; },
    /**
     * Resposta caso a caso para uma tabela. `fn({ table, method, args })`
     * devolve `{ data, error }` para responder, ou `undefined` para cair no
     * setTableError/setTableResult da tabela.
     */
    setTableHandler: (table, fn) => { tableHandlers[table] = fn; },
    setRpcResult: (name, result) => { rpcResults[name] = result; },
    setRpcError: (name, error) => { rpcErrors[name] = error; },
    /**
     * Dispara um evento de realtime para quem assinou o canal `nome`, como se
     * tivesse vindo do Postgres. `payload` no formato do supabase-js v2:
     * `{ eventType: "INSERT" | "UPDATE" | "DELETE", new, old }`.
     * Devolve quantos handlers receberam — 0 significa que ninguém assinou
     * esse canal, e o teste está com o nome errado.
     */
    emitRealtime: (nome, payload) => {
      const hs = realtimeHandlers[nome] ?? [];
      for (const cb of hs) cb(payload);
      return hs.length;
    },
    reset: () => {
      for (const k of Object.keys(tableResults)) delete tableResults[k];
      for (const k of Object.keys(tableErrors)) delete tableErrors[k];
      for (const k of Object.keys(tableHandlers)) delete tableHandlers[k];
      for (const k of Object.keys(rpcResults)) delete rpcResults[k];
      for (const k of Object.keys(rpcErrors)) delete rpcErrors[k];
      for (const k of Object.keys(realtimeHandlers)) delete realtimeHandlers[k];
      calls.length = 0;
    },
  };
}
