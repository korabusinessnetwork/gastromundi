// ──────────────────────────────────────────────────────────────────
// Delivery — camada de acesso do PAINEL DO DONO (admin autenticado)
//
// Diferente da vitrine pública (src/lib/delivery.js, que só fala com as
// 3 RPCs por slug): aqui o admin autenticado lê/escreve as tabelas do
// delivery DIRETO pelo client normal. A RLS RESTRICTIVE
// (tenant_id = tenant_atual_id()) da migration 20260804 garante o
// isolamento — cada tenant só enxerga o próprio delivery.
//
// produto_delivery é uma CAMADA sobre products (foto/descrição/ordem/
// disponibilidade no delivery), não um catálogo à parte. Por isso a
// "importação" (addon) é só criar a linha de produto_delivery para cada
// produto do PDV que ainda não está publicado no delivery — o produto
// em si continua vindo de products.
//
// tenant_id nos inserts: produto_delivery / grupos_complemento /
// complementos têm DEFAULT tenant_atual_id() (não precisa passar).
// config_delivery.tenant_id é a PK sem default → passar explícito.
//
// Funções puras (importação, faixas de taxa, sanitização) nascem com
// teste (deliveryAdmin.test.js) — dinheiro/regra do negócio.
// ──────────────────────────────────────────────────────────────────
//
// Regras e acesso a dados da administração do delivery. Desde a refatoração 3 cada
// assunto mora num arquivo de src/lib/deliveryAdmin/; este arquivo só reexporta, para
// nenhum import de fora precisar mudar.
export { produtoPublicavelNoDelivery, produtosParaImportar, filtrarProdutos, alternarProdutoId, filtrarItensDelivery, normalizarFaixaTaxa, validarFaixa, faixaResumo, sanitizarConfig, distanciaKm, selecionarFaixaKm, temFaixasKm, subgrupoCriaCiclo, formatarCep, formatarReais, formatarKm } from "./deliveryAdmin/regras";
export { carregarConfigDelivery, salvarConfigDelivery, listarProdutosDelivery, salvarProdutoDelivery, removerProdutoDelivery, importarProdutosDelivery, listarBibliotecaGrupos, vincularGrupoProduto, desvincularGrupoProduto, vincularSubgrupo, desvincularSubgrupo, reordenarSubgrupos, reordenarComplementos, reordenarGrupos, listarGruposComplemento, salvarGrupoComplemento, removerGrupoComplemento, salvarComplemento, removerComplemento } from "./deliveryAdmin/dados";
