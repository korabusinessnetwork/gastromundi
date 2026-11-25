// Supabase falso para o roteiro de telas da refatoração (fase 0.1 do plano).
//
// O roteiro precisa abrir o app de verdade, mas nunca contra o banco de
// produção: lá estão dados de clientes, e uma foto de tela com eles não pode
// parar no repositório. Então o Playwright intercepta tudo o que iria para o
// Supabase e responde daqui, com um estabelecimento de demonstração fixo.
//
// O que NÃO é objetivo: imitar o PostgREST inteiro. Só `eq.` e `in.` são
// filtrados, porque são os únicos que mudam o que a carga inicial recebe;
// ordenação, limite e colunas são ignorados. Tabela sem fixture responde lista
// vazia, e RPC sem fixture responde `null`. O roteiro compara a tela contra
// ela mesma em outro commit, então o que importa é ser igual nas duas pontas,
// não ser realista.

export const HOST_FALSO = "supabase.falso.invalid";
export const URL_FALSA = `http://${HOST_FALSO}`;

const AUTH_DONO = "00000000-0000-4000-8000-000000000001";
const AUTH_PLATAFORMA = "00000000-0000-4000-8000-000000000009";

const usuarios = [
  { id: 1, name: "Ana Demo", username: "ana", role: "admin", active: true, auth_id: AUTH_DONO, permissions: null },
  { id: 2, name: "Bruno Demo", username: "bruno", role: "garcom", active: true, auth_id: "00000000-0000-4000-8000-000000000002", permissions: null },
  { id: 3, name: "Carla Demo", username: "carla", role: "caixa", active: true, auth_id: "00000000-0000-4000-8000-000000000003", permissions: null },
  { id: 9, name: "Plataforma Demo", username: "plataforma", role: "plataforma", active: true, auth_id: AUTH_PLATAFORMA, permissions: null },
];

function produto(id, name, price, category, emoji) {
  return {
    id, name, price, category, emoji, active: true,
    unidades_compra: [], unidade_estoque: "un", unidade_consumo: null,
    fator_consumo_estoque: 1, produzivel: true, validade_dias: null,
    proxima_validade: null, codigo_barras: null,
  };
}

const produtos = [
  produto(1, "Café expresso", 6, "Bebidas", "☕"),
  // Fase 5: compra em caixa com 12 unidades, para a entrada do Estoque converter.
  { ...produto(2, "Suco de laranja", 9.5, "Bebidas", "🍊"), unidades_compra: [{ unidade: "CX", fator: 12, detalhamento: "" }] },
  produto(3, "Água sem gás", 4, "Bebidas", "💧"),
  produto(4, "Pão de queijo", 5.5, "Lanches", "🧀"),
  produto(5, "Misto quente", 14, "Lanches", "🥪"),
  produto(6, "Coxinha", 8, "Lanches", "🍗"),
  produto(7, "Bolo de cenoura", 9, "Sobremesas", "🍰"),
  produto(8, "Brigadeiro", 4.5, "Sobremesas", "🍫"),
];

const CRIADO_EM = "2026-11-20T14:30:00.000Z";

