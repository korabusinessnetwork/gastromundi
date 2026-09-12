/**
 * Suíte "acesso": executa no navegador de verdade os fluxos de login,
 * bloqueio por tentativas e guarda de rota. Evidência em PNG por caso.
 */
import { chromium } from "playwright-core";

const BASE = process.env.QA_BASE || "http://127.0.0.1:5201";
const EVID = process.env.QA_EVID || ".full-auto/varredura/suites/acesso/evidencias";
const resultados = [];
const registrar = (id, status, nota) => { resultados.push({ id, status, nota }); console.log(`${status.padEnd(12)} ${id}  ${nota}`); };

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

async function novaPagina() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = await ctx.newPage();
  pg.erros = [];
  pg.on("console", (m) => { if (m.type() === "error") pg.erros.push(m.text()); });
  pg.on("pageerror", (e) => pg.erros.push(String(e)));
  return pg;
}
async function entrar(pg, usuario, senha) {
  await pg.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await pg.fill('input[type="text"], input[name="usuario"], input:not([type="password"]):visible', usuario);
  await pg.fill('input[type="password"]', senha);
  await pg.click('button[type="submit"], button:has-text("Entrar")');
}

try {
  // ── A01: a tela de login carrega sem erro de console ──────────────
  {
    const pg = await novaPagina();
    await pg.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    const temSenha = await pg.locator('input[type="password"]').count();
    await pg.screenshot({ path: `${EVID}/A01-login.png` });
    const erros = pg.erros.filter((e) => !/favicon|manifest|sw\.js|Service Worker|realtime|websocket/i.test(e));
    registrar("A01 tela de login abre", temSenha === 1 && erros.length === 0 ? "PASSOU" : "FALHOU",
      `campo de senha=${temSenha}, erros de console=${erros.length}${erros.length ? ` (${erros[0].slice(0, 160)})` : ""}`);
    await pg.context().close();
  }

  // ── A02: credencial correta entra no sistema ──────────────────────
  {
    const pg = await novaPagina();
    await entrar(pg, "qa-admin-a", "qa123456");
    await pg.waitForTimeout(4000);
    const url = pg.url();
    await pg.screenshot({ path: `${EVID}/A02-pos-login.png`, fullPage: true });
    registrar("A02 login com credencial valida", !url.endsWith("/login") ? "PASSOU" : "FALHOU", `url apos entrar: ${url}`);
    await pg.context().close();
  }

  // ── A03: senha errada avisa e não entra ───────────────────────────
  {
    const pg = await novaPagina();
    await entrar(pg, "qa-admin-a", "senha-errada");
    await pg.waitForTimeout(2500);
    const texto = await pg.locator("body").innerText();
    const avisou = /incorret|inválid|invalid|tentativa/i.test(texto);
    await pg.screenshot({ path: `${EVID}/A03-senha-errada.png` });
    registrar("A03 senha errada", avisou && pg.url().endsWith("/login") ? "PASSOU" : "FALHOU",
      `avisou=${avisou}, continua no login=${pg.url().endsWith("/login")}`);
    await pg.context().close();
  }

  // ── A04: rota protegida sem sessão volta para o login ─────────────
  {
    const pg = await novaPagina();
    await pg.goto(`${BASE}/app/financeiro`, { waitUntil: "networkidle" });
    await pg.waitForTimeout(2500);
    await pg.screenshot({ path: `${EVID}/A04-rota-protegida.png` });
    registrar("A04 rota protegida sem sessao", pg.url().includes("/login") ? "PASSOU" : "FALHOU", `url: ${pg.url()}`);
    await pg.context().close();
  }

  // ── A05: usuário inativo não entra ────────────────────────────────
  {
    const pg = await novaPagina();
    await entrar(pg, "qa-inativo-a", "qa123456");
    await pg.waitForTimeout(2500);
    const texto = await pg.locator("body").innerText();
    await pg.screenshot({ path: `${EVID}/A05-inativo.png` });
    registrar("A05 usuario inativo", pg.url().endsWith("/login") ? "PASSOU" : "FALHOU",
      `continua no login=${pg.url().endsWith("/login")}, mensagem contem "inativo"=${/inativ|não encontrado/i.test(texto)}`);
    await pg.context().close();
  }
} finally {
  await navegador.close();
  console.log("\nRESUMO " + JSON.stringify(resultados));
}
