// F021 fatia 2 — a fila pendente passa a morar no IndexedDB.
//
// O que este arquivo trava não é "grava e lê". É o que torna a troca segura:
//
//   1. O espelho responde SÍNCRONO. `AppContext` e `HistoricoNfce` leem a fila
//      dentro de inicializador preguiçoso de `useState`, que não pode esperar.
//   2. A janela de hidratação não come venda. Entre o primeiro render e a
//      resposta do banco o operador pode enfileirar, e a hidratação mescla por
//      `uid` em vez de sobrescrever.
//   3. Ambiente sem IndexedDB não derruba o PDV, degrada para memória.
//   4. A fila que já está no `localStorage` de quem usa o sistema hoje migra, e
//      a chave antiga só some depois que o banco confirmou.
//
// O `fake-indexeddb` entra só aqui (devDependency): o resto da suíte roda sem
// `indexedDB` no globo, o que mantém o caminho de fallback exercitado de graça.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { criarStorageIdb, mesclarPorUid } from "./storageIdb";
import { criarFila, CHAVE_FILA_PENDING } from "./fila";

const K = CHAVE_FILA_PENDING;

let contador = 0;
/** Banco novo por teste: sem isso um teste enxerga a sobra do anterior. */
const nomeBanco = () => `kora.teste.${Date.now()}.${contador++}`;

/** `localStorage` mínimo, o legado de onde a fila migra. */
const criarLegado = (inicial = {}) => {
  const mapa = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, String(v)),
    removeItem: (k) => mapa.delete(k),
  };
};

const ops = (json) => (json ? JSON.parse(json).map((o) => o.payload?.id ?? o.uid) : []);

/**
 * IndexedDB de mentira, controlável: é o único jeito de encenar cota estourada
 * e leitura recusada, que o `fake-indexeddb` (que funciona) não encena.
 */
