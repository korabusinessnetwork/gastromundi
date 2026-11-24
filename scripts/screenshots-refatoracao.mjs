// Roteiro de telas da refatoração (fase 0.1 de docs/09_BACKLOG/plano_refatoracao.md).
//
// Uso:
//   node scripts/screenshots-refatoracao.mjs capturar <pasta> [--ref <commit>]
//   node scripts/screenshots-refatoracao.mjs comparar <pastaAntes> <pastaDepois>
//
// `capturar` sobe o app (Vite) contra o Supabase falso de scripts/telas/ e
// fotografa cada tela do roteiro, em largura de computador e de celular. Com
// `--ref`, fotografa o app como ele era naquele commit (via git worktree), mas
// com o Supabase falso e o roteiro DESTE commit, para os dois lados verem os
// mesmos dados. É assim que a auditoria final compara com o ponto de partida
// sem precisar guardar imagem no repositório.
//
// `comparar` diz, tela por tela, se mudou e quanto. Diferença não é erro por
// si só: é o que a review precisa olhar e explicar.
//
// Requer o pacote `playwright` com Chromium disponível na máquina.

import { mkdirSync, readdirSync, readFileSync, existsSync, symlinkSync, rmSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { PNG } from "pngjs";
import { URL_FALSA, instalarSupabaseFalso, sessaoNoNavegador } from "./telas/supabaseFalso.mjs";

const RAIZ = resolve(import.meta.dirname, "..");
const AGORA = new Date("2026-11-20T15:00:00-03:00");

const LARGURAS = {
  computador: { viewport: { width: 1366, height: 768 } },
  celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};

const ABAS_CONFIGURACOES = [
  "Geral", "Identidade", "Usuários", "Meios de Pagamento", "Unidades de Medida", "Mesas",
  "Delivery", "Radar de Oportunidades", "Impressão", "Importar / Exportar", "Minha assinatura",
];

// Módulos que o celular abre de dentro da aba "Mais" do /palm, pelo rótulo
// do cartão. No celular as rotas /app/* não existem como tela própria.
const MODULOS_CELULAR = ["PDV", "Cardápio", "Estoque", "Cozinha", "Delivery", "Financeiro",
  "Relatórios", "Clientes", "Configurações"];

function paraArquivo(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// O nome da aba do /palm vem do rótulo visível; clicar por posição pegaria os
// filtros de categoria, que também são `role="tab"`. Termina com o rótulo, e
// não é igual a ele, porque a aba Comandas leva o contador antes no nome.
const abaDoPalm = (rotulo) => (page) =>
  page.getByRole("tab", { name: new RegExp(`${rotulo}$`) }).last().click({ timeout: 3000 });

// Cada item: nome do arquivo, perfil logado (null = sem sessão), caminho, e
// opcionalmente um passo depois de carregar.
function roteiro(largura) {
  const telas = [
    { nome: "login", perfil: null, caminho: "/login" },
    { nome: "cardapio-publico", perfil: null, caminho: "/cardapio?loja=demo" },
    { nome: "console", perfil: "plataforma", caminho: "/console" },
  ];
  for (const aba of ["Pedido", "Comandas", "Painel", "Mais"]) {
    telas.push({ nome: `palm-${paraArquivo(aba)}`, perfil: "dono", caminho: "/palm", passo: abaDoPalm(aba) });
  }

  if (largura === "celular") {
    for (const modulo of MODULOS_CELULAR) {
      telas.push({
        nome: `palm-modulo-${paraArquivo(modulo)}`, perfil: "dono", caminho: "/palm",
        passo: async (page) => {
          await abaDoPalm("Mais")(page);
          await page.getByRole("button", { name: new RegExp(`^${modulo}`) }).first().click({ timeout: 3000 });
        },
      });
    }
    return telas;
  }

  for (const modulo of ["pdv", "produtos", "delivery", "relatorio", "estoque", "financeiro",
    "cozinha", "clientes", "admin", "notas-fiscais"]) {
    telas.push({ nome: `app-${modulo}`, perfil: "dono", caminho: `/app/${modulo}` });
  }
  // Fase 5: o carrinho e a finalização só aparecem com uma comanda aberta.
  const abrirComanda15 = (page) =>
    page.locator("button.comanda-card", { hasText: "R$ 32.00" }).first().click({ timeout: 3000 });

  telas.push({
    nome: "app-pdv-comanda", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirComanda15(page);
      await page.getByRole("button", { name: /Brigadeiro/ }).first().click({ timeout: 3000 });
      await page.getByTitle("Adicionar observação").first().click({ timeout: 3000 });
    },
  });
  telas.push({
    nome: "app-pdv-cancelar-item", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirComanda15(page);
      await page.locator(".cart-panel__item", { hasText: "Suco" }).getByTitle("Cancelar item").click({ timeout: 3000 });
    },
  });
  telas.push({
    nome: "app-pdv-confirmar-finalizar", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirComanda15(page);
      await page.getByRole("button", { name: /Finalizar Comanda/ }).first().click({ timeout: 3000 });
    },
  });
  telas.push({
    nome: "app-pdv-finalizar", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirComanda15(page);
      await page.getByRole("button", { name: /Finalizar Comanda/ }).first().click({ timeout: 3000 });
      await page.getByRole("button", { name: "Sim, finalizar" }).click({ timeout: 3000 });
    },
  });
  for (const aba of ABAS_CONFIGURACOES) {
    telas.push({
      nome: `app-configuracoes-${paraArquivo(aba)}`,
      perfil: "dono", caminho: "/app/configuracoes",
      passo: (page) => page.getByRole("button", { name: aba, exact: true }).first().click({ timeout: 3000 }),
    });
  }
  return telas;
}

