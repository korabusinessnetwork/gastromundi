// ──────────────────────────────────────────────────────────────────
// Delivery — camada de acesso da vitrine pública (anon, por slug)
//
// A vitrine NUNCA toca tabela: fala só com as 3 RPCs SECURITY DEFINER
// (migration 20260804_delivery_fundacao.sql), resolvidas pelo slug do
// subdomínio. Preço e taxa são SEMPRE recalculados no servidor — o que
// esta camada calcula no cliente é só para MOSTRAR (subtotal, troco);
// o valor que vale é o que a RPC devolve/grava.
//
// Funções puras (carrinho, CEP, payload) nascem com teste (delivery.test.js).
// ──────────────────────────────────────────────────────────────────
//
// Regras do cardápio público de delivery. Desde a refatoração 3 cada assunto mora num
// arquivo de `regras/` ou `dados/` desta pasta; este arquivo só reexporta, para nenhum import de fora
// precisar mudar.
export { apenasDigitosCep, formatarCep, cepCompleto, formatarPreco, valorDigitado, somaComplementos, precoUnitario, precoLinha, calcularSubtotal, totalItens, calcularTroco, grupoSatisfeito, achatarGrupos, grupoArvoreSatisfeita, produtoPodeAdicionar, grupoImpossivel, produtoImpossivel, rotuloRegraGrupo, primeiroGrupoPendente, revisarSacola, combinaComBusca, dataNascimentoUtil, montarDataISO, precoDosComplementos, rotuloProgressoGrupo, separarDataISO, unidadesDoGrupo } from "./regras/carrinho";
export { montarPayloadPedido, carregarCardapio, calcularTaxaEntrega, mensagemDeErroDoPedido, enviarPedido, complementosDoPayload, juntarRuaNumero, meusPedidos, separarRuaNumero } from "./dados/pedido";
export { buscarEnderecoViaCep, geocodificarEndereco, sugerirEnderecos, consultasDeGeocodificacao, localizarEndereco } from "./regras/enderecos";
