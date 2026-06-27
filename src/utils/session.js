const SESSION_KEY  = "kora_session";
const ATTEMPT_KEY  = "kora_attempts";

export const SESSION_MS   = 8 * 60 * 60 * 1000;  // 8 horas
export const IDLE_MS      = 30 * 60 * 1000;       // 30 min inatividade
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS   = 2 * 60 * 1000;        // 2 min bloqueio

// ── Sessão ────────────────────────────────────────────────────
export const saveSession = (user) =>
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, at: Date.now() }));

export const loadSession = () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!s) return null;
    if (Date.now() - s.at > SESSION_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s.user;
  } catch {
    return null;
  }
};

export const clearSession = () => sessionStorage.removeItem(SESSION_KEY);

// ── Rate limiting ─────────────────────────────────────────────
export const getAttempts = (username) => {
  try {
    return JSON.parse(sessionStorage.getItem(ATTEMPT_KEY + username) || "{}");
  } catch {
    return {};
  }
};

export const setAttempts = (username, data) =>
  sessionStorage.setItem(ATTEMPT_KEY + username, JSON.stringify(data));

export const clearAttempts = (username) =>
  sessionStorage.removeItem(ATTEMPT_KEY + username);
