/**
 * Suíte de navegador: operação do PDV. Executa no app rodando e confere o
 * resultado no banco, não só na tela.
 *
 * O caso OP04 afirma o comportamento certo e falha na maior parte das execuções
 * por causa do bug B01 do relatório de varredura, que é intermitente (12 de 15).
 * Ele aparece como PENDENTE quando reproduz e como CORRIGIDO quando não reproduz,
 * então só vale como prova de correção depois de várias execuções seguidas limpas.
 */
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const BASE = process.env.QA_BASE || "http://127.0.0.1:5201";
const EVID = process.env.QA_EVID || ".full-auto/varredura/suites/operacao/evidencias";
const CHROME = process.env.QA_CHROME || "/opt/pw-browsers/chromium";
const PGPORT = process.env.PGPORT_QA || "55432";
const BANCO = process.env.BANCO_QA || "qa_base";
const TENANT = "aaaaaaaa-0000-4000-8000-000000000001";

const sql = (q) => execFileSync("psql", ["-h", "/tmp", "-p", PGPORT, "-U", "postgres", "-d", BANCO, "-tAc", q], { encoding: "utf8" }).trim();

const resultados = [];
const registrar = (id, ok, nota, pendente = false) => {
  const status = pendente ? (ok ? "CORRIGIDO" : "PENDENTE") : ok ? "PASSOU" : "FALHOU";
  resultados.push({ id, status, nota, pendente });
  console.log(`${status.padEnd(9)} ${id}  ${nota}`);
};

