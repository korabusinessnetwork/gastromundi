// @vitest-environment jsdom
//
// Run 5, leva 4 — o teto absoluto de 8 horas da sessão não valia nada.
//
// Dois furos somados:
//   1. `saveSession` reescreve o `at` (a hora do login). Quem chamava era o
//      refresh da lista de usuários e a restauração de sessão no F5 — ou seja,
//      qualquer bootstrap renovava a sessão e o teto nunca chegava.
//   2. `loadSession` calculava `Date.now() - s.at`. Sem um `at` numérico isso
//      dá NaN, e `NaN > SESSION_MS` é false: payload adulterado ou de versão
//      antiga NUNCA vencia (falha ABERTA).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SESSION_MS,
  saveSession,
  loadSession,
  clearSession,
  lerSessao,
  atualizarUsuarioSessao,
  msRestantesDaSessao,
  esquecerTokenAuthLocal,
  getAttempts,
  setAttempts,
  clearAttempts,
  JANELA_TENTATIVAS_MS,
  MAX_ATTEMPTS,
  LOCKOUT_MS,
} from "./session";

const CHAVE = "kora_session";
const usuario = { id: 7, name: "Maria", username: "maria", role: "caixa" };

/** Grava um payload cru, do jeito que ele existe no sessionStorage. */
const gravarCru = (obj) => sessionStorage.setItem(CHAVE, JSON.stringify(obj));

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("lerSessao — estado da sessão local", () => {
  it("sem nada gravado, a sessão está ausente", () => {
    expect(lerSessao()).toEqual({ estado: "ausente", user: null, at: null });
  });

  it("recém-salva, a sessão está ativa e devolve o usuário", () => {
    saveSession(usuario);
    const s = lerSessao();
    expect(s.estado).toBe("ativa");
    expect(s.user).toMatchObject({ id: 7, username: "maria" });
    expect(typeof s.at).toBe("number");
  });

  it("passado o teto de 8 horas, a sessão está expirada", () => {
    gravarCru({ user: usuario, at: Date.now() - SESSION_MS - 1 });
    const s = lerSessao();
    expect(s.estado).toBe("expirada");
    expect(s.user).toBeNull();
  });

  it("no milissegundo exato do teto a sessão ainda está ativa", () => {
    // Relógio congelado de propósito: com `Date.now()` real, o milissegundo que
    // passa entre gravar e ler já joga o teste para o outro lado da fronteira.
    vi.useFakeTimers();
    const agora = new Date("2026-07-29T12:00:00-03:00").getTime();
    vi.setSystemTime(agora);
    gravarCru({ user: usuario, at: agora - SESSION_MS });
    expect(lerSessao().estado).toBe("ativa");
  });

  it("payload SEM `at` falha fechado — antes NaN fazia a sessão nunca vencer", () => {
    gravarCru({ user: usuario });
    expect(lerSessao().estado).toBe("expirada");
    expect(loadSession()).toBeNull();
  });

  it("`at` que não é número finito também falha fechado", () => {
    for (const at of ["agora", null, {}, [], true, Number.NaN, Number.POSITIVE_INFINITY]) {
      gravarCru({ user: usuario, at });
      expect(lerSessao().estado, `at = ${JSON.stringify(at)}`).toBe("expirada");
    }
  });

  it("payload sem usuário não vale como sessão", () => {
    gravarCru({ at: Date.now() });
    expect(lerSessao().estado).toBe("expirada");
  });

  it("JSON corrompido não explode e não vale como sessão", () => {
    sessionStorage.setItem(CHAVE, "{isso não é json");
    expect(lerSessao().estado).toBe("expirada");
    expect(loadSession()).toBeNull();
  });

  it("ler não apaga a sessão vencida — quem apaga é quem decide o logout", () => {
    gravarCru({ user: usuario, at: Date.now() - SESSION_MS - 1 });
    lerSessao();
    expect(sessionStorage.getItem(CHAVE)).not.toBeNull();

    // `loadSession` mantém o contrato antigo: limpa ao encontrar vencida.
    expect(loadSession()).toBeNull();
    expect(sessionStorage.getItem(CHAVE)).toBeNull();
  });
});