function idbFalso({ dados = new Map(), falhar = null } = {}) {
  const abrirDb = () => ({
    objectStoreNames: { contains: () => true },
    createObjectStore: () => {},
    close: () => {},
    transaction() {
      const tx = { error: null };
      const fim = () => queueMicrotask(() => tx.oncomplete?.());
      const quebra = (msg) => {
        tx.error = new Error(msg);
        queueMicrotask(() => tx.onerror?.());
      };
      const store = {
        get(k) {
          const req = {};
          queueMicrotask(() => {
            if (falhar === "get") return quebra("leitura recusada");
            req.result = dados.get(k);
            req.onsuccess?.();
            fim();
          });
          return req;
        },
        put(v, k) {
          const req = {};
          queueMicrotask(() => {
            if (falhar === "put") return quebra("cota estourada");
            dados.set(k, v);
            req.onsuccess?.();
            fim();
          });
          return req;
        },
        delete(k) {
          const req = {};
          queueMicrotask(() => {
            dados.delete(k);
            req.onsuccess?.();
            fim();
          });
          return req;
        },
      };
      tx.objectStore = () => store;
      return tx;
    },
  });
  return {
    dados,
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = abrirDb();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("criarStorageIdb — o espelho síncrono", () => {
  it("responde na hora, antes de o banco ter respondido qualquer coisa", () => {
    const s = criarStorageIdb({ banco: nomeBanco(), chaves: [K] });

    // Sem `await` em lugar nenhum: é exatamente o que o `useState` faz.
    expect(s.getItem(K)).toBe(null);
    s.setItem(K, "abc");
    expect(s.getItem(K)).toBe("abc");
    s.removeItem(K);
    expect(s.getItem(K)).toBe(null);
  });
});

describe("criarStorageIdb — durabilidade no banco", () => {
  it("uma instância nova sobre o mesmo banco enxerga o que a anterior gravou", async () => {
    const banco = nomeBanco();

    const a = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    expect(await a.pronto).toEqual({ idb: true });
    a.setItem(K, JSON.stringify([{ uid: "u1" }]));
    await a.liberado();
    a.fechar();

    const b = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await b.pronto;
    expect(ops(b.getItem(K))).toEqual(["u1"]);
    b.fechar();
  });

  it("a fila inteira sobrevive ao recarregamento da aba", async () => {
    const banco = nomeBanco();

    const s1 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await s1.pronto;
    const f1 = criarFila({ storage: s1 });
    f1.enfileirar({ tipo: "insert", payload: { id: "a" } });
    f1.enfileirar({ tipo: "emitir_nfce", payload: { id: "b" } });
    await s1.liberado();
    s1.fechar();

    const s2 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await s2.pronto;
    const f2 = criarFila({ storage: s2 });
    expect(f2.tamanho()).toBe(2);
    expect(f2.listar().map((o) => o.payload.id)).toEqual(["a", "b"]);
    s2.fechar();
  });

  it("removeItem apaga do espelho e do banco", async () => {
    const banco = nomeBanco();

    const a = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await a.pronto;
    a.setItem(K, JSON.stringify([{ uid: "u1" }]));
    await a.liberado();
    a.removeItem(K);
    await a.liberado();
    a.fechar();

    const b = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await b.pronto;
    expect(b.getItem(K)).toBe(null);
    b.fechar();
  });
});

describe("criarStorageIdb — a janela de hidratação", () => {
  it("op enfileirada ANTES de o banco responder não come nem é comida", async () => {
    const banco = nomeBanco();

    const s0 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await s0.pronto;
    criarFila({ storage: s0 }).enfileirar({ tipo: "insert", payload: { id: "antiga" } });
    await s0.liberado();
    s0.fechar();

    // Aba recarregada: a fila é montada e o operador vende ANTES de o banco
    // responder. Sem mesclagem, uma das duas ops morreria aqui.
    const s1 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    const f1 = criarFila({ storage: s1 });
    f1.enfileirar({ tipo: "insert", payload: { id: "nova" } });
    expect(f1.tamanho()).toBe(1);

    await s1.pronto;

    // Persistida primeiro: a ordem de reenvio é a ordem em que as vendas saíram.
    expect(f1.listar().map((o) => o.payload.id)).toEqual(["antiga", "nova"]);
    await s1.liberado();
    s1.fechar();

    const s2 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await s2.pronto;
    expect(criarFila({ storage: s2 }).listar().map((o) => o.payload.id)).toEqual(["antiga", "nova"]);
    s2.fechar();
  });

  it("sem função de mesclagem, o default é conservador: o local vence", async () => {
    const banco = nomeBanco();

    const s0 = criarStorageIdb({ banco, chaves: [K] });
    await s0.pronto;
    s0.setItem(K, "do-banco");
    await s0.liberado();
    s0.fechar();

    const s1 = criarStorageIdb({ banco, chaves: [K] });
    s1.setItem(K, "local");
    await s1.pronto;
    expect(s1.getItem(K)).toBe("local");
    s1.fechar();
  });
});

describe("criarStorageIdb — ambiente sem IndexedDB", () => {
  it("sem indexedDB no globo: vive em memória e diz isso no pronto", async () => {
    vi.stubGlobal("indexedDB", undefined);

    const s = criarStorageIdb({ banco: nomeBanco(), chaves: [K] });

    expect(await s.pronto).toEqual({ idb: false });
    s.setItem(K, "x");
    expect(s.getItem(K)).toBe("x");
    // Nada fica pendurado: a fila de gravações resolve mesmo sem banco.
    await s.liberado();
  });

  it("open que LANÇA cai no mesmo caminho de memória, e avisa", async () => {
    const aoFalhar = vi.fn();
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("acesso ao banco negado");
      },
    });

    const s = criarStorageIdb({ banco: nomeBanco(), chaves: [K], aoFalhar });

    expect(await s.pronto).toEqual({ idb: false });
    expect(aoFalhar).toHaveBeenCalledWith(expect.any(Error), { acao: "abrir" });
    s.setItem(K, "x");
    expect(s.getItem(K)).toBe("x");
  });

  it("open que dispara onerror também cai para memória", async () => {
    const aoFalhar = vi.fn();
    vi.stubGlobal("indexedDB", {
      open: () => {
        const req = {};
        queueMicrotask(() => {
          req.error = new Error("banco recusado");
          req.onerror?.();
        });
        return req;
      },
    });

    const s = criarStorageIdb({ banco: nomeBanco(), chaves: [K], aoFalhar });

    expect(await s.pronto).toEqual({ idb: false });
    expect(aoFalhar).toHaveBeenCalledWith(expect.any(Error), { acao: "abrir" });
  });

  it("outra aba segurando o banco (onblocked) não trava a subida", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        const req = {};
        queueMicrotask(() => req.onblocked?.());
        return req;
      },
    });

    const s = criarStorageIdb({ banco: nomeBanco(), chaves: [K] });

    expect(await s.pronto).toEqual({ idb: false });
  });
});

