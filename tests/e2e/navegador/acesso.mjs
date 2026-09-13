/**
 * Suíte de navegador: acesso. Roda o app de verdade contra a ponte de QA.
 * Pré-requisito: tests/e2e/preparar-ambiente.sh, a ponte e o preview no ar.
 * Ver .full-auto/varredura/AMBIENTE.md.
 */
import { chromium } from "playwright-core";

const BASE = process.env.QA_BASE || "http://127.0.0.1:5201";
const EVID = process.env.QA_EVID || ".full-auto/varredura/suites/acesso/evidencias";
const CHROME = process.env.QA_CHROME || "/opt/pw-browsers/chromium";
// Google Fonts é bloqueado pela política de rede do ambiente de teste, não é
// falha do sistema. Realtime e storage não são emulados pela ponte, de propósito.
const RUIDO = /favicon|manifest|sw\.js|Service Worker|realtime|websocket|fonts\.googleapis|ERR_CONNECTION_RESET|501/i;

const resultados = [];
const registrar = (id, ok, nota) => {
  resultados.push({ id, status: ok ? "PASSOU" : "FALHOU", nota });
  console.log(`${ok ? "PASSOU" : "FALHOU"}  ${id}  ${nota}`);
};

const nav = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const novaPagina = async () => {
  const pg = await (await nav.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  pg.erros = [];
  pg.on("console", (m) => { if (m.type() === "error" && !RUIDO.test(m.text())) pg.erros.push(m.text()); });
  pg.on("pageerror", (e) => pg.erros.push(String(e)));
  return pg;
};
const entrar = async (pg, usuario, senha) => {
  await pg.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await pg.fill('input[type="password"]', senha);
  await pg.fill('input:not([type="password"]):visible', usuario);
  await pg.click('button:has-text("Entrar")');
};

try {
  { const pg = await novaPagina();
    await pg.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    const campos = await pg.locator('input[type="password"]').count();
    await pg.screenshot({ path: `${EVID}/A01-login.png` });
    registrar("A01 a tela de login abre sem erro de console", campos === 1 && pg.erros.length === 0,
      `campo de senha=${campos}, erros=${pg.erros.length}${pg.erros[0] ? ` (${pg.erros[0].slice(0,120)})` : ""}`);
    await pg.context().close(); }

  { const pg = await novaPagina();
    await entrar(pg, "qa-admin-a", "qa123456");
    await pg.waitForTimeout(4000);
    await pg.screenshot({ path: `${EVID}/A02-pos-login.png` });
    registrar("A02 credencial valida entra no sistema", !pg.url().endsWith("/login"), `url apos entrar: ${pg.url()}`);
    await pg.context().close(); }

  { const pg = await novaPagina();
    await entrar(pg, "qa-admin-a", "senha-errada");
    await pg.waitForTimeout(2500);
    const txt = await pg.locator("body").innerText();
    await pg.screenshot({ path: `${EVID}/A03-senha-errada.png` });
    registrar("A03 senha errada avisa e nao entra", /incorret|inv[áa]lid|tentativa/i.test(txt) && pg.url().endsWith("/login"),
      `mensagem visivel=${/incorret|inv[áa]lid|tentativa/i.test(txt)}`);
    await pg.context().close(); }

  { const pg = await novaPagina();
    await pg.goto(`${BASE}/app/financeiro`, { waitUntil: "networkidle" });
    await pg.waitForTimeout(2500);
    await pg.screenshot({ path: `${EVID}/A04-rota-protegida.png` });
    registrar("A04 rota protegida sem sessao volta ao login", pg.url().includes("/login"), `url: ${pg.url()}`);
    await pg.context().close(); }

  { const pg = await novaPagina();
    await entrar(pg, "qa-inativo-a", "qa123456");
    await pg.waitForTimeout(2500);
    await pg.screenshot({ path: `${EVID}/A05-inativo.png` });
    registrar("A05 usuario inativo nao entra", pg.url().endsWith("/login"), `continua no login`);
    await pg.context().close(); }

  { const pg = await novaPagina();
    await entrar(pg, "qa-admin-b", "qa123456");
    await pg.waitForTimeout(3000);
    await pg.screenshot({ path: `${EVID}/A06-credencial-de-outro.png` });
    registrar("A06 credencial de outro estabelecimento nao entra aqui", pg.url().endsWith("/login"),
      `o e-mail montado usa o slug do endereco, entao a credencial do vizinho nao existe nesta porta`);
    await pg.context().close(); }
} finally {
  await nav.close();
  const falhas = resultados.filter((r) => r.status === "FALHOU");
  console.log(`\nacesso: ${resultados.length - falhas.length} de ${resultados.length} passaram`);
  process.exit(falhas.length ? 1 : 0);
}