async function subirApp(raizApp) {
  process.env.VITE_SUPABASE_URL = URL_FALSA;
  process.env.VITE_SUPABASE_ANON_KEY = "chave-anon-falsa";
  const { createServer } = await import(join(RAIZ, "node_modules/vite/dist/node/index.js"));
  const servidor = await createServer({
    root: raizApp, configFile: join(raizApp, "vite.config.js"),
    server: { port: 0, host: "127.0.0.1" }, logLevel: "error", clearScreen: false,
  });
  await servidor.listen();
  const endereco = servidor.httpServer.address();
  return { servidor, origem: `http://127.0.0.1:${endereco.port}` };
}

async function capturar(pasta, ref) {
  let raizApp = RAIZ;
  let worktree = null;
  if (ref) {
    worktree = mkdtempSync(join(tmpdir(), "telas-ref-"));
    execFileSync("git", ["worktree", "add", "--detach", worktree, ref], { cwd: RAIZ, stdio: "ignore" });
    symlinkSync(join(RAIZ, "node_modules"), join(worktree, "node_modules"));
    raizApp = worktree;
  }

  // `require`, e não `import`: o require respeita o NODE_PATH, e é por ele que
  // se acha um Playwright instalado fora do projeto.
  const { chromium } = createRequire(import.meta.url)("playwright");
  const { servidor, origem } = await subirApp(raizApp);
  const navegador = await chromium.launch();
  mkdirSync(pasta, { recursive: true });
  const falhas = [];

  try {
    for (const [largura, opcoes] of Object.entries(LARGURAS)) {
      for (const tela of roteiro(largura)) {
        const contexto = await navegador.newContext({
          ...opcoes, deviceScaleFactor: 1, locale: "pt-BR",
          timezoneId: "America/Sao_Paulo", reducedMotion: "reduce",
        });
        await contexto.clock.setFixedTime(AGORA);
        await instalarSupabaseFalso(contexto, origem);
        if (tela.perfil) {
          const { chave, valor } = sessaoNoNavegador(tela.perfil);
          await contexto.addInitScript(([k, v]) => { globalThis.localStorage.setItem(k, v); }, [chave, valor]);
        }
        const page = await contexto.newPage();
        const arquivo = join(pasta, `${largura}--${tela.nome}.png`);
        try {
          await page.goto(origem + tela.caminho, { waitUntil: "networkidle", timeout: 30000 });
          await page.waitForTimeout(600);
          if (tela.passo) {
            await tela.passo(page);
            await page.waitForLoadState("networkidle");
            await page.waitForTimeout(400);
          }
          await page.screenshot({ path: arquivo, fullPage: true, animations: "disabled", caret: "hide" });
        } catch (erro) {
          falhas.push(`${largura}--${tela.nome}: ${erro.message.split("\n")[0]}`);
          await page.screenshot({ path: arquivo, fullPage: true }).catch(() => {});
        }
        await contexto.close();
      }
    }
  } finally {
    await navegador.close();
    await servidor.close();
    if (worktree) {
      execFileSync("git", ["worktree", "remove", "--force", worktree], { cwd: RAIZ, stdio: "ignore" });
      rmSync(worktree, { recursive: true, force: true });
    }
  }

  const total = readdirSync(pasta).filter((f) => f.endsWith(".png")).length;
  console.log(`${total} telas fotografadas em ${pasta}`);
  if (falhas.length) {
    console.log(`\n${falhas.length} passo(s) não concluído(s), foto tirada assim mesmo:`);
    for (const f of falhas) console.log(`  ${f}`);
  }
}

