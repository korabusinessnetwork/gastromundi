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
// Um sócio logado nas pautas, com três pautas, uma em cada situação. A sessão é a
// do supabase-js no navegador, com o e-mail `<sócio>@pautas.local` que as pautas
// reconhecem; as listas respondem pela rota da própria tela.
async function comSocioDasPautas(contexto) {
  const { chave, valor } = sessaoNoNavegador("dono");
  const sessao = JSON.parse(valor);
  sessao.user = { ...sessao.user, email: "matheus@pautas.local" };
  await contexto.addInitScript(([k, v]) => { globalThis.localStorage.setItem(k, v); }, [chave, JSON.stringify(sessao)]);
  const responder = (corpo) => (route) => (route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(corpo) })
    : route.fallback());
  await contexto.route(/\/rest\/v1\/pautas_pessoas/, responder([
    { slug: "matheus", nome: "Matheus", ativo: true, ordem: 1 }, { slug: "bruna", nome: "Bruna", ativo: true, ordem: 2 },
  ]));
  const pauta = (id, titulo, status, dias) => ({
    id, titulo, intuito: "Combinar o próximo passo", contexto: null, envolvidos: ["matheus", "bruna"], status,
    criada_por: "matheus", atualizada_por: "matheus", created_at: `2026-11-${20 - dias}T12:00:00.000Z`,
    updated_at: `2026-11-${20 - dias}T12:00:00.000Z`, finalizada_em: status === "finalizado" ? "2026-11-19T12:00:00.000Z" : null,
  });
  await contexto.route(/\/rest\/v1\/pautas\?/, responder([
    pauta("p1", "Revisar o cardápio de dezembro", "pendente", 1),
    pauta("p2", "Fechar o fornecedor de bebidas", "em_progresso", 3),
    pauta("p3", "Treinar a equipe nova no PDV", "finalizado", 6),
  ]));
}