describe("criarStorageIdb — migração do localStorage", () => {
  it("adota a fila legada e só apaga a chave antiga depois que o banco confirma", async () => {
    const banco = nomeBanco();
    const legado = criarLegado({ [K]: JSON.stringify([{ uid: "u1", payload: { id: "legada" } }]) });

    const s = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid, legado });
    await s.pronto;
    await s.liberado();

    expect(ops(s.getItem(K))).toEqual(["legada"]);
    expect(legado.getItem(K)).toBe(null);
    s.fechar();

    // E ficou no banco, não só no espelho.
    const s2 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await s2.pronto;
    expect(ops(s2.getItem(K))).toEqual(["legada"]);
    s2.fechar();
  });

  it("gravação que falha PRESERVA a fila legada para a próxima subida", async () => {
    const aoFalhar = vi.fn();
    const legado = criarLegado({ [K]: JSON.stringify([{ uid: "u1", payload: { id: "legada" } }]) });
    vi.stubGlobal("indexedDB", idbFalso({ falhar: "put" }));

    const s = criarStorageIdb({ banco: nomeBanco(), chaves: [K], mesclar: mesclarPorUid, legado, aoFalhar });
    await s.pronto;
    await s.liberado();

    expect(aoFalhar).toHaveBeenCalledWith(expect.any(Error), { acao: "gravar", chave: K });
    // A op continua onde estava: não sumiu do legado nem do espelho.
    expect(ops(legado.getItem(K))).toEqual(["legada"]);
    expect(ops(s.getItem(K))).toEqual(["legada"]);
  });

  it("banco que já tem valor manda, e o resto do legado é varrido", async () => {
    const banco = nomeBanco();

    const s0 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await s0.pronto;
    s0.setItem(K, JSON.stringify([{ uid: "u-banco", payload: { id: "do-banco" } }]));
    await s0.liberado();
    s0.fechar();

    const legado = criarLegado({ [K]: JSON.stringify([{ uid: "u-velha", payload: { id: "sobra" } }]) });
    const s1 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid, legado });
    await s1.pronto;

    expect(ops(s1.getItem(K))).toEqual(["do-banco"]);
    expect(legado.getItem(K)).toBe(null);
    s1.fechar();
  });
});

describe("criarStorageIdb — falha e aviso", () => {
  it("cota estourada na gravação avisa e NÃO derruba o espelho", async () => {
    const aoFalhar = vi.fn();
    vi.stubGlobal("indexedDB", idbFalso({ falhar: "put" }));

    const s = criarStorageIdb({ banco: nomeBanco(), chaves: [K], aoFalhar });
    await s.pronto;
    s.setItem(K, "vale-em-memoria");
    await s.liberado();

    expect(s.getItem(K)).toBe("vale-em-memoria");
    expect(aoFalhar).toHaveBeenCalledWith(expect.any(Error), { acao: "gravar", chave: K });
  });

  it("leitura recusada na hidratação avisa e segue com o espelho", async () => {
    const aoFalhar = vi.fn();
    vi.stubGlobal("indexedDB", idbFalso({ falhar: "get" }));

    const s = criarStorageIdb({ banco: nomeBanco(), chaves: [K], aoFalhar });
    s.setItem(K, "local");
    await s.pronto;

    expect(aoFalhar).toHaveBeenCalledWith(expect.any(Error), { acao: "ler", chave: K });
    expect(s.getItem(K)).toBe("local");
  });

  it("assinante que quebra não derruba a hidratação nem os outros", async () => {
    const banco = nomeBanco();
    const s0 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await s0.pronto;
    s0.setItem(K, JSON.stringify([{ uid: "u1" }]));
    await s0.liberado();
    s0.fechar();

    const bom = vi.fn();
    const s1 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    s1.assinar(() => {
      throw new Error("assinante quebrado");
    });
    s1.assinar(bom);

    expect(await s1.pronto).toEqual({ idb: true });
    expect(bom).toHaveBeenCalledTimes(1);
    s1.fechar();
  });
});