function diferencaEmPixels(a, b) {
  const pa = PNG.sync.read(readFileSync(a));
  const pb = PNG.sync.read(readFileSync(b));
  if (pa.width !== pb.width || pa.height !== pb.height) {
    return { tamanhoMudou: true, antes: `${pa.width}x${pa.height}`, depois: `${pb.width}x${pb.height}` };
  }
  let diferentes = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    if (Math.abs(pa.data[i] - pb.data[i]) > 16 || Math.abs(pa.data[i + 1] - pb.data[i + 1]) > 16 ||
        Math.abs(pa.data[i + 2] - pb.data[i + 2]) > 16) diferentes++;
  }
  return { percentual: (100 * diferentes) / (pa.width * pa.height) };
}

function comparar(antes, depois) {
  const nomes = new Set([...readdirSync(antes), ...readdirSync(depois)].filter((f) => f.endsWith(".png")));
  let mudaram = 0;
  for (const nome of [...nomes].sort()) {
    const a = join(antes, nome);
    const b = join(depois, nome);
    if (!existsSync(a)) { console.log(`NOVA       ${nome}`); mudaram++; continue; }
    if (!existsSync(b)) { console.log(`SUMIU      ${nome}`); mudaram++; continue; }
    const r = diferencaEmPixels(a, b);
    if (r.tamanhoMudou) { console.log(`TAMANHO    ${nome} (${r.antes} para ${r.depois})`); mudaram++; }
    else if (r.percentual > 0.1) { console.log(`MUDOU      ${nome} (${r.percentual.toFixed(2)}% dos pixels)`); mudaram++; }
  }
  console.log(`\n${nomes.size} telas comparadas, ${mudaram} com diferença.`);
  process.exitCode = mudaram ? 1 : 0;
}

const [comando, ...resto] = process.argv.slice(2);
if (comando === "capturar" && resto[0]) {
  const i = resto.indexOf("--ref");
  await capturar(resolve(resto[0]), i >= 0 ? resto[i + 1] : null);
} else if (comando === "comparar" && resto[0] && resto[1]) {
  comparar(resolve(resto[0]), resolve(resto[1]));
} else {
  console.log("Uso:\n  node scripts/screenshots-refatoracao.mjs capturar <pasta> [--ref <commit>]\n" +
    "  node scripts/screenshots-refatoracao.mjs comparar <pastaAntes> <pastaDepois>");
  process.exitCode = 2;
}
