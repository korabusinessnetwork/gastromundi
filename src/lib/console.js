// Regras e acesso a dados do Console da plataforma. Desde a refatoração 3 cada assunto
// mora num arquivo de src/lib/console/; este arquivo só reexporta, para nenhum import
// de fora (nem os testes que substituem "@/lib/console") precisar mudar.
export { listarEstabelecimentos, listarPlanos, listarAssinaturas } from "./console/leitura";
export { ordenarPorUrgencia, filtrarEstabelecimentos, FILTROS_SITUACAO, filtrarPorSituacao, normalizarFiltroSituacao, ABAS_CONSOLE, normalizarAba, PERIODO_PADRAO, normalizarPeriodo, filtrarPorPlano, normalizarFiltroPlano, contarPorPlano } from "./console/lista";
export { resumirPlataforma, PERIODOS_ANALYTICS, listarAnalitico, diasDesde, resumirUso, listarSaude, resumirSaude } from "./console/paineis";
export { normalizarUsername, MAX_USERNAME, MIN_USERNAME, usernameSugeridoDoNome, sugerirUsuarioLivre, validarNovoEstabelecimento, cadastroTemDados, gerarSenhaProvisoria, forcaDaSenha, MAX_SLUG, SLUGS_RESERVADOS, normalizarSlug, sugerirSlugLivre } from "./console/cadastro";
export { mensagemDeErroDoConsole, traduzirErroProvisionamento } from "./console/erros";
export { provisionarEstabelecimento, alterarPlano, compararModulosDoPlano, alterarLayout, MENSALIDADE_MAXIMA, definirMensalidade, listarAddons, listarAddonsPorTenant, alternarAddon, resumirAddonsDoTenant, contarAddonsPorTenant } from "./console/gravacoes";
export { montarMensagemPrimeiroAcesso, listarSolicitacoes, decidirSolicitacao, pendentesPrimeiro, resumirPlanoSolicitado } from "./console/solicitacoes";