const tabelas = {
  users: usuarios,
  products: produtos,
  // Fase 5: saldos que desenham as quatro situações do Estoque. Água zerada,
  // Coxinha abaixo do mínimo, Brigadeiro sem linha (não controla), o resto OK.
  estoque: produtos.filter((p) => p.id !== 8).map((p) => ({
    produto_id: p.id, quantidade: p.id === 3 ? 0 : p.id === 6 ? 3 : 20 + p.id, minimo: 5,
  })),
  pending: [
    {
      id: "demo-comanda-12", comanda: "12", status: "open", note: null,
      items: [
        { id: 1, name: "Café expresso", price: 6, qty: 2, category: "Bebidas" },
        { id: 4, name: "Pão de queijo", price: 5.5, qty: 3, category: "Lanches" },
      ],
      total: 28.5, garcom: "Bruno Demo", created_by: "Bruno Demo",
      created_at: CRIADO_EM, updated_at: CRIADO_EM, mesa: null, apelido: null,
    },
    // Fase 5: a comanda que o carrinho do PDV e a finalização desenham com os
    // estados que o estilo precisa cobrir (emoji, observação, item cancelado).
    {
      id: "demo-comanda-15", comanda: "15", status: "open", note: null,
      items: [
        { uid: "c15-1", id: 5, name: "Misto quente", price: 14, qty: 1, category: "Lanches", emoji: "🥪", obs: ["sem tomate"] },
        { uid: "c15-2", id: 2, name: "Suco de laranja", price: 9, qty: 2, category: "Bebidas", emoji: "🍊" },
        { uid: "c15-3", id: 6, name: "Coxinha", price: 8, qty: 1, category: "Lanches", emoji: "🍗",
          cancelado: true, motivoCancelamento: "cliente desistiu" },
      ],
      total: 32, garcom: "Bruno Demo", created_by: "Bruno Demo",
      created_at: CRIADO_EM, updated_at: CRIADO_EM, mesa: "4", apelido: null,
    },
    // Fase 5, grade de comandas: os estados que o cartão desenha. O relógio do
    // roteiro está em 2026-11-20T18:00Z (15h em Brasília).
    // Esquecida: aberta há 10h e sem nenhum item.
    {
      id: "demo-comanda-3", comanda: "3", status: "open", note: null, items: [],
      total: 0, garcom: "Bruno Demo", created_by: "Bruno Demo",
      created_at: "2026-11-20T08:00:00.000Z", updated_at: "2026-11-20T08:00:00.000Z", mesa: null, apelido: null,
    },
    // Em uso por outra pessoa, aberta há 45 minutos (tempo em alerta).
    {
      id: "demo-comanda-7", comanda: "7", status: "open", note: null,
      items: [{ id: 1, name: "Café expresso", price: 6, qty: 1, category: "Bebidas" }],
      total: 6, garcom: "Carla Demo", created_by: "Carla Demo",
      created_at: "2026-11-20T17:15:00.000Z", updated_at: "2026-11-20T17:15:00.000Z", mesa: null, apelido: null,
      editando_por: "carla", editando_nome: "Carla Demo", editando_desde: "2026-11-20T17:59:00.000Z",
    },
    // Só apelido, aberta há 10 minutos.
    {
      id: "demo-comanda-20", comanda: "20", status: "open", note: null,
      items: [{ id: 8, name: "Brigadeiro", price: 4.5, qty: 4, category: "Sobremesas" }],
      total: 18, garcom: "Bruno Demo", created_by: "Bruno Demo",
      created_at: "2026-11-20T17:50:00.000Z", updated_at: "2026-11-20T17:50:00.000Z", mesa: null, apelido: "Aniversário",
    },
    // Aberta agora, sem garçom nem itens.
    {
      id: "demo-comanda-21", comanda: "21", status: "open", note: null, items: [],
      total: 0, garcom: null, created_by: "Ana Demo",
      created_at: "2026-11-20T17:59:40.000Z", updated_at: "2026-11-20T17:59:40.000Z", mesa: null, apelido: null,
    },
  ],
  config: [
    { key: "caixa_aberto", value: true },
    { key: "fundo_atual", value: 100 },
    { key: "sessao_aberta_em", value: "2026-11-20T11:00:00.000Z" },
    { key: "meios_pagamento", value: ["dinheiro", "credito", "debito", "pix"] },
    // Fase 5: uma ficha técnica para a tela de Fichas Técnicas e o editor dela
    // (um ingrediente ligado a produto e um digitado à mão).
    { key: "fichas_tecnicas", value: [{
      id: "ficha-misto", produtoId: 5, nome: "", categoria: "Lanches", rendimento: "1",
      preparo: "Montar o pão com presunto e queijo e tostar na chapa.",
      ingredientes: [
        { produtoId: 4, nome: "Pão de queijo", emoji: "🧀", qtd: "1", unidade: "un", custoUnit: "1.20" },
        { produtoId: null, nome: "Presunto fatiado", emoji: "", qtd: "50", unidade: "g", custoUnit: "0.06" },
      ],
    }] },
  ],
  // Fase 5: vendas fechadas para a aba Vendas do relatório desenhar os três
  // modos (resumido, detalhado, por dia), com um pagamento dividido e uma
  // venda de ontem. O relógio do roteiro está em 20/11/2026 às 15h.
  vendas: [
    { id: "venda-1", comanda: "8", mesa: null, subtotal: 25, taxa_servico: false, valor_taxa: 0,
      valor_ajuste: 0, total: 25, cashier: "Ana Demo", at: "2026-11-20T13:10:00.000Z", cancelada: false },
    { id: "venda-2", comanda: "9", mesa: "2", subtotal: 42.5, taxa_servico: false, valor_taxa: 0,
      valor_ajuste: 0, total: 42.5, cashier: "Carla Demo", at: "2026-11-20T15:40:00.000Z", cancelada: false },
    { id: "venda-3", comanda: "5", mesa: null, subtotal: 18, taxa_servico: false, valor_taxa: 0,
      valor_ajuste: 0, total: 18, cashier: "Ana Demo", at: "2026-11-19T19:20:00.000Z", cancelada: false },
  ],
  venda_itens: [
    { venda_id: "venda-1", product_id: 5, nome: "Misto quente", preco: 14, qtd: 1, cancelado: false },
    { venda_id: "venda-1", product_id: 1, nome: "Café expresso", preco: 5.5, qtd: 2, cancelado: false },
    { venda_id: "venda-2", product_id: 7, nome: "Bolo de cenoura", preco: 9, qtd: 2, cancelado: false },
    { venda_id: "venda-2", product_id: 2, nome: "Suco de laranja", preco: 9.5, qtd: 1, cancelado: false },
    { venda_id: "venda-2", product_id: 6, nome: "Coxinha", preco: 8, qtd: 1, cancelado: false },
    { venda_id: "venda-2", product_id: 1, nome: "Café expresso", preco: 7, qtd: 1, cancelado: false },
    { venda_id: "venda-3", product_id: 4, nome: "Pão de queijo", preco: 5.5, qtd: 2, cancelado: false },
    { venda_id: "venda-3", product_id: 3, nome: "Água sem gás", preco: 7, qtd: 1, cancelado: false },
  ],
  venda_pagamentos: [
    { venda_id: "venda-1", metodo: "pix", valor: 25 },
    { venda_id: "venda-2", metodo: "dinheiro", valor: 20 },
    { venda_id: "venda-2", metodo: "credito", valor: 22.5 },
    { venda_id: "venda-3", metodo: "debito", valor: 18 },
  ],
  // Fase 5: subprodutos (o saldo vem embutido, como o PostgREST devolve o
  // relacionamento), um deles usado num combo, para a exclusão travar.
  subprodutos: [
    { id: "sub-1", nome: "Batata frita", categoria: "Acompanhamentos", preco: 12, unidade_medida: "Porção",
      controla_estoque: true, ativo: true, estoque_subprodutos: [{ quantidade: 30, minimo: 5 }] },
    { id: "sub-2", nome: "Molho especial", categoria: "Molhos", preco: 3, unidade_medida: "Unidade",
      controla_estoque: true, ativo: true, estoque_subprodutos: [{ quantidade: 2, minimo: 5 }] },
    { id: "sub-3", nome: "Refrigerante lata", categoria: "Bebidas", preco: 6, unidade_medida: "Unidade",
      controla_estoque: false, ativo: false, estoque_subprodutos: [] },
  ],
  // Fase 5: combos. A lista lê a composição resumida embutida; a janela de
  // edição lê as tabelas de composição filtradas por combo_id.
  combos: [
    { id: "combo-1", nome: "Combo Lanche", item_principal_id: 5, modo: "combo", preco_total: 28, ativo: true,
      created_at: "2026-11-19T12:00:00.000Z",
      combo_subprodutos: [{ quantidade: 1, subprodutos: { nome: "Batata frita", preco: 12 } }],
      combo_produtos: [{ quantidade: 1, products: { name: "Suco de laranja" } }] },
    { id: "combo-2", nome: "Café com pão de queijo", item_principal_id: 1, modo: "substituir", preco_total: 10, ativo: false,
      created_at: "2026-11-18T12:00:00.000Z", combo_subprodutos: [], combo_produtos: [] },
  ],
  combo_subprodutos: [{ id: "cs-1", combo_id: "combo-1", subproduto_id: "sub-1", quantidade: 1, preco_customizado: null,
    subprodutos: { id: "sub-1", nome: "Batata frita", categoria: "Acompanhamentos", preco: 12, unidade_medida: "Porção",
      controla_estoque: true, ativo: true } }],
  combo_produtos: [{ id: "cp-1", combo_id: "combo-1", product_id: 2, quantidade: 1, preco_customizado: 8,
    products: { id: 2, name: "Suco de laranja", price: 9.5, emoji: "🍊", category: "Bebidas" } }],
  grupos_categoria: [
    { id: 1, nome: "comida" }, { id: 2, nome: "bebida" },
  ],
  categoria_grupo: [
    { category: "Bebidas", grupo_id: 2 }, { category: "Lanches", grupo_id: 1 },
  ],
  // Fase 5: com o tipo, para a janela de produto desenhar os três blocos
  // (estoque, compra, consumo).
  unidades_medida: [
    { id: 1, abreviacao: "un", nome: "Unidade", tipo: "estoque" },
    { id: 2, abreviacao: "kg", nome: "Quilo", tipo: "estoque" },
    { id: 3, abreviacao: "CX", nome: "Caixa", tipo: "compra" },
    { id: 4, abreviacao: "PCT", nome: "Pacote", tipo: "compra" },
    { id: 5, abreviacao: "copo", nome: "Copo", tipo: "consumo" },
  ],
};

