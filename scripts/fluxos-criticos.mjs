#!/usr/bin/env node
// Fluxos críticos rodando no navegador de verdade (fase F.3 do plano de refatoração).
//
// Cada fluxo abre o app no Chromium (Playwright), contra o mesmo Supabase falso do
// roteiro de fotos, e faz o caminho de quem usa o sistema: clica, digita, confirma.
// O Supabase falso não guarda nada, então a prova é dupla: a tela chega ao fim do
// caminho (o passo final aparece) e as gravações certas saem para o banco, com os
// dados certos. Banco de verdade não entra aqui de propósito: produção não é lugar
// de teste.
//
// Uso:
//   node scripts/fluxos-criticos.mjs            roda todos e confere
//   node scripts/fluxos-criticos.mjs --mostrar  imprime as gravações de cada fluxo
//   SO_FLUXOS=<regex> node scripts/fluxos-criticos.mjs

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { instalarSupabaseFalso, sessaoNoNavegador, URL_FALSA } from "./telas/supabaseFalso.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGORA = new Date("2026-11-20T18:00:00.000Z");
const LARGURAS = {
  computador: { viewport: { width: 1366, height: 768 } },
  celular: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
};
const mostrar = process.argv.includes("--mostrar");

const responderJson = (corpo) => (route) => route.fulfill({
  status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(corpo),
});
const soGet = (corpo) => (route) => (route.request().method() === "GET" ? responderJson(corpo)(route) : route.fallback());

const caixaFechado = (contexto) => contexto.route(/\/rest\/v1\/config\?.*caixa_aberto/, soGet([
  { key: "caixa_aberto", value: false }, { key: "meios_pagamento", value: ["dinheiro", "credito", "debito", "pix"] },
]));
const semComandas = (contexto) => contexto.route(/\/rest\/v1\/pending/, soGet([]));

// Confere que saiu pelo menos uma gravação para o alvo (tabela, "rpc/<função>" ou
// "funcao:<borda>"), e que o corpo de uma delas satisfaz `conferir`, se houver.
const grava = (alvo, conferir = () => true, descricao = "") => ({ gravacoes }) => {
  const doAlvo = gravacoes.filter((g) => g.alvo === alvo);
  if (!doAlvo.length) return `não gravou em ${alvo}`;
  if (!doAlvo.some((g) => conferir(g.corpo, g))) return `gravou em ${alvo}, mas sem ${descricao || "o dado esperado"}`;
  return null;
};
// Confere que um texto aparece na tela no fim do fluxo.
const mostra = (texto) => async ({ page }) => ((await page.getByText(texto).first().isVisible().catch(() => false)) ? null : `a tela não mostra "${texto}"`);

// Console com um estabelecimento no plano básico e dois planos no catálogo.
const consoleComUmEstabelecimento = async (contexto) => {
  await contexto.route(/\/rest\/v1\/tenants/, soGet([{ id: "tenant-loja", nome: "Loja Demo", plano_codigo: "basico", tema: {}, slug: "loja", created_at: "2026-01-01T00:00:00.000Z" }]));
  await contexto.route(/\/rest\/v1\/planos\?/, soGet([{ codigo: "basico", nome: "Básico", ordem: 1 }, { codigo: "completo", nome: "Completo", ordem: 2 }]));
  await contexto.route(/\/rest\/v1\/planos_modulos/, soGet([{ modulo_codigo: "pdv", plano_codigo: "basico" }, { modulo_codigo: "pdv", plano_codigo: "completo" }]));
  await contexto.route(/\/rest\/v1\/assinaturas/, soGet([]));
  // Como o banco: a função devolve a linha do estabelecimento já com o plano novo.
  await contexto.route(/\/rest\/v1\/rpc\/alterar_plano_tenant/, (route) => {
    const { p_plano_codigo: plano } = JSON.parse(route.request().postData() || "{}");
    return responderJson({ id: "tenant-loja", nome: "Loja Demo", plano_codigo: plano, tema: {}, slug: "loja", created_at: "2026-01-01T00:00:00.000Z" })(route);
  });
};