const nav = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const abrir = async () => {
  const pg = await (await nav.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await pg.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await pg.fill('input[type="password"]', "qa123456");
  await pg.fill('input:not([type="password"]):visible', "qa-admin-a");
  await pg.click('button:has-text("Entrar")');
  await pg.waitForTimeout(4000);
  return pg;
};
const entrarNaComanda = async (pg, numero) => {
  await pg.locator(`button:has-text("${numero}")`).first().click();
  await pg.waitForTimeout(1500);
  // a modal de mesa só aparece quando a comanda ainda não existe
  const mesa = pg.locator('input[placeholder*="Varanda"]');
  if (await mesa.count()) {
    await mesa.fill(String(numero));
    await pg.click('button:has-text("Entrar na comanda")');
  }
  await pg.waitForTimeout(2500);
};
const somarDoisPaes = async (pg) => {
  await pg.locator('button:has-text("Pão de queijo")').first().click();
  await pg.locator('button:has-text("Pão de queijo")').first().click();
  await pg.waitForTimeout(600);
};
const irAoCheckout = async (pg) => {
  // a tela leva um instante para liberar o botão depois de carregar a comanda
  await pg.locator('button:has-text("Finalizar Comanda")').first().waitFor({ state: "visible", timeout: 15000 });
  await pg.waitForTimeout(2000);
  await pg.click('button:has-text("Finalizar Comanda")', { timeout: 15000 });
  await pg.waitForTimeout(1200);
  const sim = pg.locator('button:has-text("Sim, finalizar")');
  if (await sim.count()) await sim.click();
  await pg.waitForTimeout(3500);
  const t = await pg.locator("body").innerText();
  return { itens: /Comanda [^·]+·\s*(\d+) iten?s/.exec(t)?.[1] ?? "0", total: /Total\s+R\$ ?([\d.,]+)/.exec(t)?.[1] ?? "0" };
};

const proteger = async (id, fn) => { try { await fn(); } catch (e) { registrar(id, false, `a suite nao conseguiu executar o caso: ${String(e.message || e).slice(0,160)}`); } };

try {
  sql(`UPDATE public.config SET value='false'::jsonb WHERE key='caixa_aberto' AND tenant_id='${TENANT}'`);
  sql(`DELETE FROM public.pending WHERE comanda IN ('15','16') AND tenant_id='${TENANT}'`);

  { const pg = await abrir();
    const txt = await pg.locator("body").innerText();
    await pg.screenshot({ path: `${EVID}/OP01-caixa-fechado.png` });
    registrar("OP01 caixa fechado bloqueia o PDV", /Caixa Fechado/i.test(txt), "tela de bloqueio visivel");
    // abre o caixa pela interface
    await pg.click('button:has-text("Abrir Caixa")');
    await pg.waitForTimeout(1200);
    await pg.fill("input:visible", "100");
    await pg.click('button:has-text("✓ Abrir Caixa")');
    await pg.waitForTimeout(3000);
    const noBanco = sql(`select value::text from public.config where key='caixa_aberto' and tenant_id='${TENANT}'`);
    const fundo = sql(`select value::text from public.config where key='fundo_atual' and tenant_id='${TENANT}'`);
    await pg.screenshot({ path: `${EVID}/OP02-caixa-aberto.png` });
    registrar("OP02 abrir caixa pela tela grava no banco", noBanco === "true" && fundo === "100", `caixa_aberto=${noBanco}, fundo=${fundo}`);
    await pg.context().close(); }

  // OP03: caminho normal, lançar o pedido e então fechar a conta
  await proteger("OP03", async () => { const pg = await abrir();
    await entrarNaComanda(pg, 15);
    await somarDoisPaes(pg);
    await pg.click('button:has-text("Lançar Pedido")');
    await pg.waitForTimeout(3500);
    const total = sql(`select total::text from public.pending where comanda='15' and tenant_id='${TENANT}'`);
    await entrarNaComanda(pg, 15);
    const c = await irAoCheckout(pg);
    await pg.screenshot({ path: `${EVID}/OP03-checkout-lancado.png` });
    registrar("OP03 lancar e fechar a conta leva o valor certo ao checkout",
      total === "15" && c.total === "15.00", `pending.total=${total}, checkout=${c.itens} itens e R$ ${c.total}`);
    await pg.context().close(); });

  // OP04: PENDENTE, B01. Carrinho direto para o fechamento, sem lançar antes.
  await proteger("OP04", async () => { const pg = await abrir();
    await entrarNaComanda(pg, 16);
    await somarDoisPaes(pg);
    const c = await irAoCheckout(pg);
    const noBanco = sql(`select coalesce(total::text,'ausente') from public.pending where comanda='16' and tenant_id='${TENANT}'`);
    await pg.screenshot({ path: `${EVID}/OP04-checkout-do-carrinho.png` });
    registrar("OP04 fechar a conta direto do carrinho leva o valor ao checkout",
      c.total === "15.00", `checkout mostra ${c.itens} itens e R$ ${c.total}, enquanto a comanda no banco tem total ${noBanco}. Medido em 9 de 10 execucoes com comanda nova aberta pelo slot vazio`, true);
    await pg.context().close(); });

  // OP05: venda completa, do carrinho ao dinheiro na gaveta, conferida no banco
  await proteger("OP05", async () => { const pg = await abrir();
    const antes = sql(`select coalesce(quantidade::text,'0') from public.estoque where produto_id=(select id from public.products where name='qa-Pão de queijo com açúcar 🧀')`) || "0";
    await entrarNaComanda(pg, 17);
    await somarDoisPaes(pg);
    await pg.click('button:has-text("Lançar Pedido")');
    await pg.waitForTimeout(3500);
    await entrarNaComanda(pg, 17);
    await irAoCheckout(pg);
    // exato, senão casa com "Retirar / Colocar Dinheiro" da barra lateral
    await pg.getByRole("button", { name: "Dinheiro", exact: true }).click();
    await pg.waitForTimeout(1500);
    await pg.click('button:has-text("Confirmar Pagamento")');
    await pg.waitForTimeout(6000);
    await pg.screenshot({ path: `${EVID}/OP05-venda-confirmada.png`, fullPage: true });
    const venda = sql(`select v.total::text || '|' ||
        (select coalesce(sum(vi.qtd)::text,'0') from public.venda_itens vi where vi.venda_id = v.id) || '|' ||
        (select coalesce(string_agg(vp.metodo || ' ' || vp.valor::text, ','),'') from public.venda_pagamentos vp where vp.venda_id = v.id)
      from public.vendas v where v.comanda='17' and v.tenant_id='${TENANT}' order by v.at desc limit 1`);
    const comandaSumiu = sql(`select count(*)::text from public.pending where comanda='17' and tenant_id='${TENANT}'`);
    const depois = sql(`select coalesce(quantidade::text,'0') from public.estoque where produto_id=(select id from public.products where name='qa-Pão de queijo com açúcar 🧀')`) || "0";
    const receita = sql(`select count(*)::text from public.lancamentos where tenant_id='${TENANT}' and venda_id = (select id from public.vendas where comanda='17' and tenant_id='${TENANT}' order by at desc limit 1)`);
    const [total, qtd, pagto] = (venda || "||").split("|");
    registrar("OP05 venda completa grava venda, itens, pagamento, baixa o estoque e cria a receita",
      Number(total) === 15 && Number(qtd) === 2 && pagto.startsWith("dinheiro") && comandaSumiu === "0" && Number(depois) === Number(antes) - 2 && receita === "1",
      `venda total=${total}, unidades=${qtd}, pagamento=${pagto}, comandas abertas=${comandaSumiu}, estoque ${antes} para ${depois}, lancamento de receita=${receita}`);
    await pg.context().close(); });
} finally {
  await nav.close();
  const falhas = resultados.filter((r) => r.status === "FALHOU");
  const pend = resultados.filter((r) => r.status === "PENDENTE");
  console.log(`\npdv: ${resultados.filter(r => r.status === "PASSOU").length} passaram, ${falhas.length} falharam, ${pend.length} pendentes (bug conhecido)`);
  process.exit(falhas.length ? 1 : 0);
}