describe("criarStorageIdb — assinar", () => {
  it("avisa quando a hidratação traz pendência da sessão anterior", async () => {
    const banco = nomeBanco();
    const s0 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await s0.pronto;
    criarFila({ storage: s0 }).enfileirar({ tipo: "emitir_nfce", payload: { id: "a" } });
    await s0.liberado();
    s0.fechar();

    const avisado = vi.fn();
    const s1 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    s1.assinar(avisado);
    await s1.pronto;

    expect(avisado).toHaveBeenCalledTimes(1);
    expect(criarFila({ storage: s1 }).tamanho()).toBe(1);
    s1.fechar();
  });

  it("não avisa quando a hidratação não muda nada", async () => {
    const avisado = vi.fn();
    const s = criarStorageIdb({ banco: nomeBanco(), chaves: [K], mesclar: mesclarPorUid });
    s.assinar(avisado);

    await s.pronto;

    expect(avisado).not.toHaveBeenCalled();
    s.fechar();
  });

  it("cancelar a assinatura para de avisar", async () => {
    const banco = nomeBanco();
    const s0 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    await s0.pronto;
    s0.setItem(K, JSON.stringify([{ uid: "u1" }]));
    await s0.liberado();
    s0.fechar();

    const avisado = vi.fn();
    const s1 = criarStorageIdb({ banco, chaves: [K], mesclar: mesclarPorUid });
    const cancelar = s1.assinar(avisado);
    cancelar();
    await s1.pronto;

    expect(avisado).not.toHaveBeenCalled();
    s1.fechar();
  });
});

describe("mesclarPorUid", () => {
  const lista = (...uids) => JSON.stringify(uids.map((uid) => ({ uid })));
  const uids = (json) => JSON.parse(json).map((o) => o.uid);

  it("une os dois lados, persistidas primeiro", () => {
    expect(uids(mesclarPorUid(lista("a", "b"), lista("c")))).toEqual(["a", "b", "c"]);
  });

  it("não duplica a op que já está nos dois lados", () => {
    expect(uids(mesclarPorUid(lista("a", "b"), lista("b", "c")))).toEqual(["a", "b", "c"]);
  });

  it("lado vazio deixa o outro passar inteiro", () => {
    expect(uids(mesclarPorUid(lista("a"), null))).toEqual(["a"]);
    expect(uids(mesclarPorUid(null, lista("b")))).toEqual(["b"]);
    expect(mesclarPorUid(null, null)).toBe(null);
  });

  it("JSON inválido de um lado não lança: o outro lado vale sozinho", () => {
    expect(uids(mesclarPorUid("{quebrado", lista("b")))).toEqual(["b"]);
    expect(uids(mesclarPorUid(lista("a"), "{quebrado"))).toEqual(["a"]);
  });

  it("com os dois lados inválidos devolve o local, que é o mais novo", () => {
    expect(mesclarPorUid("{quebrado", "[também")).toBe("[também");
  });

  it("item sem uid passa dos dois lados, porque não dá para saber se é o mesmo", () => {
    const saida = JSON.parse(mesclarPorUid(JSON.stringify([{ x: 1 }]), JSON.stringify([{ x: 1 }])));
    expect(saida).toHaveLength(2);
  });

  it("valor que não é lista é tratado como lado vazio", () => {
    expect(uids(mesclarPorUid(JSON.stringify({ nao: "lista" }), lista("b")))).toEqual(["b"]);
  });
});