function roteiro(largura) {
  const telas = [
    { nome: "login", perfil: null, caminho: "/login" },
    // Fase 5: login com senha errada e com endereço de estabelecimento que não existe.
    { nome: "login-erro", perfil: null, caminho: "/login",
      passo: async (page) => {
        await page.getByPlaceholder("Digite seu usuário").fill("ana", { timeout: 3000 });
        await page.getByPlaceholder("Digite sua senha").fill("errada", { timeout: 3000 });
        await page.getByRole("button", { name: "Entrar" }).click({ timeout: 3000 });
        await page.waitForTimeout(800);
      } },
    { nome: "login-endereco-invalido", perfil: null, caminho: "/login", host: "nada.loja.localhost" },
    { nome: "cardapio-publico", perfil: null, caminho: "/cardapio?loja=demo" },
    // Site da Kora (domínio da plataforma) e pautas (subdomínio próprio).
    { nome: "apex-vitrine", perfil: null, caminho: "/", host: "localhost" },
    { nome: "apex-entrar", perfil: null, caminho: "/entrar", host: "localhost" },
    { nome: "apex-criar-conta", perfil: null, caminho: "/criar-conta", host: "localhost" },
    { nome: "apex-novidades", perfil: null, caminho: "/patchnotes", host: "localhost" },
    { nome: "apex-demo", perfil: null, caminho: "/demo", host: "localhost" },
    { nome: "pautas-login", perfil: null, caminho: "/", host: "pautas.localhost" },
    { nome: "pautas-quadro", perfil: null, caminho: "/", host: "pautas.localhost", preparar: comSocioDasPautas },
    { nome: "pautas-nova", perfil: null, caminho: "/", host: "pautas.localhost", preparar: comSocioDasPautas,
      passo: (page) => page.getByRole("button", { name: /Nova pauta/ }).first().click({ timeout: 3000 }) },
    { nome: "console", perfil: "plataforma", caminho: "/console" },
    // Fase 5: aba de planos do Console. (A sacola do cardápio público não entra:
    // o estabelecimento de demonstração não tem delivery configurado.)
    { nome: "console-planos", perfil: "plataforma", caminho: "/console",
      passo: (page) => page.getByRole("button", { name: /Planos/ }).first().click({ timeout: 3000 }) },
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
  // Fase 5: estados do painel de pagamento (troco, falta, divisor, divisão).
  const irParaPagamento = async (page) => {
    await abrirComanda15(page);
    await page.getByRole("button", { name: /Finalizar Comanda/ }).first().click({ timeout: 3000 });
    await page.getByRole("button", { name: "Sim, finalizar" }).click({ timeout: 3000 });
  };
  const escolherDinheiro = async (page, recebido) => {
    await irParaPagamento(page);
    await page.locator(".checkout-view__metodo-card", { hasText: "Dinheiro" }).click({ timeout: 3000 });
    await page.locator(".checkout-view__troco-input").fill(recebido, { timeout: 3000 });
  };
  telas.push({ nome: "app-pdv-pagar-troco", perfil: "dono", caminho: "/app/pdv",
    passo: (page) => escolherDinheiro(page, "50") });
  telas.push({ nome: "app-pdv-pagar-falta", perfil: "dono", caminho: "/app/pdv",
    passo: (page) => escolherDinheiro(page, "20") });
  telas.push({ nome: "app-pdv-pagar-divisor", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await irParaPagamento(page);
      await page.getByRole("button", { name: /Dividir pagamento/ }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-pdv-pagar-dividido", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await irParaPagamento(page);
      await page.getByRole("button", { name: /Dividir pagamento/ }).click({ timeout: 3000 });
      await page.getByRole("button", { name: "Dividir", exact: true }).click({ timeout: 3000 });
      const itens = page.locator(".checkout-view__split-item");
      await itens.nth(0).getByRole("button", { name: "Dinheiro" }).click({ timeout: 3000 });
      await itens.nth(0).locator(".checkout-view__recebido-input").fill("20", { timeout: 3000 });
      await itens.nth(1).locator(".checkout-view__split-input").fill("10", { timeout: 3000 });
      await page.locator(".checkout-view__pagamento-titulo").click({ timeout: 3000 });
    } });
  // Fase 5: cancelar comanda com itens, cancelar pedido vazio e escolher mesa.
  telas.push({ nome: "app-pdv-cancelar-comanda", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirComanda15(page);
      await page.getByRole("button", { name: /Cancelar Comanda/ }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-pdv-cancelar-pedido", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await page.locator("button.comanda-card", { hasText: "21" }).first().click({ timeout: 3000 });
      await page.getByPlaceholder(/Ex: 5, Varanda/).fill("9", { timeout: 3000 });
      await page.getByRole("button", { name: /Entrar na comanda/ }).click({ timeout: 3000 });
      await page.getByRole("button", { name: /Cancelar Pedido/ }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-pdv-escolher-mesa", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirComanda15(page);
      await page.getByTitle("Editar mesa e apelido").click({ timeout: 3000 });
    } });
  // Fase 5: mapa de mesas e reservas do PDV (cada situação, hover, busca).
  const abaPdv = (rotulo) => (page) => page.getByRole("button", { name: rotulo, exact: true }).first().click({ timeout: 3000 });
  telas.push({ nome: "app-pdv-mapa", perfil: "dono", caminho: "/app/pdv", passo: abaPdv("Mapa") });
  telas.push({ nome: "app-pdv-mapa-hover", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abaPdv("Mapa")(page);
      await page.locator(".card-mesa", { hasText: "Livre" }).first().hover({ timeout: 3000 });
    } });
  telas.push({ nome: "app-pdv-reservas", perfil: "dono", caminho: "/app/pdv", passo: abaPdv("Reservas") });
  telas.push({ nome: "app-pdv-reservas-busca", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abaPdv("Reservas")(page);
      await page.getByPlaceholder("Buscar mesa...").fill("99", { timeout: 3000 });
    } });
  // Fase 5: grade de comandas (hover, abertas, busca, comanda lançada).
  telas.push({ nome: "app-pdv-hover-livre", perfil: "dono", caminho: "/app/pdv",
    passo: (page) => page.locator("button.comanda-card", { hasText: "Disponível" }).first().hover({ timeout: 3000 }) });
  telas.push({ nome: "app-pdv-hover-comanda", perfil: "dono", caminho: "/app/pdv",
    passo: (page) => page.locator("button.comanda-card", { hasText: "R$ 28.50" }).first().hover({ timeout: 3000 }) });
  telas.push({ nome: "app-pdv-abertas", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await page.getByRole("button", { name: "Comandas abertas", exact: true }).click({ timeout: 3000 });
      await page.locator(".comanda-grid__item-busca", { hasText: "R$ 28.50" }).hover({ timeout: 3000 });
    } });
  telas.push({ nome: "app-pdv-busca-livre", perfil: "dono", caminho: "/app/pdv",
    passo: (page) => page.getByPlaceholder("Buscar comanda...").fill("30", { timeout: 3000 }) });
  telas.push({ nome: "app-pdv-busca-nada", perfil: "dono", caminho: "/app/pdv",
    passo: (page) => page.getByPlaceholder("Buscar comanda...").fill("00", { timeout: 3000 }) });
  telas.push({ nome: "app-pdv-lancada", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirComanda15(page);
      await page.getByRole("button", { name: /Brigadeiro/ }).first().click({ timeout: 3000 });
      await page.getByRole("button", { name: /Lançar Pedido/ }).click({ timeout: 3000 });
    } });
  // Fase 5: relatório de Desempenho (com dados, comparação aberta, período).
  // Fase 5: as outras abas do relatório (cancelamentos, fechamentos e o detalhe,
  // logs e o filtro, credenciais, admin).
  const abaRelatorio = (aba, depois) => async (page) => {
    await page.getByRole("button", { name: aba, exact: true }).first().click({ timeout: 3000 });
    if (depois) await depois(page);
  };
  const seteDias = (page) => page.getByRole("button", { name: "7 dias", exact: true }).first().click({ timeout: 3000 });
  telas.push({ nome: "app-relatorio-periodo", perfil: "dono", caminho: "/app/relatorio",
    passo: async (page) => {
      await page.getByRole("button", { name: "Período", exact: true }).first().click({ timeout: 3000 });
      await page.locator(".relatorio-date-input").first().fill("2026-11-15", { timeout: 3000 });
    } });
  telas.push({ nome: "app-relatorio-cancelamentos", perfil: "dono", caminho: "/app/relatorio", passo: abaRelatorio("Cancelamentos") });
  telas.push({ nome: "app-relatorio-fechamentos", perfil: "dono", caminho: "/app/relatorio",
    passo: abaRelatorio("Fechamentos", async (page) => {
      await seteDias(page);
      await page.locator("tr", { hasText: "Carla Demo" }).first().hover({ timeout: 3000 });
    }) });
  telas.push({ nome: "app-relatorio-fechamento-detalhe", perfil: "dono", caminho: "/app/relatorio",
    passo: abaRelatorio("Fechamentos", async (page) => {
      await seteDias(page);
      await page.locator("tr", { hasText: "Carla Demo" }).first().click({ timeout: 3000 });
    }) });
  telas.push({ nome: "app-relatorio-logs", perfil: "dono", caminho: "/app/relatorio", passo: abaRelatorio("Logs") });
  telas.push({ nome: "app-relatorio-logs-caixa", perfil: "dono", caminho: "/app/relatorio",
    passo: abaRelatorio("Logs", (page) => page.getByRole("button", { name: /Caixa/ }).last().click({ timeout: 3000 })) });
  telas.push({ nome: "app-relatorio-credenciais", perfil: "dono", caminho: "/app/relatorio", passo: abaRelatorio("Credenciais") });
  telas.push({ nome: "app-relatorio-admin", perfil: "dono", caminho: "/app/relatorio", passo: abaRelatorio("Admin", seteDias) });
  const abrirDesempenho = (page) => page.getByRole("button", { name: "Desempenho", exact: true }).click({ timeout: 3000 });
  telas.push({ nome: "app-relatorio-desempenho", perfil: "dono", caminho: "/app/relatorio", passo: abrirDesempenho });
  telas.push({ nome: "app-relatorio-desempenho-comparar", perfil: "dono", caminho: "/app/relatorio",
    passo: async (page) => {
      await abrirDesempenho(page);
      await page.locator(".desempenho__comp-btn").click({ timeout: 3000 });
      await page.locator(".desempenho__comp-popover").getByRole("menuitemradio", { name: "Período" }).click({ timeout: 3000 });
      await page.locator(".desempenho__comp-datas .desempenho__date-input").first().fill("2026-11-01", { timeout: 3000 });
    } });
  telas.push({ nome: "app-relatorio-desempenho-periodo", perfil: "dono", caminho: "/app/relatorio",
    passo: async (page) => {
      await abrirDesempenho(page);
      await page.locator(".desempenho__periodos").getByRole("button", { name: "Período" }).click({ timeout: 3000 });
      await page.locator(".desempenho__datas .desempenho__date-input").first().fill("2026-11-10", { timeout: 3000 });
    } });
  // Fase 5: comandas fechadas (lista, hover e detalhe de uma venda dividida).
  const abrirFechadas = (page) => page.getByRole("button", { name: /Comandas fechadas/ }).first().click({ timeout: 3000 });
  telas.push({ nome: "app-comandas-fechadas", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirFechadas(page);
      await page.getByRole("button", { name: /Comanda 8/ }).hover({ timeout: 3000 });
    } });
  telas.push({ nome: "app-comandas-fechadas-detalhe", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirFechadas(page);
      await page.getByRole("button", { name: /Comanda 9/ }).click({ timeout: 3000 });
    } });
  // Fase 5: as janelas da barra lateral. Cancelar uma venda fechada, a senha
  // que a caixa digita para abrir o Relatório e o convite de trocar de plano.
  telas.push({ nome: "app-cancelar-venda", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirFechadas(page);
      await page.getByRole("button", { name: /Comanda 9/ }).click({ timeout: 3000 });
      await page.getByRole("button", { name: /Cancelar venda/ }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-cancelar-venda-preenchida", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirFechadas(page);
      await page.getByRole("button", { name: /Comanda 9/ }).click({ timeout: 3000 });
      await page.getByRole("button", { name: /Cancelar venda/ }).click({ timeout: 3000 });
      await page.getByPlaceholder(/cobrança duplicada/).fill("Cobrança duplicada", { timeout: 3000 });
      await page.getByPlaceholder("Senha", { exact: true }).fill("errada", { timeout: 3000 });
      await page.getByRole("button", { name: "Cancelar venda", exact: true }).last().click({ timeout: 3000 });
      await page.waitForTimeout(400);
    } });
  const abrirSenhaRelatorio = (page) => page.locator(".sidebar__nav").getByRole("button", { name: /Relatório/ }).click({ timeout: 3000 });
  telas.push({ nome: "app-senha-relatorio", perfil: "caixa", caminho: "/app/pdv", passo: abrirSenhaRelatorio });
  telas.push({ nome: "app-senha-relatorio-erro", perfil: "caixa", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirSenhaRelatorio(page);
      await page.getByPlaceholder("nome de usuário").fill("ana", { timeout: 3000 });
      await page.getByPlaceholder("••••••••").fill("errada", { timeout: 3000 });
      await page.getByRole("button", { name: "Acessar Relatório" }).click({ timeout: 3000 });
      await page.waitForTimeout(400);
    } });
  // Um plano sem o módulo Delivery: o item fica na barra com o convite.
  // Estabelecimento com plano e, se pedido, uma assinatura. Sem `delivery`,
  // o plano não tem o módulo Delivery.
  const MODULOS_SEM_DELIVERY = ["cardapio", "pdv", "caixa", "estoque", "pedidos", "mesas_comandas", "cozinha",
    "alertas", "financeiro", "clientes", "relatorios", "jarvas", "fiscal_integracoes"];
  const comTenant = ({ modulos, assinatura }) => async (contexto) => {
    const responder = (corpo) => (route) => (route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(corpo) })
      : route.fallback());
    await contexto.route(/\/rest\/v1\/tenants/, responder({ id: "tenant-demo", nome: "Demo", slug: "demo", tema: temaTenant ?? {}, plano_codigo: "basico", created_at: "2026-01-01T00:00:00.000Z" }));
    await contexto.route(/\/rest\/v1\/planos_modulos/, responder(modulos.map((modulo_codigo) => ({ modulo_codigo }))));
    if (assinatura) await contexto.route(/\/rest\/v1\/assinaturas/, responder(assinatura));
  };
  const semDelivery = comTenant({ modulos: MODULOS_SEM_DELIVERY });
  telas.push({ nome: "app-plano-bloqueado", perfil: "dono", caminho: "/app/pdv", preparar: semDelivery,
    passo: (page) => page.locator(".sidebar__nav-item--bloqueado").first().click({ timeout: 3000 }) });
  // Fase 5: a casca do app (barra lateral recolhida, largura estreita com menu
  // de gaveta) e as telas de acesso (fora do plano, sem permissão, assinatura).
  const botaoRecolher = (page) => page.getByTitle(/Recolher sidebar|Expandir sidebar/);
  telas.push({ nome: "app-sidebar-hover", perfil: "dono", caminho: "/app/pdv", passo: (page) => botaoRecolher(page).hover({ timeout: 3000 }) });
  telas.push({ nome: "app-sidebar-recolhida", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => { await botaoRecolher(page).click({ timeout: 3000 }); await page.waitForTimeout(400); } });
  // A largura estreita (barra de topo com menu de gaveta) e a tela "Sem acesso"
  // não entram: abaixo de 768 px e sem nenhuma permissão o app manda para o
  // /palm, então o roteiro não chega a elas por navegação.
  telas.push({ nome: "app-fora-do-plano", perfil: "dono", caminho: "/app/delivery", preparar: semDelivery });
  const TODOS_OS_MODULOS = [...MODULOS_SEM_DELIVERY, "delivery"];
  // O relógio do roteiro está em 20/11/2026.
  telas.push({ nome: "app-assinatura-vencendo", perfil: "dono", caminho: "/app/pdv",
    preparar: comTenant({ modulos: TODOS_OS_MODULOS, assinatura: { data_vencimento: "2026-11-23", carencia_dias: 5, valor_mensal: 149, status: "ativo" } }) });
  telas.push({ nome: "app-assinatura-carencia", perfil: "dono", caminho: "/app/pdv",
    preparar: comTenant({ modulos: TODOS_OS_MODULOS, assinatura: { data_vencimento: "2026-11-18", carencia_dias: 5, valor_mensal: 149, status: "carencia" } }) });
  telas.push({ nome: "app-assinatura-bloqueada", perfil: "dono", caminho: "/app/pdv",
    preparar: comTenant({ modulos: TODOS_OS_MODULOS, assinatura: { data_vencimento: "2026-10-01", carencia_dias: 5, valor_mensal: 149, status: "bloqueado" } }) });
  // Fase 5: abertura de caixa, com o caixa fechado.
  const comCaixaFechado = (contexto) => contexto.route(/\/rest\/v1\/config\?.*caixa_aberto/, (route) => (route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([{ key: "caixa_aberto", value: false }, { key: "meios_pagamento", value: ["dinheiro", "credito", "debito", "pix"] }]) })
    : route.fallback()));
  const abrirAbertura = (page) => page.getByRole("button", { name: /Abrir Caixa/ }).first().click({ timeout: 3000 });
  telas.push({ nome: "app-abertura-caixa", perfil: "dono", caminho: "/app/pdv", preparar: comCaixaFechado, passo: abrirAbertura });
  telas.push({ nome: "app-abertura-caixa-valor", perfil: "dono", caminho: "/app/pdv", preparar: comCaixaFechado,
    passo: async (page) => {
      await abrirAbertura(page);
      await page.getByPlaceholder("0,00").fill("150", { timeout: 3000 });
    } });
  // Fase 5: fechamento de caixa. O botão só libera sem comanda aberta, então
  // estas telas respondem `pending` vazio.
  const semComandasAbertas = (extra) => async (contexto) => {
    await contexto.route(/\/rest\/v1\/pending/, (route) => (route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json",
        headers: { "access-control-allow-origin": "*", "content-range": "*/0" }, body: "[]" })
      : route.fallback()));
    if (extra) await extra(contexto);
  };
  const abrirFechamento = (page) => page.getByRole("button", { name: /Fechar Caixa/ }).first().click({ timeout: 3000 });
  telas.push({ nome: "app-fechamento", perfil: "dono", caminho: "/app/pdv",
    preparar: semComandasAbertas(), passo: abrirFechamento });
  telas.push({ nome: "app-fechamento-diferenca", perfil: "dono", caminho: "/app/pdv",
    // Um pagamento num método que o estabelecimento não ativou acende o aviso.
    preparar: semComandasAbertas((contexto) => contexto.route(/\/rest\/v1\/venda_pagamentos/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([
          { venda_id: "venda-1", metodo: "vale_refeicao", valor: 25 },
          { venda_id: "venda-2", metodo: "dinheiro", valor: 20 },
          { venda_id: "venda-2", metodo: "credito", valor: 22.5 },
          { venda_id: "venda-3", metodo: "debito", valor: 18 },
        ]) }))),
    passo: async (page) => {
      await abrirFechamento(page);
      const campos = page.locator(".fechamento-modal__input-conferido");
      await campos.nth(0).fill("80", { timeout: 3000 });
      await campos.nth(3).fill("30", { timeout: 3000 });
      await page.locator(".fechamento-modal__obs-textarea").fill("Faltou troco no fim da tarde.", { timeout: 3000 });
    } });
  // Fase 5: resumo do pedido na finalização (taxa de serviço, ajuste aplicado,
  // modo de remoção) e a janela de remover item. A taxa entra só nestas telas.
  const comTaxaDeServico = (contexto) => contexto.route(/\/rest\/v1\/config\?.*caixa_aberto/, (route) => (route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        { key: "caixa_aberto", value: true }, { key: "fundo_atual", value: 100 },
        { key: "sessao_aberta_em", value: "2026-11-20T11:00:00.000Z" },
        { key: "meios_pagamento", value: ["dinheiro", "credito", "debito", "pix"] },
        { key: "taxa_servico", value: true },
      ]) })
    : route.fallback()));
  telas.push({ nome: "app-pdv-finalizar-taxa", perfil: "dono", caminho: "/app/pdv",
    preparar: comTaxaDeServico, passo: (page) => irParaPagamento(page) });
  // Fase 5: o fiado (meio personalizado ligado) e a busca de cliente no
  // checkout. Clientes fictícios, só para a foto: a busca por "mar" acha dois.
  const comFiado = async (contexto) => {
    await contexto.route(/\/rest\/v1\/config\?.*caixa_aberto/, (route) => (route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([
          { key: "caixa_aberto", value: true }, { key: "fundo_atual", value: 100 },
          { key: "sessao_aberta_em", value: "2026-11-20T11:00:00.000Z" },
          { key: "meios_pagamento", value: ["dinheiro", "credito", "debito", "pix", "fiado"] },
          { key: "metodos_custom", value: [{ id: "fiado", label: "Fiado" }] },
        ]) })
      : route.fallback()));
    await contexto.route(/\/rest\/v1\/clientes/, (route) => (route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(/mar/i.test(decodeURIComponent(route.request().url()))
          ? [{ id: "cli-1", nome: "Maria Exemplo", telefone: "11988887777" },
             { id: "cli-2", nome: "Mariana Teste", telefone: null }]
          : []) })
      : route.fallback()));
  };
  const naBuscaDoFiado = (termo) => async (page) => {
    await irParaPagamento(page);
    await page.locator(".checkout-view__metodo-card", { hasText: "Fiado" }).click({ timeout: 3000 });
    if (termo) {
      await page.getByPlaceholder(/Fiado exige cliente/).fill(termo, { timeout: 3000 });
      await page.waitForTimeout(500);
    }
  };
  telas.push({ nome: "app-pdv-fiado", perfil: "dono", caminho: "/app/pdv", preparar: comFiado, passo: naBuscaDoFiado(null) });
  telas.push({ nome: "app-pdv-fiado-busca", perfil: "dono", caminho: "/app/pdv", preparar: comFiado, passo: naBuscaDoFiado("Mar") });
  telas.push({ nome: "app-pdv-fiado-novo", perfil: "dono", caminho: "/app/pdv", preparar: comFiado, passo: naBuscaDoFiado("Zeca") });
  telas.push({ nome: "app-pdv-fiado-telefone", perfil: "dono", caminho: "/app/pdv", preparar: comFiado,
    passo: async (page) => {
      await naBuscaDoFiado("Zeca")(page);
      await page.getByRole("button", { name: /Cadastrar "Zeca"/ }).click({ timeout: 3000 });
      await page.getByPlaceholder("(00) 00000-0000").fill("1199", { timeout: 3000 });
    } });
  telas.push({ nome: "app-pdv-fiado-escolhido", perfil: "dono", caminho: "/app/pdv", preparar: comFiado,
    passo: async (page) => {
      await naBuscaDoFiado("Mar")(page);
      await page.getByRole("button", { name: /Maria Exemplo/ }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-pdv-finalizar-voltar-hover", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await irParaPagamento(page);
      await page.locator(".checkout-view__btn-voltar").hover({ timeout: 3000 });
    } });
  const abrirSaldo = (page) => page.getByRole("button", { name: /Saldo do Dia/ }).first().click({ timeout: 3000 });
  telas.push({ nome: "app-pdv-saldo", perfil: "dono", caminho: "/app/pdv", passo: abrirSaldo });
  telas.push({ nome: "app-pdv-saldo-aberto", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirSaldo(page);
      await page.getByPlaceholder("Digite a senha de acesso").fill("1234", { timeout: 3000 });
      await page.getByRole("button", { name: "Acessar" }).click({ timeout: 3000 });
      await page.waitForTimeout(400);
    } });
  telas.push({ nome: "app-pdv-finalizar-sem-taxa", perfil: "dono", caminho: "/app/pdv",
    preparar: comTaxaDeServico,
    passo: async (page) => {
      await irParaPagamento(page);
      await page.locator(".checkout-view__btn-toggle-taxa").click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-pdv-finalizar-ajuste", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await irParaPagamento(page);
      await page.getByRole("button", { name: /Desconto \/ Acréscimo/ }).first().click({ timeout: 3000 });
      await page.getByRole("button", { name: /Acréscimo/ }).last().click({ timeout: 3000 });
      await page.getByRole("button", { name: /Valor Fixo/ }).click({ timeout: 3000 });
      await page.locator(".checkout-view__modal-input").fill("5", { timeout: 3000 });
      await page.getByRole("button", { name: "Aplicar", exact: true }).click({ timeout: 3000 });
    } });
  const modoRemocao = async (page) => {
    await irParaPagamento(page);
    await page.getByRole("button", { name: /Remover produto/ }).click({ timeout: 3000 });
  };
  telas.push({ nome: "app-pdv-remover-modo", perfil: "dono", caminho: "/app/pdv", passo: modoRemocao });
  telas.push({ nome: "app-pdv-remover-item", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await modoRemocao(page);
      await page.getByRole("button", { name: "Remover Suco de laranja" }).click({ timeout: 3000 });
      await page.locator(".checkout-view__remocao-motivo").fill("Pedido errado", { timeout: 3000 });
      await page.locator(".checkout-view__remocao-senha").fill("1234", { timeout: 3000 });
      await page.locator(".checkout-view__remocao-stepper button").last().click({ timeout: 3000 });
    } });
  // Fase 5: cadastro de produtos (hover, novo, insumo, erro, edição com compra e consumo).
  telas.push({ nome: "app-produtos-hover", perfil: "dono", caminho: "/app/produtos",
    passo: (page) => page.locator(".produtos-view__tr", { hasText: "Coxinha" }).hover({ timeout: 3000 }) });
  telas.push({ nome: "app-produtos-novo", perfil: "dono", caminho: "/app/produtos",
    passo: (page) => page.getByRole("button", { name: "+ Novo Produto" }).click({ timeout: 3000 }) });
  telas.push({ nome: "app-produtos-insumo", perfil: "dono", caminho: "/app/produtos",
    passo: (page) => page.getByRole("button", { name: "+ Novo Insumo" }).click({ timeout: 3000 }) });
  telas.push({ nome: "app-produtos-erro", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await page.getByRole("button", { name: "+ Novo Produto" }).click({ timeout: 3000 });
      await page.getByPlaceholder("Ou digite uma nova categoria").fill("Insumo", { timeout: 3000 });
      await page.getByRole("button", { name: "Cadastrar Produto" }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-produtos-editar", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await page.locator(".produtos-view__tr", { hasText: "Suco de laranja" }).getByRole("button", { name: "Editar" }).click({ timeout: 3000 });
      await page.locator(".produtos-view__unidades-lista").last().getByRole("button", { name: /copo/ }).click({ timeout: 3000 });
      await page.locator(".produtos-view__conversao-fator").last().fill("0.5", { timeout: 3000 });
      await page.locator(".produtos-view__modal").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    } });
  // Fase 5: janelas de categoria e de exclusão do cadastro de produtos.
  const abrirCategorias = (page) => page.getByRole("button", { name: /Categorias/ }).click({ timeout: 3000 });
  telas.push({ nome: "app-produtos-categorias", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await abrirCategorias(page);
      await page.getByPlaceholder("Ex: Bebidas, Lanches...").fill("Lanches", { timeout: 3000 });
    } });
  telas.push({ nome: "app-produtos-categoria-editar", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await abrirCategorias(page);
      await page.locator(".produtos-view__cat-item", { hasText: "Sobremesas" }).locator(".produtos-view__cat-btn-editar").click({ timeout: 3000 });
      await page.getByPlaceholder("Ex: Bebidas, Lanches...").fill("Pratos", { timeout: 3000 });
    } });
  telas.push({ nome: "app-produtos-categoria-excluir", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await abrirCategorias(page);
      await page.locator(".produtos-view__cat-item", { hasText: "Sobremesas" }).locator(".produtos-view__cat-btn-excluir").click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-produtos-excluir", perfil: "dono", caminho: "/app/produtos",
    passo: (page) => page.locator(".produtos-view__tr", { hasText: "Coxinha" }).getByRole("button", { name: "Excluir" }).click({ timeout: 3000 }) });
  // Fase 5: combos (lista, criar, editar com composição, excluir).
  const abrirCombos = (page) => page.getByRole("button", { name: "Combos", exact: true }).click({ timeout: 3000 });
  telas.push({ nome: "app-combos", perfil: "dono", caminho: "/app/produtos", passo: abrirCombos });
  telas.push({ nome: "app-combos-novo", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await abrirCombos(page);
      await page.getByRole("button", { name: /Criar Combo/ }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-combos-editar", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await abrirCombos(page);
      await page.locator(".combos-view__card", { hasText: "Combo Lanche" }).getByTitle("Editar combo").click({ timeout: 3000 });
      await page.getByText("Batata frita").last().waitFor({ timeout: 3000 });
    } });
  telas.push({ nome: "app-combos-excluir", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await abrirCombos(page);
      await page.locator(".combos-view__card", { hasText: "Combo Lanche" }).getByTitle("Excluir combo").click({ timeout: 3000 });
    } });
  // Fase 5: desconto e acréscimo no pagamento.
  const abrirAjuste = async (page) => {
    await irParaPagamento(page);
    await page.getByRole("button", { name: /Desconto \/ Acréscimo/ }).first().click({ timeout: 3000 });
  };
  telas.push({ nome: "app-pdv-desconto", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirAjuste(page);
      await page.locator(".checkout-view__modal-input").fill("10", { timeout: 3000 });
      await page.locator(".checkout-view__ajuste-senha").fill("12", { timeout: 3000 });
    } });
  telas.push({ nome: "app-pdv-acrescimo", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirAjuste(page);
      await page.getByRole("button", { name: /Acréscimo/ }).last().click({ timeout: 3000 });
      await page.getByRole("button", { name: /Valor Fixo/ }).click({ timeout: 3000 });
      await page.locator(".checkout-view__modal-input").fill("5", { timeout: 3000 });
    } });
  telas.push({ nome: "app-pdv-desconto-invalido", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirAjuste(page);
      await page.locator(".checkout-view__modal-input").fill("150", { timeout: 3000 });
    } });
  // Fase 5: Estoque com a entrada liberada pela senha de gerente.
  const liberarEntrada = async (page) => {
    await page.getByRole("button", { name: /Liberar Entrada/ }).click({ timeout: 3000 });
    await page.locator('input[type="password"]').fill("1234", { timeout: 3000 });
    await page.keyboard.press("Enter");
  };
  // Fase 5: a janela de senha que libera a entrada de estoque, vazia e com erro.
  const abrirLiberarEntrada = (page) => page.getByRole("button", { name: /Liberar Entrada/ }).click({ timeout: 3000 });
  telas.push({ nome: "app-estoque-autorizacao", perfil: "dono", caminho: "/app/estoque", passo: abrirLiberarEntrada });
  telas.push({ nome: "app-estoque-autorizacao-erro", perfil: "dono", caminho: "/app/estoque",
    passo: async (page) => {
      await abrirLiberarEntrada(page);
      await page.locator('input[type="password"]').fill("errada", { timeout: 3000 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
    } });
  telas.push({ nome: "app-estoque-hover", perfil: "dono", caminho: "/app/estoque",
    passo: (page) => page.locator(".estoque-view__tr", { hasText: "Coxinha" }).hover({ timeout: 3000 }) });
  telas.push({ nome: "app-estoque-liberado", perfil: "dono", caminho: "/app/estoque",
    passo: async (page) => {
      await liberarEntrada(page);
      await page.getByRole("columnheader", { name: /Saldo/ }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-estoque-compra", perfil: "dono", caminho: "/app/estoque",
    passo: async (page) => {
      await liberarEntrada(page);
      await page.getByPlaceholder("Buscar produto...").fill("Suco", { timeout: 3000 });
      await page.getByLabel("Entrada de Suco de laranja").fill("2", { timeout: 3000 });
    } });
  // Fase 5: painel do Jarvas. Os insights entram só nestas telas (rota da
  // própria tela), senão o sino mudaria em todas as outras fotos.
  const responder = (corpo) => (route) => route.fulfill({ status: 200, contentType: "application/json",
    headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(corpo) });
  const comInsights = async (contexto) => {
    await contexto.route(/\/rest\/v1\/jarvas_insights/, (route) => (route.request().method() === "GET"
      ? responder([
        { id: "ins-1", tipo: "alerta", severidade: "danger", visibilidade: "operacional", modulo: "estoque",
          titulo: "Água sem gás acabou", descricao: "O saldo zerou às 14h e o produto continua no cardápio.",
          acao: { tipo: "abrir_estoque", label: "Ver estoque" }, origem: "regra", status: "novo",
          created_at: "2026-11-20T17:10:00.000Z" },
        { id: "ins-2", tipo: "sugestao", severidade: "warning", visibilidade: "estrategico", modulo: "vendas",
          titulo: "Terça rende menos que a média", descricao: "As vendas de terça ficaram 30% abaixo das outras tardes no último mês.",
          acao: null, origem: "regra", status: "lido", created_at: "2026-11-19T12:00:00.000Z" },
        { id: "ins-3", tipo: "insight", severidade: "info", visibilidade: "estrategico", modulo: "relatorio",
          titulo: "Ticket médio subiu", descricao: "O ticket médio da semana passou de R$ 18 para R$ 20.",
          acao: { tipo: "abrir_relatorio", label: "Abrir relatório" }, origem: "regra", status: "novo",
          created_at: "2026-11-20T17:58:00.000Z" },
      ])(route)
      : route.fallback()));
    await contexto.route(/\/functions\/v1\/jarvas-assistente/, (route) => (route.request().method() === "POST"
      ? responder({ resposta: "Nos últimos 7 dias foram 24 vendas, R$ 485,50 no total." })(route)
      : route.fallback()));
  };
  const abrirJarvas = (page) => page.getByTitle("Jarvas, insights e alertas").click({ timeout: 3000 });
  telas.push({ nome: "app-jarvas-sino", perfil: "dono", caminho: "/app/pdv", preparar: comInsights });
  telas.push({ nome: "app-jarvas-vazio", perfil: "dono", caminho: "/app/pdv", passo: abrirJarvas });
  telas.push({ nome: "app-jarvas-insights", perfil: "dono", caminho: "/app/pdv", preparar: comInsights, passo: abrirJarvas });
  telas.push({ nome: "app-jarvas-chat", perfil: "dono", caminho: "/app/pdv", preparar: comInsights,
    passo: async (page) => {
      await abrirJarvas(page);
      await page.getByRole("button", { name: "Perguntar ao Jarvas" }).click({ timeout: 3000 });
      await page.getByPlaceholder("Pergunte ao Jarvas…").fill("Como foram as vendas da semana?", { timeout: 3000 });
      await page.keyboard.press("Enter");
      await page.getByText("24 vendas", { exact: false }).waitFor({ timeout: 3000 });
      await page.getByPlaceholder("Pergunte ao Jarvas…").fill("E o estoque?", { timeout: 3000 });
    } });
  // Fase 5: estados da barra lateral (caixa fechado, hover no subitem).
  telas.push({ nome: "app-sidebar-caixa-fechado", perfil: "dono", caminho: "/app/pdv",
    // Só a leitura da sessão de caixa; as outras chaves de config seguem pelo falso.
    preparar: (contexto) => contexto.route(/\/rest\/v1\/config\?.*caixa_aberto/, (route) => (route.request().method() === "GET"
      ? responder([
        { key: "caixa_aberto", value: false },
        { key: "fundo_atual", value: 0 },
        { key: "meios_pagamento", value: ["dinheiro", "credito", "debito", "pix"] },
      ])(route)
      : route.fallback())) });
  telas.push({ nome: "app-sidebar-hover", perfil: "dono", caminho: "/app/pdv",
    passo: (page) => page.getByRole("button", { name: /Comandas fechadas/ }).first().hover({ timeout: 3000 }) });
  // Fase 5: subprodutos (lista, cadastro, edição com estoque, exclusão).
  const abrirSubprodutos = (page) => page.getByRole("button", { name: "Subprodutos", exact: true }).click({ timeout: 3000 });
  const linhaSub = (page, nome) => page.locator("tr", { hasText: nome });
  telas.push({ nome: "app-subprodutos", perfil: "dono", caminho: "/app/produtos", passo: abrirSubprodutos });
  telas.push({ nome: "app-subprodutos-novo", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await abrirSubprodutos(page);
      await page.getByRole("button", { name: /Novo Subproduto/ }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-subprodutos-editar", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await abrirSubprodutos(page);
      await linhaSub(page, "Molho especial").getByRole("button", { name: "Editar" }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-subprodutos-excluir-em-uso", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await abrirSubprodutos(page);
      await linhaSub(page, "Batata frita").getByTitle("Excluir subproduto").click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-subprodutos-excluir", perfil: "dono", caminho: "/app/produtos",
    passo: async (page) => {
      await abrirSubprodutos(page);
      await linhaSub(page, "Molho especial").getByTitle("Excluir subproduto").click({ timeout: 3000 });
    } });
  // Fase 5: retirar e colocar dinheiro do caixa.
  const abrirMovimento = (page) => page.getByRole("button", { name: /Retirar \/ Colocar Dinheiro/ }).click({ timeout: 3000 });
  telas.push({ nome: "app-movimento-caixa", perfil: "dono", caminho: "/app/pdv", passo: abrirMovimento });
  telas.push({ nome: "app-movimento-retirar", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirMovimento(page);
      await page.getByLabel("Valor do movimento").fill("50", { timeout: 3000 });
      await page.getByLabel("Motivo do movimento").fill("Levado ao cofre", { timeout: 3000 });
    } });
  telas.push({ nome: "app-movimento-excede", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirMovimento(page);
      await page.getByLabel("Valor do movimento").fill("5000", { timeout: 3000 });
    } });
  telas.push({ nome: "app-movimento-colocar", perfil: "dono", caminho: "/app/pdv",
    passo: async (page) => {
      await abrirMovimento(page);
      await page.getByRole("dialog").getByRole("button", { name: /Colocar/ }).click({ timeout: 3000 });
      await page.getByLabel("Valor do movimento").fill("30", { timeout: 3000 });
    } });
  // Fase 5: os três modos da aba Vendas do relatório, com vendas no período.
  const modoVendas = (rotulo) => async (page) => {
    await page.getByRole("button", { name: "7 dias" }).click({ timeout: 3000 });
    await page.getByRole("button", { name: rotulo, exact: true }).click({ timeout: 3000 });
  };
  telas.push({ nome: "app-relatorio-resumido", perfil: "dono", caminho: "/app/relatorio", passo: modoVendas("Resumido") });
  telas.push({ nome: "app-relatorio-detalhado", perfil: "dono", caminho: "/app/relatorio", passo: modoVendas("Detalhado") });
  telas.push({ nome: "app-relatorio-por-dia", perfil: "dono", caminho: "/app/relatorio", passo: modoVendas("Por dia") });
  // Fase 5: Cozinha com um pedido em cada etapa. A consulta da Cozinha (a que
  // pede status_cozinha) recebe três pedidos fictícios; o resto do app segue
  // com as comandas de sempre. O relógio do roteiro está em 20/11 às 15h (18h UTC).
  const pedidoCozinha = (id, comanda, extra) => ({ id, comanda, mesa: null, apelido: null, status: "open",
    garcom: "Bruno Demo", items: [{ id: 1, name: "Café expresso", price: 6, qty: 2, category: "Bebidas" }],
    status_cozinha: null, created_at: "2026-11-20T17:55:00.000Z", em_preparo_em: null, pronto_em: null, ...extra });
  telas.push({ nome: "app-cozinha-etapas", perfil: "dono", caminho: "/app/cozinha",
    preparar: (contexto) => contexto.route(/\/rest\/v1\/pending\?.*status_cozinha/, (route) => (route.request().method() === "GET"
      ? route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([
          pedidoCozinha("coz-1", "30"),
          pedidoCozinha("coz-2", "31", { status_cozinha: "em_preparo", created_at: "2026-11-20T17:20:00.000Z", em_preparo_em: "2026-11-20T17:30:00.000Z", mesa: "4" }),
          pedidoCozinha("coz-3", "32", { status_cozinha: "em_preparo", created_at: "2026-11-20T17:50:00.000Z", em_preparo_em: "2026-11-20T17:56:00.000Z" }),
          pedidoCozinha("coz-4", "33", { status_cozinha: "pronto", created_at: "2026-11-20T17:00:00.000Z", em_preparo_em: "2026-11-20T17:10:00.000Z", pronto_em: "2026-11-20T17:40:00.000Z" }),
        ]) })
      : route.fallback())) });
  // Fase 5: Financeiro (novo lançamento nos dois tipos, filtro e falha de carga).
  const novoLancamento = (page) => page.getByRole("button", { name: /Novo lançamento/ }).click({ timeout: 3000 });
  telas.push({ nome: "app-financeiro-novo", perfil: "dono", caminho: "/app/financeiro", passo: novoLancamento });
  telas.push({ nome: "app-financeiro-novo-receita", perfil: "dono", caminho: "/app/financeiro",
    passo: async (page) => {
      await novoLancamento(page);
      await page.getByRole("button", { name: "Receita", exact: true }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-financeiro-vencidos", perfil: "dono", caminho: "/app/financeiro",
    passo: (page) => page.getByLabel("Filtrar por status").selectOption("vencido", { timeout: 3000 }) });
  telas.push({ nome: "app-financeiro-erro", perfil: "dono", caminho: "/app/financeiro",
    preparar: (contexto) => contexto.route(/\/rest\/v1\/lancamentos/, (route) => route.fulfill({ status: 500, contentType: "application/json",
      headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ message: "falha simulada" }) })) });
  // Fase 5: Clientes (cadastro, detalhe com fiado e sem, exclusão, edição).
  const abrirCliente = (nome) => (page) => page.locator(".clientes-view__card", { hasText: nome }).click({ timeout: 3000 });
  const noCliente = (nome, passo) => async (page) => {
    await abrirCliente(nome)(page);
    await page.waitForTimeout(300);
    if (passo) await passo(page);
  };
  telas.push({ nome: "app-clientes-novo", perfil: "dono", caminho: "/app/clientes",
    passo: async (page) => {
      await page.getByRole("button", { name: /Novo Cliente/ }).click({ timeout: 3000 });
      await page.getByPlaceholder("Nome do cliente").fill("Zeca", { timeout: 3000 });
      await page.getByPlaceholder("(00) 00000-0000").fill("1199", { timeout: 3000 });
    } });
  telas.push({ nome: "app-clientes-fiado", perfil: "dono", caminho: "/app/clientes", passo: noCliente("Maria Exemplo") });
  telas.push({ nome: "app-clientes-fiado-registrar", perfil: "dono", caminho: "/app/clientes",
    passo: noCliente("Maria Exemplo", (page) => page.getByRole("button", { name: "Registrar pagamento" }).first().click({ timeout: 3000 })) });
  telas.push({ nome: "app-clientes-quitado", perfil: "dono", caminho: "/app/clientes", passo: noCliente("Carlos Teste") });
  telas.push({ nome: "app-clientes-excluir-bloqueado", perfil: "dono", caminho: "/app/clientes",
    passo: noCliente("Maria Exemplo", (page) => page.getByRole("button", { name: /Excluir/ }).click({ timeout: 3000 })) });
  telas.push({ nome: "app-clientes-excluir", perfil: "dono", caminho: "/app/clientes",
    passo: noCliente("Carlos Teste", (page) => page.getByRole("button", { name: /Excluir/ }).click({ timeout: 3000 })) });
  telas.push({ nome: "app-clientes-editar", perfil: "dono", caminho: "/app/clientes",
    passo: noCliente("Carlos Teste", (page) => page.getByRole("button", { name: /Editar/ }).click({ timeout: 3000 })) });
  // Fase 5: grade da Área Admin, Fornecedores e Compras.
  const abrirSecaoAdmin = (rotulo) => (page) => page.locator(".grade-inicial__card", { hasText: rotulo }).first().click({ timeout: 3000 });
  telas.push({ nome: "app-admin-hover", perfil: "dono", caminho: "/app/admin",
    passo: (page) => page.locator(".grade-inicial__card", { hasText: "Fornecedores" }).first().hover({ timeout: 3000 }) });
  telas.push({ nome: "app-admin-fornecedores", perfil: "dono", caminho: "/app/admin", passo: abrirSecaoAdmin("Fornecedores") });
  telas.push({ nome: "app-admin-fornecedores-hover", perfil: "dono", caminho: "/app/admin",
    passo: async (page) => {
      await abrirSecaoAdmin("Fornecedores")(page);
      await page.locator(".admin__tr", { hasText: "Padaria Modelo" }).hover({ timeout: 3000 });
    } });
  telas.push({ nome: "app-admin-fornecedor-novo", perfil: "dono", caminho: "/app/admin",
    passo: async (page) => {
      await abrirSecaoAdmin("Fornecedores")(page);
      await page.getByRole("button", { name: /Novo Fornecedor/ }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-admin-compras", perfil: "dono", caminho: "/app/admin", passo: abrirSecaoAdmin("Compras") });
  telas.push({ nome: "app-admin-compra-nova", perfil: "dono", caminho: "/app/admin",
    passo: async (page) => {
      await abrirSecaoAdmin("Compras")(page);
      await page.getByRole("button", { name: /Registrar Compra/ }).click({ timeout: 3000 });
      await page.locator(".compras-tab__select-fornecedor").selectOption("Padaria Modelo", { timeout: 3000 });
      await page.getByRole("button", { name: /Adicionar item/ }).click({ timeout: 3000 });
      await page.getByPlaceholder("Produto / insumo").fill("Pão francês", { timeout: 3000 });
      await page.getByPlaceholder("Qtd").fill("30", { timeout: 3000 });
      await page.getByPlaceholder("R$/un").fill("0.6", { timeout: 3000 });
      await page.getByRole("button", { name: "Pago", exact: true }).click({ timeout: 3000 });
    } });
  telas.push({ nome: "app-admin-compra-outro", perfil: "dono", caminho: "/app/admin",
    passo: async (page) => {
      await abrirSecaoAdmin("Compras")(page);
      await page.getByRole("button", { name: /Registrar Compra/ }).click({ timeout: 3000 });
      await page.locator(".compras-tab__select-fornecedor").selectOption("__outro", { timeout: 3000 });
    } });
  telas.push({ nome: "app-admin-compra-excluir", perfil: "dono", caminho: "/app/admin",
    passo: async (page) => {
      await abrirSecaoAdmin("Compras")(page);
      await page.locator(".admin__tr").first().locator("button").nth(1).click({ timeout: 3000 });
    } });
  // Fase 5: Impostos (lista, busca, vazio, erro de carga e as quatro abas da janela).
  const naImpostos = (passo) => async (page) => {
    await abrirSecaoAdmin("Impostos")(page);
    if (passo) await passo(page);
  };
  const configurarPrimeiroPendente = (page) => page.getByRole("button", { name: "Configurar", exact: true }).first().click({ timeout: 3000 });
  const abaFiscal = (rotulo) => async (page) => {
    await configurarPrimeiroPendente(page);
    await page.getByRole("button", { name: rotulo, exact: true }).click({ timeout: 3000 });
  };
  telas.push({ nome: "app-admin-impostos", perfil: "dono", caminho: "/app/admin", passo: naImpostos() });
  telas.push({ nome: "app-admin-impostos-busca", perfil: "dono", caminho: "/app/admin",
    passo: naImpostos((page) => page.getByPlaceholder("Buscar item...").fill("Suco", { timeout: 3000 })) });
  telas.push({ nome: "app-admin-impostos-vazio", perfil: "dono", caminho: "/app/admin",
    passo: naImpostos((page) => page.getByPlaceholder("Buscar item...").fill("zzz", { timeout: 3000 })) });
  telas.push({ nome: "app-admin-impostos-erro", perfil: "dono", caminho: "/app/admin",
    preparar: (contexto) => contexto.route(/\/rest\/v1\/itens_fiscal/, (route) => route.fulfill({ status: 500, contentType: "application/json",
      headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ message: "falha simulada" }) })),
    passo: naImpostos() });
  telas.push({ nome: "app-admin-impostos-configurar", perfil: "dono", caminho: "/app/admin", passo: naImpostos(configurarPrimeiroPendente) });
  telas.push({ nome: "app-admin-impostos-icms", perfil: "dono", caminho: "/app/admin", passo: naImpostos(abaFiscal("ICMS")) });
  telas.push({ nome: "app-admin-impostos-pis", perfil: "dono", caminho: "/app/admin", passo: naImpostos(abaFiscal("PIS / COFINS / IPI")) });
  telas.push({ nome: "app-admin-impostos-reforma", perfil: "dono", caminho: "/app/admin", passo: naImpostos(abaFiscal("Reforma 2026")) });
  telas.push({ nome: "app-admin-impostos-editar", perfil: "dono", caminho: "/app/admin",
    passo: naImpostos((page) => page.getByRole("button", { name: "Editar", exact: true }).first().click({ timeout: 3000 })) });
  // Fase 5: Fichas Técnicas (lista, editor e confirmação de excluir).
  const abrirFichas = (page) => page.getByText("Ficha Técnica", { exact: true }).first().click({ timeout: 3000 });
  telas.push({ nome: "app-admin-fichas", perfil: "dono", caminho: "/app/admin", passo: abrirFichas });
  telas.push({
    nome: "app-admin-ficha-editar", perfil: "dono", caminho: "/app/admin",
    passo: async (page) => {
      await abrirFichas(page);
      await page.locator(".fichas-tab__card").first().locator("button").first().click({ timeout: 3000 });
    },
  });
  telas.push({
    nome: "app-admin-ficha-excluir", perfil: "dono", caminho: "/app/admin",
    passo: async (page) => {
      await abrirFichas(page);
      await page.locator(".fichas-tab__card").first().locator("button").nth(1).click({ timeout: 3000 });
    },
  });
  // Fase 5: Notas Fiscais, o assistente do XML (passos 2 a 4) e a nota manual.
  // O XML é mínimo: só o que o parseNFe lê. Um item tem nome de produto do
  // cardápio e outro não, para aparecerem o vinculado e o sem vínculo.
  const XML_NOTA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe35261112345678000199550010000012341000012345" versao="4.00">
<ide><serie>1</serie><nNF>1234</nNF><dhEmi>2026-11-18T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>12345678000199</CNPJ><xNome>Atacadão Demo Ltda</xNome></emit>
<det nItem="1"><prod><cProd>001</cProd><xProd>Suco de laranja</xProd><uCom>UN</uCom><qCom>12</qCom><vUnCom>4.50</vUnCom><vProd>54.00</vProd></prod></det>
<det nItem="2"><prod><cProd>002</cProd><xProd>Guardanapo de papel</xProd><uCom>PCT</uCom><qCom>5</qCom><vUnCom>3.20</vUnCom><vProd>16.00</vProd></prod></det>
<total><ICMSTot><vNF>70.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;
  const abrirNotasDeEntrada = (page) => page.getByText("Notas de Entrada", { exact: true }).first().click({ timeout: 3000 });
  const enviarXml = async (page) => {
    await abrirNotasDeEntrada(page);
    await page.getByRole("button", { name: /Importar XML/ }).first().click({ timeout: 3000 });
    await page.locator('input[type="file"]').setInputFiles({
      name: "nota-1234.xml", mimeType: "text/xml", buffer: Buffer.from(XML_NOTA),
    });
  };
  const irParaVincular = async (page) => {
    await enviarXml(page);
    await page.getByRole("button", { name: "Ignorar" }).click({ timeout: 3000 });
    await page.getByRole("button", { name: /Continuar/ }).click({ timeout: 3000 });
  };
  telas.push({ nome: "app-notas-xml-informacoes", perfil: "dono", caminho: "/app/admin", passo: enviarXml });
  telas.push({ nome: "app-notas-xml-vincular", perfil: "dono", caminho: "/app/admin", passo: irParaVincular });
  telas.push({
    nome: "app-notas-xml-previa", perfil: "dono", caminho: "/app/admin",
    passo: async (page) => {
      await irParaVincular(page);
      await page.getByRole("button", { name: /Ver Preview/ }).click({ timeout: 3000 });
    },
  });
  telas.push({
    nome: "app-notas-manual", perfil: "dono", caminho: "/app/admin",
    passo: async (page) => {
      await abrirNotasDeEntrada(page);
      await page.getByRole("button", { name: /Nova nota manual/ }).first().click({ timeout: 3000 });
    },
  });
  // Fase 5: estados das abas Usuários, Meios de Pagamento e Geral.
  const abrirAba = (aba) => (page) => page.getByRole("button", { name: aba, exact: true }).first().click({ timeout: 3000 });
  const naAba = (aba, passo) => async (page) => { await abrirAba(aba)(page); await passo(page); };
  telas.push({ nome: "app-configuracoes-usuarios-hover", perfil: "dono", caminho: "/app/configuracoes",
    passo: naAba("Usuários", (page) => page.locator(".usuarios-tab__tr", { hasText: "Bruno Demo" }).hover({ timeout: 3000 })) });
  telas.push({ nome: "app-configuracoes-usuarios-novo", perfil: "dono", caminho: "/app/configuracoes",
    passo: naAba("Usuários", (page) => page.getByRole("button", { name: "+ Novo Usuário" }).click({ timeout: 3000 })) });
  telas.push({ nome: "app-configuracoes-usuarios-editar", perfil: "dono", caminho: "/app/configuracoes",
    passo: naAba("Usuários", async (page) => {
      await page.locator(".usuarios-tab__tr", { hasText: "Bruno Demo" }).getByRole("button", { name: "Editar" }).click({ timeout: 3000 });
      await page.locator(".usuarios-tab__modal").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    }) });
  telas.push({ nome: "app-configuracoes-usuarios-excluir", perfil: "dono", caminho: "/app/configuracoes",
    passo: naAba("Usuários", (page) => page.locator(".usuarios-tab__tr", { hasText: "Bruno Demo" }).getByRole("button", { name: "Excluir" }).click({ timeout: 3000 })) });
  telas.push({ nome: "app-configuracoes-meios-novo", perfil: "dono", caminho: "/app/configuracoes",
    passo: naAba("Meios de Pagamento", async (page) => {
      await page.getByRole("button", { name: /Adicionar/ }).first().click({ timeout: 3000 });
      await page.getByPlaceholder("Nome da forma de pagamento...").fill("Vale refeição", { timeout: 3000 });
    }) });
  telas.push({ nome: "app-configuracoes-meios-nenhum", perfil: "dono", caminho: "/app/configuracoes",
    passo: naAba("Meios de Pagamento", async (page) => {
      for (const nome of ["Dinheiro", "Crédito", "Débito", "Pix"]) {
        await page.locator(".meios-pagamento-tab__metodo-card", { hasText: nome }).first().click({ timeout: 3000 });
      }
    }) });
  telas.push({ nome: "app-configuracoes-geral-alterado", perfil: "dono", caminho: "/app/configuracoes",
    passo: naAba("Geral", async (page) => {
      await page.locator(".geral-tab__input-dias").fill("0", { timeout: 3000 });
      await page.getByLabel("Limite de retirada sem autorização").fill("150", { timeout: 3000 });
    }) });
  // Fase 5: cadastro de mesas. As mesas falsas não têm posição (o mapa do PDV
  // as desenha em grade); estas telas as posicionam, como no salão de verdade.
  const comMesasPosicionadas = (semPosicaoNa6) => (contexto) => contexto.route(/\/rest\/v1\/mesas/, (route) => (route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        { numero: "1", capacidade: 4, posicao_x: 1, posicao_y: 1, status_manual: null },
        { numero: "2", capacidade: 2, posicao_x: 2, posicao_y: 1, status_manual: null },
        { numero: "3", capacidade: 4, posicao_x: 3, posicao_y: 1, status_manual: "reservada" },
        { numero: "4", capacidade: 6, posicao_x: 1, posicao_y: 2, status_manual: null },
        { numero: "5", capacidade: 4, posicao_x: 2, posicao_y: 2, status_manual: "manutencao" },
        semPosicaoNa6
          ? { numero: "6", capacidade: 8, posicao_x: null, posicao_y: null, status_manual: null }
          : { numero: "6", capacidade: 8, posicao_x: 4, posicao_y: 2, status_manual: null },
      ]) })
    : route.fallback()));
  telas.push({ nome: "app-pdv-mapa-posicionado", perfil: "dono", caminho: "/app/pdv",
    preparar: comMesasPosicionadas(true), passo: abaPdv("Mapa") });
  const naMesas = (passo) => naAba("Mesas", passo);
  const cardAdmin = (page, numero) => page.locator("[draggable]", { hasText: new RegExp(`^${numero}`) }).first();
  telas.push({ nome: "app-configuracoes-mesas-mapa", perfil: "dono", caminho: "/app/configuracoes",
    preparar: comMesasPosicionadas(false), passo: naMesas(() => {}) });
  telas.push({ nome: "app-configuracoes-mesas-hover", perfil: "dono", caminho: "/app/configuracoes",
    preparar: comMesasPosicionadas(false), passo: naMesas((page) => cardAdmin(page, 2).hover({ timeout: 3000 })) });
  telas.push({ nome: "app-configuracoes-mesas-planejar", perfil: "dono", caminho: "/app/configuracoes",
    preparar: comMesasPosicionadas(false), passo: naMesas((page) => page.locator("#mesas-preview-total").fill("9", { timeout: 3000 })) });
  telas.push({ nome: "app-configuracoes-mesas-arrastada", perfil: "dono", caminho: "/app/configuracoes",
    preparar: comMesasPosicionadas(false),
    passo: naMesas((page) => cardAdmin(page, 6).dragTo(page.getByLabel("Criar mesa na posição 3, 2"), { timeout: 3000 })) });
  telas.push({ nome: "app-configuracoes-mesas-nova", perfil: "dono", caminho: "/app/configuracoes",
    preparar: comMesasPosicionadas(false), passo: naMesas((page) => page.getByRole("button", { name: "Nova Mesa" }).click({ timeout: 3000 })) });
  telas.push({ nome: "app-configuracoes-mesas-repetida", perfil: "dono", caminho: "/app/configuracoes",
    preparar: comMesasPosicionadas(false), passo: naMesas(async (page) => {
      await page.getByRole("button", { name: "Nova Mesa" }).click({ timeout: 3000 });
      await page.getByPlaceholder("Ex: 1, 2, Varanda A…").fill("1", { timeout: 3000 });
      await page.getByRole("button", { name: "Criar mesa", exact: true }).click({ timeout: 3000 });
    }) });
  telas.push({ nome: "app-configuracoes-mesas-editar", perfil: "dono", caminho: "/app/configuracoes",
    preparar: comMesasPosicionadas(false), passo: naMesas(async (page) => {
      await cardAdmin(page, 2).hover({ timeout: 3000 });
      await page.getByTitle("Editar").click({ timeout: 3000 });
    }) });
  telas.push({ nome: "app-configuracoes-mesas-remover", perfil: "dono", caminho: "/app/configuracoes",
    preparar: comMesasPosicionadas(false), passo: naMesas(async (page) => {
      await cardAdmin(page, 2).hover({ timeout: 3000 });
      await page.getByTitle("Remover").click({ timeout: 3000 });
    }) });
  // Fase 5: Unidades de Medida (hover, adicionar, excluir), Radar com uma
  // categoria num grupo, Delivery com o horário automático e Usuários com a
  // força da senha e o erro de formulário.
  const naUnidades = (passo) => naAba("Unidades de Medida", passo);
  telas.push({ nome: "app-configuracoes-unidades-hover", perfil: "dono", caminho: "/app/configuracoes",
    passo: naUnidades((page) => page.locator(".unidades-medida-tab__btn-remover").first().hover({ timeout: 3000 })) });
  telas.push({ nome: "app-configuracoes-unidades-adicionar", perfil: "dono", caminho: "/app/configuracoes",
    passo: naUnidades(async (page) => {
      await page.getByPlaceholder("abrev.").first().fill("pct", { timeout: 3000 });
      await page.getByPlaceholder("Nome completo").first().fill("Pacote", { timeout: 3000 });
    }) });
  telas.push({ nome: "app-configuracoes-unidades-excluir", perfil: "dono", caminho: "/app/configuracoes",
    passo: naUnidades(async (page) => {
      await page.locator(".unidades-medida-tab__btn-remover").first().click({ timeout: 3000 });
      await page.waitForTimeout(400);
    }) });
  telas.push({ nome: "app-configuracoes-radar-grupo", perfil: "dono", caminho: "/app/configuracoes",
    passo: naAba("Radar de Oportunidades", (page) => page.locator(".categorias-grupo-tab__select-grupo").first().selectOption({ index: 1 }, { timeout: 3000 })) });
  telas.push({ nome: "app-configuracoes-delivery-automatico", perfil: "dono", caminho: "/app/configuracoes",
    passo: naAba("Delivery", (page) => page.getByLabel("Abrir e fechar o delivery automaticamente").click({ timeout: 3000 })) });
  telas.push({ nome: "app-configuracoes-usuarios-senha", perfil: "dono", caminho: "/app/configuracoes",
    passo: naAba("Usuários", async (page) => {
      await page.getByRole("button", { name: "+ Novo Usuário" }).click({ timeout: 3000 });
      await page.getByPlaceholder("••••••••").first().fill("abc123", { timeout: 3000 });
      await page.locator(".usuarios-tab__modal").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    }) });
  telas.push({ nome: "app-configuracoes-usuarios-erro", perfil: "dono", caminho: "/app/configuracoes",
    passo: naAba("Usuários", async (page) => {
      await page.getByRole("button", { name: "+ Novo Usuário" }).click({ timeout: 3000 });
      await page.getByRole("button", { name: "Criar Usuário" }).click({ timeout: 3000 });
      await page.locator(".usuarios-tab__modal").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    }) });
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
  // O site da Kora abre em `localhost` e as pautas em `pautas.localhost`. As
  // telas de sempre continuam em 127.0.0.1, que não é o domínio da plataforma.
  process.env.VITE_ROOT_DOMAIN = "localhost";
  process.env.VITE_PAUTAS_SUBDOMAIN = "pautas";
  const { createServer } = await import(join(RAIZ, "node_modules/vite/dist/node/index.js"));
  const servidor = await createServer({
    root: raizApp, configFile: join(raizApp, "vite.config.js"),
    // allowedHosts: telas com `host` próprio (subdomínio em *.localhost) chegam
    // ao mesmo servidor com outro nome.
    server: { port: 0, host: "127.0.0.1", allowedHosts: true }, logLevel: "error", clearScreen: false,
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
  // *.localhost sempre na própria máquina: as telas com `host` (subdomínio de
  // estabelecimento) chegam ao mesmo servidor de desenvolvimento.
  const navegador = await chromium.launch({ args: ["--host-resolver-rules=MAP *.localhost 127.0.0.1"] });
  mkdirSync(pasta, { recursive: true });
  const falhas = [];

  try {
    for (const [largura, opcoes] of Object.entries(LARGURAS)) {
      // SO_TELAS=<expressão regular> fotografa só as telas cujo nome casa, para
      // conferir telas novas do roteiro sem esperar a captura inteira.
      const filtro = process.env.SO_TELAS ? new RegExp(process.env.SO_TELAS) : null;
      for (const tela of roteiro(largura).filter((t) => !filtro || filtro.test(t.nome))) {
        const contexto = await navegador.newContext({
          ...opcoes, deviceScaleFactor: 1, locale: "pt-BR",
          timezoneId: "America/Sao_Paulo", reducedMotion: "reduce",
        });
        await contexto.clock.setFixedTime(AGORA);
        await instalarSupabaseFalso(contexto, origem);
        // TEMA_TENANT=<arquivo.json>: toda tela roda com um estabelecimento que
        // tem esse tema (e todos os módulos), para a prova do white-label.
        if (temaTenant) await instalarTemaTenant(contexto, temaTenant);
        // Rota própria da tela, registrada depois do falso para ter precedência.
        if (tela.preparar) await tela.preparar(contexto);
        if (tela.perfil) {
          const { chave, valor } = sessaoNoNavegador(tela.perfil);
          await contexto.addInitScript(([k, v]) => { globalThis.localStorage.setItem(k, v); }, [chave, valor]);
        }
        const page = await contexto.newPage();
        // `viewport`: a tela pede outra largura (ex.: computador estreito, que
        // troca a barra lateral pelo menu de gaveta).
        if (tela.viewport) await page.setViewportSize(tela.viewport);
        const arquivo = join(pasta, `${largura}--${tela.nome}.png`);
        try {
          // `host`: a tela abre por outro nome (ex.: subdomínio de estabelecimento).
          const base = tela.host ? origem.replace("127.0.0.1", tela.host) : origem;
          await page.goto(base + tela.caminho, { waitUntil: "networkidle", timeout: 30000 });
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
  let leves = 0;
  for (const nome of [...nomes].sort()) {
    const a = join(antes, nome);
    const b = join(depois, nome);
    if (!existsSync(a)) { console.log(`NOVA       ${nome}`); mudaram++; continue; }
    if (!existsSync(b)) { console.log(`SUMIU      ${nome}`); mudaram++; continue; }
    const r = diferencaEmPixels(a, b);
    if (r.tamanhoMudou) { console.log(`TAMANHO    ${nome} (${r.antes} para ${r.depois})`); mudaram++; }
    else if (r.percentual > 0.1) { console.log(`MUDOU      ${nome} (${r.percentual.toFixed(2)}% dos pixels)`); mudaram++; }
    // Abaixo de 0,1% a mudança não conta como diferença, mas aparece: um ícone
    // trocado ou uma borda de foco cabem aí, e a review precisa vê-los.
    else if (r.percentual > 0) { console.log(`LEVE       ${nome} (${r.percentual.toFixed(3)}% dos pixels)`); leves++; }
  }
  console.log(`\n${nomes.size} telas comparadas, ${mudaram} com diferença, ${leves} com mudança leve (abaixo de 0,1%).`);
  process.exitCode = mudaram ? 1 : 0;
}

// ── Prova do white-label (tarefa 5.y) ─────────────────────────────
// Com TEMA_TENANT, o estabelecimento das telas ganha o tema do arquivo. O
// comando `prova-tema` procura, nas fotos, pixels com as cores EXATAS do tema
// padrão (os valores --gm-* de src/styles/tema.css): se o tema do tenant troca
// todas, sobrar uma é cor cravada que o estabelecimento não consegue trocar.
const temaTenant = process.env.TEMA_TENANT ? JSON.parse(readFileSync(resolve(process.env.TEMA_TENANT), "utf8")) : null;

async function instalarTemaTenant(contexto, tema) {
  // `.single()`/`.maybeSingle()` pedem um objeto; o console da plataforma
  // lista os estabelecimentos e espera uma lista. Responde no formato pedido.
  const responder = (corpo) => (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const umSo = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    const linha = Array.isArray(corpo) || umSo ? corpo : [corpo];
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(linha) });
  };
  await contexto.route(/\/rest\/v1\/tenants/, responder({ id: "tenant-demo", nome: "Demo", slug: "demo", tema, plano_codigo: "completo", created_at: "2026-01-01T00:00:00.000Z" }));
  await contexto.route(/\/rest\/v1\/planos_modulos/, responder(
    ["cardapio", "pdv", "caixa", "estoque", "pedidos", "mesas_comandas", "cozinha", "alertas", "financeiro",
      "clientes", "relatorios", "jarvas", "multiloja", "fiscal_integracoes", "delivery"].map((modulo_codigo) => ({ modulo_codigo }))));
}

function coresPadraoDoTema() {
  const css = readFileSync(join(RAIZ, "src/styles/tema.css"), "utf8");
  const raiz = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  const cores = {};
  for (const [, nome, hex] of raiz.matchAll(/(--gm-[\w-]+):\s*#([0-9a-fA-F]{6})\s*;/g)) {
    cores[hex.toLowerCase()] = nome;
  }
  return cores;
}

function provaTema(pasta, minimo = 30) {
  const padrao = coresPadraoDoTema();
  let comResto = 0;
  for (const nome of readdirSync(pasta).filter((n) => n.endsWith(".png")).sort()) {
    const png = PNG.sync.read(readFileSync(join(pasta, nome)));
    const contagem = {};
    for (let i = 0; i < png.data.length; i += 4) {
      const hex = [png.data[i], png.data[i + 1], png.data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
      if (padrao[hex]) contagem[hex] = (contagem[hex] ?? 0) + 1;
    }
    const achados = Object.entries(contagem).filter(([, n]) => n >= minimo);
    if (achados.length) {
      comResto++;
      console.log(`${nome}: ${achados.map(([hex, n]) => `${padrao[hex]} #${hex} (${n} px)`).join(", ")}`);
    }
  }
  console.log(`\n${comResto} tela(s) com cor do tema padrão (mínimo de ${minimo} pixels).`);
  process.exitCode = comResto ? 1 : 0;
}

const [comando, ...resto] = process.argv.slice(2);
if (comando === "capturar" && resto[0]) {
  const i = resto.indexOf("--ref");
  await capturar(resolve(resto[0]), i >= 0 ? resto[i + 1] : null);
} else if (comando === "comparar" && resto[0] && resto[1]) {
  comparar(resolve(resto[0]), resolve(resto[1]));
} else if (comando === "prova-tema" && resto[0]) {
  provaTema(resolve(resto[0]));
} else {
  console.log("Uso:\n  node scripts/screenshots-refatoracao.mjs capturar <pasta> [--ref <commit>]\n" +
    "  node scripts/screenshots-refatoracao.mjs comparar <pastaAntes> <pastaDepois>");
  process.exitCode = 2;
}