// Cardápio público aberto, com um produto, e as três funções do pedido respondendo como o banco.
const cardapioAberto = async (contexto) => {
  await contexto.route(/\/rest\/v1\/rpc\/cardapio_publico/, responderJson({
    aberto: true, pedido_minimo: 0, tempo_preparo_min: 40, combos: [],
    produtos: [{ produto_id: 7, nome: "Pizza Calabresa", preco: 25, categoria: "Pizzas", grupos: [] }],
  }));
  await contexto.route(/\/rest\/v1\/rpc\/calcular_taxa_entrega/, responderJson({ ok: true, taxa: 7.5 }));
  await contexto.route(/\/rest\/v1\/rpc\/criar_pedido_delivery/, responderJson({ ok: true, numero: "261120-001" }));
};
// Um pedido de delivery recém-chegado, esperando o aceite.
const pedidoRecebido = (contexto) => contexto.route(/\/rest\/v1\/delivery_pedidos/, soGet([{
  id: "ped-1", numero: "261120-001", cliente_nome: "Ana Cliente", cliente_telefone: "51999990000", cep: "90000000",
  bairro: "Centro", endereco: "Rua X, 10", complemento_endereco: null, subtotal: 25, taxa_entrega: 7.5, total: 32.5,
  forma_pagamento: "pix", troco_para: null, levar_maquininha: false, status: "recebido", pending_id: "p-del-1",
  created_at: "2026-11-20T17:50:00.000Z", updated_at: "2026-11-20T17:50:00.000Z",
}]));

// A função de borda do provisionamento responde como a de verdade.
const provisionamentoResponde = (contexto) => contexto.route(/\/functions\/v1\/provisionar-estabelecimento/, (route) =>
  (route.request().method() === "OPTIONS" ? route.fallback()
    : responderJson({ tenant_id: "t-novo", nome: "Bar do Zé", admin: { username: "barze" } })(route)));

const abrirComanda15 = (page) => page.locator("button.comanda-card", { hasText: "R$ 32.00" }).first().click({ timeout: 5000 });

const XML_NOTA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe35261112345678000199550010000012341000012345" versao="4.00">
<ide><serie>1</serie><nNF>1234</nNF><dhEmi>2026-11-18T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>12345678000199</CNPJ><xNome>Atacadão Demo Ltda</xNome></emit>
<det nItem="1"><prod><cProd>001</cProd><xProd>Suco de laranja</xProd><uCom>UN</uCom><qCom>12</qCom><vUnCom>4.50</vUnCom><vProd>54.00</vProd></prod></det>
<det nItem="2"><prod><cProd>002</cProd><xProd>Guardanapo de papel</xProd><uCom>PCT</uCom><qCom>5</qCom><vUnCom>3.20</vUnCom><vProd>16.00</vProd></prod></det>
<total><ICMSTot><vNF>70.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

