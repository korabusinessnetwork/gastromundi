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
 * Todas as chamadas passam por `vi.fn()`, então dá pra inspecionar
 * quem chamou o quê. Use `setTableResult`/`setTableError` para
 * simular retorno ou erro de uma tabela específica, e `setRpcResult`/
 * `setRpcError` para uma RPC específica.
 */
export function createMockSupabase() {
  const tableResults = {};
  const tableErrors = {};
  const rpcResults = {};
  const rpcErrors = {};
  const calls = []; // { table, method, args }[] — trilha de chamadas, na ordem

  function makeQueryBuilder(table, method, args) {
    const record = { table, method, args };
    calls.push(record);

    const builder = {};
    const chainable = ["select", "eq", "neq", "order", "limit", "gte", "lte", "in", "match", "or", "single"];
    for (const m of chainable) {
      builder[m] = vi.fn((...a) => {
        calls.push({ table, method: m, args: a });
        return builder;
      });
    }
    const resolve = () => {
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

  const channel = vi.fn(() => {
    const ch = {};
    ch.on = vi.fn(() => ch);
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
    setRpcResult: (name, result) => { rpcResults[name] = result; },
    setRpcError: (name, error) => { rpcErrors[name] = error; },
  };
}