// Fase 5: resposta da RPC relatorio_vendas para o relatório de Desempenho.
const RELATORIO_ATUAL = {
  faturamento: 485.5, numero_vendas: 24,
  por_dia: [
    { dia: "2026-11-14", total: 52 }, { dia: "2026-11-15", total: 88.5 },
    { dia: "2026-11-16", total: 31 }, { dia: "2026-11-17", total: 74 },
    { dia: "2026-11-18", total: 96 }, { dia: "2026-11-19", total: 76.5 },
    { dia: "2026-11-20", total: 67.5 },
  ],
  por_metodo: [
    { metodo: "pix", total: 210 }, { metodo: "credito", total: 145.5 },
    { metodo: "dinheiro", total: 80 }, { metodo: "debito", total: 50 },
  ],
  top_produtos: [
    { produto_id: 5, nome: "Misto quente", unidades: 14, receita: 196 },
    { produto_id: 2, nome: "Suco de laranja", unidades: 12, receita: 114 },
    { produto_id: 1, nome: "Café expresso", unidades: 18, receita: 108 },
  ],
};
const RELATORIO_ANTERIOR = { ...RELATORIO_ATUAL, faturamento: 400, numero_vendas: 30 };

// JWT só no formato: o supabase-js lê, mas ninguém confere a assinatura.
function jwtFalso(authId, extra = {}) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub: authId, role: "authenticated", exp: 4102444800, ...extra,
  })}.assinatura-falsa`;
}

function usuarioAuth(authId) {
  return {
    id: authId, aud: "authenticated", role: "authenticated",
    email: `${authId}@demo.invalid`, app_metadata: { provider: "email" },
    user_metadata: {}, created_at: CRIADO_EM,
  };
}

// Sessão que o supabase-js guarda no localStorage. A chave é derivada do
// primeiro rótulo do host da URL (`sb-<rótulo>-auth-token`).
export function sessaoNoNavegador(perfil) {
  const authId = perfil === "plataforma" ? AUTH_PLATAFORMA : AUTH_DONO;
  const chave = `sb-${HOST_FALSO.split(".")[0]}-auth-token`;
  const valor = {
    access_token: jwtFalso(authId), refresh_token: "refresh-falso",
    token_type: "bearer", expires_in: 3600, expires_at: 4102444800,
    user: usuarioAuth(authId),
  };
  return { chave, valor: JSON.stringify(valor) };
}

function filtrar(linhas, params) {
  let resultado = linhas;
  for (const [coluna, expressao] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(coluna)) continue;
    if (expressao.startsWith("eq.")) {
      const alvo = expressao.slice(3);
      resultado = resultado.filter((l) => coluna in l && String(l[coluna]) === alvo);
    } else if (expressao.startsWith("in.(")) {
      const alvos = expressao.slice(4, -1).split(",").map((v) => v.replace(/^"|"$/g, ""));
      resultado = resultado.filter((l) => coluna in l && alvos.includes(String(l[coluna])));
    }
  }
  return resultado;
}

function json(route, status, corpo, headers = {}) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", ...headers },
    body: corpo === undefined ? "" : JSON.stringify(corpo),
  });
}

async function responder(route) {
  const req = route.request();
  const url = new URL(req.url());
  const metodo = req.method();

  if (metodo === "OPTIONS") {
    return route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      },
    });
  }

  if (url.pathname.startsWith("/auth/v1/user")) {
    const token = (req.headers().authorization ?? "").replace("Bearer ", "");
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "e30", "base64url").toString() || "{}");
    return json(route, 200, usuarioAuth(payload.sub ?? AUTH_DONO));
  }
  if (url.pathname.startsWith("/auth/v1/")) return json(route, 200, {});
  if (url.pathname.startsWith("/functions/v1/")) return json(route, 200, {});
  if (url.pathname.startsWith("/storage/v1/")) return json(route, 404, { message: "não existe no roteiro" });

  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const funcao = url.pathname.slice("/rest/v1/rpc/".length);
    if (funcao === "relatorio_vendas") {
      // Período que termina a partir de 20/11 é o "atual"; o resto é a janela
      // de comparação, com faturamento menor e mais vendas, para o Desempenho
      // desenhar uma variação positiva e uma negativa.
      const { p_fim: fim } = JSON.parse(req.postData() || "{}");
      return json(route, 200, fim >= "2026-11-20" ? RELATORIO_ATUAL : RELATORIO_ANTERIOR);
    }
    // Senha de gerente da demonstração: "1234".
    if (funcao === "verificar_senha_admin") {
      const { p_password: senha } = JSON.parse(req.postData() || "{}");
      return json(route, 200, senha === "1234");
    }
    return json(route, 200, null);
  }

  if (url.pathname.startsWith("/rest/v1/")) {
    const tabela = url.pathname.slice("/rest/v1/".length);
    // Escrita não persiste: o roteiro só fotografa. Mas o UPDATE que pede a
    // representação de volta (`Prefer: return=representation`, como a trava da
    // comanda) recebe as linhas com a mudança aplicada, igual ao banco: com a
    // lista vazia, o PDV lia "a trava é de outra pessoa" e não abria comanda.
    if (metodo !== "GET" && metodo !== "HEAD") {
      const querDeVolta = (req.headers().prefer ?? "").includes("return=representation");
      if (metodo === "PATCH" && querDeVolta) {
        const mudanca = JSON.parse(req.postData() || "{}");
        return json(route, 200, filtrar(tabelas[tabela] ?? [], url.searchParams).map((l) => ({ ...l, ...mudanca })));
      }
      return json(route, 201, []);
    }
    const linhas = filtrar(tabelas[tabela] ?? [], url.searchParams);
    const umaLinha = (req.headers().accept ?? "").includes("vnd.pgrst.object");
    const intervalo = { "content-range": linhas.length ? `0-${linhas.length - 1}/${linhas.length}` : "*/0" };
    if (umaLinha) {
      if (linhas.length !== 1) {
        return json(route, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      }
      return json(route, 200, linhas[0], intervalo);
    }
    return json(route, 200, linhas, intervalo);
  }

  return json(route, 404, {});
}

// Liga o Supabase falso num contexto do Playwright. Tudo que não for o app
// local nem o Supabase falso é abortado (fontes e CDNs externos), senão a foto
// dependeria da internet do momento.
export async function instalarSupabaseFalso(contexto, origemApp) {
  await contexto.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(URL_FALSA)) return responder(route);
    if (url.startsWith(origemApp) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    return route.abort();
  });
  // Realtime: o canal abre e fica mudo, como um estabelecimento sem movimento.
  await contexto.routeWebSocket(/supabase\.falso\.invalid/, () => {});
}
