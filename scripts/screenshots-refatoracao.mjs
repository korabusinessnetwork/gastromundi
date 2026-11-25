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
        // Rota própria da tela, registrada depois do falso para ter precedência.
        if (tela.preparar) await tela.preparar(contexto);
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