const FLUXOS = [
  {
    nome: "caixa-abrir", largura: "computador", perfil: "dono", caminho: "/app/pdv", preparar: caixaFechado,
    passos: async (page) => {
      await page.getByRole("button", { name: /Abrir Caixa/ }).first().click({ timeout: 5000 });
      await page.getByPlaceholder("0,00").fill("150", { timeout: 5000 });
      await page.locator(".abertura-caixa__botao-confirmar").click({ timeout: 5000 });
    },
    espera: [
      grava("config", (c) => c?.key === "fundo_atual" && c.value === 150, "o fundo de R$ 150"),
      grava("config", (c) => c?.key === "caixa_aberto" && c.value === true, "o caixa aberto"),
    ],
  },
  {
    nome: "caixa-vender-dinheiro", largura: "computador", perfil: "dono", caminho: "/app/pdv",
    passos: async (page) => {
      await abrirComanda15(page);
      await page.getByRole("button", { name: /Finalizar Comanda/ }).first().click({ timeout: 5000 });
      await page.getByRole("button", { name: "Sim, finalizar" }).click({ timeout: 5000 });
      await page.locator(".checkout-view__metodo-card", { hasText: "Dinheiro" }).click({ timeout: 5000 });
      await page.locator(".checkout-view__troco-input").fill("50", { timeout: 5000 });
      await page.getByRole("button", { name: /Confirmar/ }).last().click({ timeout: 5000 });
    },
    espera: [
      grava("vendas", (c) => c?.total === 32 && c.comanda === "15", "a venda de R$ 32 da comanda 15"),
      grava("venda_pagamentos", (c) => Array.isArray(c) && c.some((p) => p.metodo === "dinheiro" && p.valor === 32), "o pagamento em dinheiro"),
      grava("lancamentos", (c) => c?.origem === "venda" && c.valor === 32, "a receita no financeiro"),
      ({ gravacoes }) => (gravacoes.filter((g) => g.alvo === "vendas").length === 1 ? null : "gravou a venda mais de uma vez"),
    ],
  },
  {
    nome: "caixa-fechar", largura: "computador", perfil: "dono", caminho: "/app/pdv", preparar: semComandas,
    passos: async (page) => {
      await page.getByRole("button", { name: /Fechar Caixa/ }).first().click({ timeout: 5000 });
      await page.locator(".fechamento-modal__btn-confirmar").click({ timeout: 5000 });
    },
    espera: [
      grava("fechamentos", (c) => typeof c?.data?.totalConferido === "number", "o total conferido"),
      grava("config", (c) => c?.key === "caixa_aberto" && c.value === false, "o caixa fechado"),
    ],
  },
  {
    nome: "unidade-excluir", largura: "computador", perfil: "dono", caminho: "/app/configuracoes",
    passos: async (page) => {
      await page.getByRole("button", { name: "Unidades de Medida", exact: true }).first().click({ timeout: 5000 });
      await page.locator(".unidades-medida-tab__btn-remover").first().click({ timeout: 5000 });
      await page.getByRole("button", { name: "Sim, excluir" }).click({ timeout: 5000 });
    },
    espera: [grava("rpc/excluir_unidade_medida", (c) => !!c?.p_unidade_id, "o id da unidade")],
  },
  {
    nome: "combo-salvar", largura: "computador", perfil: "dono", caminho: "/app/produtos",
    passos: async (page) => {
      await page.getByRole("button", { name: "Combos", exact: true }).click({ timeout: 5000 });
      await page.locator(".combos-view__card", { hasText: "Combo Lanche" }).getByTitle("Editar combo").click({ timeout: 5000 });
      await page.getByText("Batata frita").last().waitFor({ timeout: 5000 });
      await page.getByRole("button", { name: /^Salvar/ }).last().click({ timeout: 5000 });
    },
    espera: [grava("rpc/salvar_combo")],
  },
  {
    nome: "nota-importar", largura: "computador", perfil: "dono", caminho: "/app/admin",
    passos: async (page) => {
      await page.getByText("Notas de Entrada", { exact: true }).first().click({ timeout: 5000 });
      await page.getByRole("button", { name: /Importar XML/ }).first().click({ timeout: 5000 });
      await page.locator('input[type="file"]').setInputFiles({ name: "nota-1234.xml", mimeType: "text/xml", buffer: Buffer.from(XML_NOTA) });
      await page.getByRole("button", { name: "Ignorar" }).click({ timeout: 5000 });
      await page.getByRole("button", { name: /Continuar/ }).click({ timeout: 5000 });
      await page.getByRole("button", { name: /Ver Preview/ }).click({ timeout: 5000 });
      await page.getByRole("button", { name: /Confirmar Importação/ }).click({ timeout: 5000 });
    },
    espera: [grava("rpc/importar_nota_fiscal")],
  },
  {
    nome: "console-trocar-plano", largura: "computador", perfil: "plataforma", caminho: "/console", preparar: consoleComUmEstabelecimento,
    passos: async (page) => {
      await page.getByTitle("Trocar o plano deste estabelecimento").first().click({ timeout: 5000 });
      await page.locator("select").last().selectOption("completo", { timeout: 5000 });
      await page.getByRole("button", { name: "Salvar plano" }).click({ timeout: 5000 });
    },
    espera: [grava("rpc/alterar_plano_tenant", (c) => c?.p_tenant_id === "tenant-loja" && c.p_plano_codigo === "completo", "o estabelecimento e o plano novo")],
  },

  {
    nome: "palm-lancar-na-comanda", largura: "celular", perfil: "dono", caminho: "/palm",
    passos: async (page) => {
      await page.getByRole("button", { name: /Café expresso/ }).first().click({ timeout: 5000 });
      await page.getByRole("button", { name: "Abrir carrinho do pedido" }).click({ timeout: 5000 });
      await page.getByRole("button", { name: "Lançar pedido" }).click({ timeout: 5000 });
      const teclado = page.getByRole("group", { name: "Teclado numérico da comanda" });
      for (const d of "15") await teclado.getByRole("button", { name: d, exact: true }).click({ timeout: 5000 });
      await page.getByRole("button", { name: "Adicionar à Comanda" }).click({ timeout: 5000 });
    },
    espera: [grava("pending", (c, g) => g.metodo === "PATCH" && Array.isArray(c?.items) && c.items.some((i) => /Café expresso/.test(i.name ?? i.nome ?? "")), "o café na lista de itens da comanda")],
  },
  {
    // Sem internet no meio da venda: a venda fica guardada no aparelho e sobe
    // uma vez só quando a rede volta.
    nome: "offline-vender-e-subir", largura: "computador", perfil: "dono", caminho: "/app/pdv",
    passos: async (page) => {
      await page.context().setOffline(true);
      await page.evaluate(() => globalThis.dispatchEvent(new Event("offline")));
      await abrirComanda15(page);
      await page.getByRole("button", { name: /Finalizar Comanda/ }).first().click({ timeout: 5000 });
      await page.getByRole("button", { name: "Sim, finalizar" }).click({ timeout: 5000 });
      await page.locator(".checkout-view__metodo-card", { hasText: "Dinheiro" }).click({ timeout: 5000 });
      await page.locator(".checkout-view__troco-input").fill("50", { timeout: 5000 });
      await page.getByRole("button", { name: /Confirmar/ }).last().click({ timeout: 5000 });
      await page.waitForTimeout(1500);
      await page.context().setOffline(false);
      await page.evaluate(() => globalThis.dispatchEvent(new Event("online")));
      await page.waitForTimeout(6000);
    },
    espera: [
      grava("vendas", (c) => c?.total === 32, "a venda guardada sem internet"),
      ({ gravacoes }) => {
        const n = new Set(gravacoes.filter((g) => g.alvo === "vendas").map((g) => g.corpo?.id)).size;
        return n === 1 ? null : `a venda subiu ${n} vezes com ids diferentes`;
      },
    ],
  },
  {
    nome: "cardapio-publico-pedir", largura: "celular", perfil: null, caminho: "/cardapio?loja=demo", preparar: cardapioAberto,
    passos: async (page) => {
      await page.getByText("Pizza Calabresa").first().click({ timeout: 5000 });
      await page.getByRole("button", { name: /Adicionar/ }).last().click({ timeout: 5000 });
      await page.getByRole("button", { name: "Ver a sacola" }).click({ timeout: 5000 });
      await page.getByRole("button", { name: /Ir para a entrega/ }).click({ timeout: 5000 });
      await page.getByLabel("Seu nome").fill("Ana", { timeout: 5000 });
      await page.getByLabel("Endereço (rua, número)").fill("Rua X, 10", { timeout: 5000 });
      await page.getByLabel("CEP").fill("90000000", { timeout: 5000 });
      await page.waitForTimeout(1500);
      await page.getByRole("button", { name: "Ir para o pagamento" }).click({ timeout: 5000 });
      await page.getByText("Pix na entrega").click({ timeout: 5000 });
      await page.getByRole("button", { name: /Confirmar pedido/ }).click({ timeout: 5000 });
    },
    espera: [grava("rpc/criar_pedido_delivery", (c) => JSON.stringify(c ?? {}).includes("Rua X, 10"), "o endereço do cliente")],
  },
  {
    nome: "delivery-aceitar", largura: "computador", perfil: "dono", caminho: "/app/delivery", preparar: pedidoRecebido,
    passos: async (page) => {
      await page.getByRole("button", { name: /Pedidos/ }).first().click({ timeout: 5000 }).catch(() => {});
      await page.getByRole("button", { name: "Aceitar e preparar" }).first().click({ timeout: 5000 });
    },
    espera: [grava("delivery_pedidos", (c, g) => g.metodo === "PATCH" && c?.status === "em_preparo", "o status em preparo")],
  },
  {
    nome: "console-criar-estabelecimento", largura: "computador", perfil: "plataforma", caminho: "/console",
    preparar: async (contexto) => { await consoleComUmEstabelecimento(contexto); await provisionamentoResponde(contexto); },
    passos: async (page) => {
      await page.getByRole("button", { name: /Novo estabelecimento/ }).first().click({ timeout: 5000 });
      await page.getByLabel(/Nome do estabelecimento/i).fill("Bar do Zé", { timeout: 5000 });
      await page.getByLabel(/Nome do responsável/i).fill("José da Silva", { timeout: 5000 });
      await page.getByLabel(/Usuário de acesso/i).fill("barze", { timeout: 5000 });
      await page.getByLabel(/Senha provisória/i).fill("senha-forte-123", { timeout: 5000 });
      await page.getByLabel(/Mensalidade combinada/i).fill("300", { timeout: 5000 });
      await page.getByRole("button", { name: /Criar estabelecimento/ }).last().click({ timeout: 5000 });
    },
    espera: [grava("funcao:provisionar-estabelecimento", (c) => JSON.stringify(c ?? {}).includes("Bar do Zé"), "o nome do estabelecimento")],
  },
  {
    nome: "pdv-celular-vender", largura: "celular", perfil: "dono", caminho: "/palm",
    passos: async (page) => {
      await page.getByRole("tab", { name: /Mais$/ }).last().click({ timeout: 5000 });
      await page.getByRole("button", { name: /^PDV/ }).first().click({ timeout: 5000 });
      await page.locator(".pdv-modulo__produto").first().click({ timeout: 5000 });
      await page.getByRole("button", { name: /^Cobrar/ }).click({ timeout: 5000 });
      await page.getByRole("button", { name: /Dinheiro/ }).click({ timeout: 5000 });
      await page.getByLabel("Valor recebido em dinheiro").fill("20", { timeout: 5000 });
      await page.getByRole("button", { name: "Confirmar pagamento" }).click({ timeout: 5000 });
    },
    espera: [grava("vendas", (c) => c?.comanda === "Balcão", "a venda de balcão"), mostra("Pagamento registrado")],
  },
];