describe("atualizarUsuarioSessao — atualiza os dados sem renovar o relógio", () => {
  it("preserva o `at` do login ao trocar os dados do usuário", () => {
    const nascimento = Date.now() - 7 * 60 * 60 * 1000; // 7h de turno
    gravarCru({ user: usuario, at: nascimento });

    const ok = atualizarUsuarioSessao({ ...usuario, role: "gerente" });

    expect(ok).toBe(true);
    const s = lerSessao();
    expect(s.at).toBe(nascimento);
    expect(s.user.role).toBe("gerente");
  });

  it("mil atualizações seguidas não empurram o vencimento", () => {
    const nascimento = Date.now() - (SESSION_MS - 60_000); // falta 1 min
    gravarCru({ user: usuario, at: nascimento });

    for (let i = 0; i < 1000; i++) atualizarUsuarioSessao({ ...usuario, name: `Maria ${i}` });

    expect(lerSessao().at).toBe(nascimento);
    expect(msRestantesDaSessao()).toBeLessThanOrEqual(60_000);
  });

  it("saveSession, ao contrário, RENOVA o relógio — é privilégio do login", () => {
    const nascimento = Date.now() - 7 * 60 * 60 * 1000;
    gravarCru({ user: usuario, at: nascimento });

    saveSession(usuario);

    expect(lerSessao().at).toBeGreaterThan(nascimento);
  });

  it("não cria sessão quando não existe nenhuma", () => {
    expect(atualizarUsuarioSessao(usuario)).toBe(false);
    expect(sessionStorage.getItem(CHAVE)).toBeNull();
  });

  it("não ressuscita sessão vencida", () => {
    gravarCru({ user: usuario, at: Date.now() - SESSION_MS - 1 });
    expect(atualizarUsuarioSessao({ ...usuario, role: "admin" })).toBe(false);
    expect(lerSessao().estado).toBe("expirada");
  });
});

describe("msRestantesDaSessao — quanto falta para o teto", () => {
  it("logo após o login falta praticamente o teto inteiro", () => {
    saveSession(usuario);
    const restante = msRestantesDaSessao();
    expect(restante).toBeLessThanOrEqual(SESSION_MS);
    expect(restante).toBeGreaterThan(SESSION_MS - 5_000);
  });

  it("conta do login, não da última atualização", () => {
    gravarCru({ user: usuario, at: Date.now() - 6 * 60 * 60 * 1000 });
    atualizarUsuarioSessao({ ...usuario, name: "Maria S." });
    const restante = msRestantesDaSessao();
    expect(restante).toBeGreaterThan(0);
    expect(restante).toBeLessThanOrEqual(2 * 60 * 60 * 1000 + 1_000);
  });

  it("sem sessão ativa devolve null — não há relógio para cobrar", () => {
    expect(msRestantesDaSessao()).toBeNull();
    gravarCru({ user: usuario, at: Date.now() - SESSION_MS - 1 });
    expect(msRestantesDaSessao()).toBeNull();
  });

  it("nunca devolve número negativo", () => {
    vi.useFakeTimers();
    const agora = new Date("2026-07-29T12:00:00-03:00").getTime();
    vi.setSystemTime(agora);
    gravarCru({ user: usuario, at: agora - SESSION_MS });
    expect(msRestantesDaSessao()).toBe(0);
  });
});