async function subirApp() {
  process.env.VITE_SUPABASE_URL = URL_FALSA;
  process.env.VITE_SUPABASE_ANON_KEY = "chave-anon-falsa";
  const { createServer } = await import(join(RAIZ, "node_modules/vite/dist/node/index.js"));
  const servidor = await createServer({
    root: RAIZ, configFile: join(RAIZ, "vite.config.js"),
    server: { port: 0, host: "127.0.0.1", allowedHosts: true }, logLevel: "error", clearScreen: false,
  });
  await servidor.listen();
  return { servidor, origem: `http://127.0.0.1:${servidor.httpServer.address().port}` };
}

function descreverGravacao(req) {
  const url = new URL(req.url());
  const alvo = url.pathname.replace("/rest/v1/", "").replace("/functions/v1/", "funcao:");
  let corpo = null;
  try { corpo = JSON.parse(req.postData() || "null"); } catch { corpo = req.postData(); }
  // Senha não vai para a saída, nem sendo de mentira.
  corpo = JSON.parse(JSON.stringify(corpo ?? null, (k, v) => (/senha|password/i.test(k) ? "***" : v)));
  return { metodo: req.method(), alvo, corpo };
}

async function rodar() {
  const { chromium } = createRequire(import.meta.url)("playwright");
  const { servidor, origem } = await subirApp();
  const navegador = await chromium.launch();
  const filtro = process.env.SO_FLUXOS ? new RegExp(process.env.SO_FLUXOS) : null;
  const resultados = [];
  try {
    for (const fluxo of FLUXOS.filter((f) => !filtro || filtro.test(f.nome))) {
      const contexto = await navegador.newContext({ ...LARGURAS[fluxo.largura], locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
      await contexto.clock.setFixedTime(AGORA);
      await instalarSupabaseFalso(contexto, origem);
      if (fluxo.preparar) await fluxo.preparar(contexto);
      if (fluxo.perfil) {
        const { chave, valor } = sessaoNoNavegador(fluxo.perfil);
        await contexto.addInitScript(([k, v]) => { globalThis.localStorage.setItem(k, v); }, [chave, valor]);
      }
      const page = await contexto.newPage();
      const gravacoes = [];
      page.on("request", (req) => {
        if (req.url().startsWith(URL_FALSA) && !["GET", "HEAD", "OPTIONS"].includes(req.method())) gravacoes.push(descreverGravacao(req));
      });
      const erros = [];
      page.on("pageerror", (e) => erros.push(e.message.split("\n")[0]));
      let falha = null;
      try {
        await page.goto(origem + fluxo.caminho, { waitUntil: "networkidle", timeout: 30000 });
        await fluxo.passos(page);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(800);
        for (const conferir of fluxo.espera) {
          const msg = await conferir({ page, gravacoes });
          if (msg) { falha = msg; break; }
        }
      } catch (e) {
        falha = e.message.split("\n")[0];
      }
      if (erros.length && !falha) falha = `erro na página: ${erros[0]}`;
      if (falha && process.env.FOTOS_FALHA) await page.screenshot({ path: join(process.env.FOTOS_FALHA, `${fluxo.largura}--${fluxo.nome}.png`), fullPage: true }).catch(() => {});
      resultados.push({ nome: `${fluxo.largura}--${fluxo.nome}`, falha });
      if (mostrar) {
        console.log(`\n== ${fluxo.largura}--${fluxo.nome}${falha ? ` (FALHOU: ${falha})` : ""}`);
        for (const g of gravacoes) console.log(`   ${g.metodo} ${g.alvo} ${JSON.stringify(g.corpo)?.slice(0, 300)}`);
      }
      await contexto.close();
    }
  } finally {
    await navegador.close();
    await servidor.close();
  }
  console.log("");
  for (const r of resultados) console.log(`${r.falha ? "FALHOU" : "OK    "} ${r.nome}${r.falha ? `: ${r.falha}` : ""}`);
  const falhas = resultados.filter((r) => r.falha).length;
  console.log(`\n${resultados.length} fluxos, ${falhas} com falha.`);
  process.exit(falhas ? 1 : 0);
}

rodar();