describe("clearSession", () => {
  it("apaga a sessão", () => {
    saveSession(usuario);
    clearSession();
    expect(lerSessao().estado).toBe("ausente");
  });

  it("não explode quando o storage não deixa escrever", () => {
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => { throw new Error("storage bloqueado"); };
    try {
      expect(() => clearSession()).not.toThrow();
    } finally {
      Storage.prototype.removeItem = original;
    }
  });

  it("storage inacessível na leitura vale como sessão vencida (falha fechada)", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("storage bloqueado"); };
    try {
      expect(lerSessao().estado).toBe("expirada");
      expect(loadSession()).toBeNull();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

// Run 5, leva 6 — o `signOut` que falha na rede sai ANTES de apagar o token, e
// o logout ignorava esse erro. O token ficava no localStorage e o próximo
// carregamento religava a sessão sem pedir senha.
describe("esquecerTokenAuthLocal — o token do Supabase neste navegador", () => {
  it("apaga a chave do token, as fatias e o code verifier do PKCE", () => {
    localStorage.setItem("sb-abcdefgh-auth-token", "{\"access_token\":\"x\"}");
    localStorage.setItem("sb-abcdefgh-auth-token.0", "pedaco 1");
    localStorage.setItem("sb-abcdefgh-auth-token.1", "pedaco 2");
    localStorage.setItem("sb-abcdefgh-auth-token-code-verifier", "pkce");

    expect(esquecerTokenAuthLocal()).toBe(4);
    expect(localStorage.length).toBe(0);
  });

  it("não encosta em nada que não seja do Auth", () => {
    // O snapshot e a fila offline são o que mantém o PDV operando sem internet:
    // apagá-los num logout sem rede seria perder pedidos já lançados.
    localStorage.setItem("kora.snapshot.bootstrap.v1", "dados do PDV");
    localStorage.setItem("kora.fila.offline.v1", "[]");
    localStorage.setItem("sb-abcdefgh-auth-token", "{\"access_token\":\"x\"}");

    expect(esquecerTokenAuthLocal()).toBe(1);
    expect(localStorage.getItem("kora.snapshot.bootstrap.v1")).toBe("dados do PDV");
    expect(localStorage.getItem("kora.fila.offline.v1")).toBe("[]");
  });

  it("sem token para apagar devolve zero", () => {
    expect(esquecerTokenAuthLocal()).toBe(0);
  });

  it("não explode quando o storage não deixa apagar", () => {
    localStorage.setItem("sb-abcdefgh-auth-token", "{\"access_token\":\"x\"}");
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = () => { throw new Error("storage bloqueado"); };
    try {
      expect(() => esquecerTokenAuthLocal()).not.toThrow();
    } finally {
      Storage.prototype.removeItem = original;
    }
  });
});

// Run 5, leva 8 — o "Bloqueio após 5 tentativas" da tela de login não bloqueava.
//
// O contador vivia em sessionStorage, que é por ABA: fechar a aba (ou abrir
// outra) zerava tudo. Quem quisesse chutar a senha do gerente num terminal de
// PDV compartilhado tentava cinco vezes, fechava a aba, e recomeçava — sem
// limite nenhum. Agora vive no localStorage, que é do navegador, com uma janela
// para o contador não virar armadilha para quem só errou de digitação.
describe("tentativas de login — o contador do bloqueio", () => {
  const CHAVE = "kora_attempts";
  /** Grava um registro cru, como ele fica no storage. */
  const gravarTentativas = (username, obj) =>
    localStorage.setItem(CHAVE + username, JSON.stringify(obj));

  it("navegador limpo não tem tentativa nenhuma", () => {
    expect(getAttempts("maria")).toEqual({});
  });

  it("grava e lê a contagem do usuário", () => {
    setAttempts("maria", { count: 2, lockedUntil: null });
    expect(getAttempts("maria")).toMatchObject({ count: 2, lockedUntil: null });
  });

  it("cada usuário tem o seu contador", () => {
    setAttempts("maria", { count: 3, lockedUntil: null });
    expect(getAttempts("joao")).toEqual({});
  });

  it("a contagem sobrevive ao fechar a aba — antes zerava e liberava mais 5 chutes", () => {
    setAttempts("maria", { count: 4, lockedUntil: null });
    sessionStorage.clear(); // é isso que o navegador faz quando a aba morre
    expect(getAttempts("maria").count).toBe(4);
  });

  it("o bloqueio ativo continua valendo numa aba nova", () => {
    setAttempts("maria", { count: MAX_ATTEMPTS, lockedUntil: Date.now() + LOCKOUT_MS });
    sessionStorage.clear();
    const att = getAttempts("maria");
    expect(att.lockedUntil).toBeGreaterThan(Date.now());
  });

  it("bloqueio ativo vale mesmo com registro antigo — a janela não solta quem está preso", () => {
    const daquiUmMinuto = Date.now() + 60_000;
    gravarTentativas("maria", {
      count: MAX_ATTEMPTS,
      lockedUntil: daquiUmMinuto,
      at: Date.now() - 24 * 60 * 60 * 1000,
    });
    expect(getAttempts("maria").lockedUntil).toBe(daquiUmMinuto);
  });

  it("erro velho para de contar — quem errou ontem não é bloqueado hoje no 1º engano", () => {
    gravarTentativas("maria", {
      count: MAX_ATTEMPTS - 1,
      lockedUntil: null,
      at: Date.now() - JANELA_TENTATIVAS_MS - 1,
    });
    expect(getAttempts("maria")).toEqual({});
  });

  it("dentro da janela o erro continua contando", () => {
    gravarTentativas("maria", {
      count: MAX_ATTEMPTS - 1,
      lockedUntil: null,
      at: Date.now() - JANELA_TENTATIVAS_MS + 60_000,
    });
    expect(getAttempts("maria").count).toBe(MAX_ATTEMPTS - 1);
  });

  it("registro sem hora, ou com hora que não é número, não conta", () => {
    for (const at of [undefined, null, "ontem", {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      gravarTentativas("maria", { count: 4, lockedUntil: null, at });
      expect(getAttempts("maria"), `at = ${JSON.stringify(at)}`).toEqual({});
    }
  });

  it("bloqueio que não é número não segura nada — o `at` é que manda", () => {
    // Um `lockedUntil` de texto não pode ser lido como bloqueio eterno.
    gravarTentativas("maria", { count: 9, lockedUntil: "9999999999999", at: Date.now() });
    expect(getAttempts("maria").count).toBe(9);
    gravarTentativas("maria", { count: 9, lockedUntil: "9999999999999", at: Date.now() - JANELA_TENTATIVAS_MS - 1 });
    expect(getAttempts("maria")).toEqual({});
  });

  it("registro corrompido ou fora de forma vale como nenhuma tentativa", () => {
    localStorage.setItem(CHAVE + "maria", "{isso não é json");
    expect(getAttempts("maria")).toEqual({});
    localStorage.setItem(CHAVE + "maria", "\"texto solto\"");
    expect(getAttempts("maria")).toEqual({});
    localStorage.setItem(CHAVE + "maria", "null");
    expect(getAttempts("maria")).toEqual({});
  });

  it("clearAttempts limpa o contador — é o que o login certo faz", () => {
    setAttempts("maria", { count: MAX_ATTEMPTS, lockedUntil: Date.now() + LOCKOUT_MS });
    clearAttempts("maria");
    expect(getAttempts("maria")).toEqual({});
  });

  it("storage bloqueado não derruba o login", () => {
    // Sem try/catch, um `setItem` que estoura sobe pelo `login` e a tela de
    // login quebra justamente no caminho de senha errada.
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = () => { throw new Error("storage bloqueado"); };
    Storage.prototype.removeItem = () => { throw new Error("storage bloqueado"); };
    try {
      expect(() => setAttempts("maria", { count: 1, lockedUntil: null })).not.toThrow();
      expect(() => clearAttempts("maria")).not.toThrow();
    } finally {
      Storage.prototype.setItem = set;
      Storage.prototype.removeItem = remove;
    }
  });

  it("storage ilegível vale como nenhuma tentativa", () => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("storage bloqueado"); };
    try {
      expect(getAttempts("maria")).toEqual({});
    } finally {
      Storage.prototype.getItem = get;
    }
  });
});
