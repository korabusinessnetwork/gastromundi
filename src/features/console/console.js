// Regras e acesso a dados do Console da plataforma. Desde a refatoração 3 cada assunto
// mora num arquivo de `regras/` ou `dados/` desta pasta; este arquivo só reexporta, para nenhum import
// de fora (nem os testes que substituem "@/lib/console") precisar mudar.
export { listarEstabelecimentos, listarPlanos, listarAssinaturas } from "./dados/leitura";
export { ordenarPorUrgencia, filtrarEstabelecimentos, FILTROS_SITUACAO, filtrarPorSituacao, normalizarFiltroSituacao, ABAS_CONSOLE, normalizarAba, PERIODO_PADRAO, normalizarPeriodo, filtrarPorPlano, normalizarFiltroPlano, contarPorPlano } from "./regras/lista";
export { resumirPlataforma, PERIODOS_ANALYTICS, listarAnalitico, diasDesde, resumirUso, listarSaude, resumirSaude } from "./dados/paineis";
export { normalizarUsername, MAX_USERNAME, MIN_USERNAME, usernameSugeridoDoNome, sugerirUsuarioLivre, validarNovoEstabelecimento, cadastroTemDados, gerarSenhaProvisoria, forcaDaSenha, MAX_SLUG, SLUGS_RESERVADOS, normalizarSlug, sugerirSlugLivre } from "./regras/cadastro";
export { mensagemDeErroDoConsole, traduzirErroProvisionamento } from "./regras/erros";
export { provisionarEstabelecimento, alterarPlano, compararModulosDoPlano, alterarLayout, MENSALIDADE_MAXIMA, definirMensalidade, listarAddons, listarAddonsPorTenant, alternarAddon, resumirAddonsDoTenant, contarAddonsPorTenant } from "./dados/gravacoes";
export { montarMensagemPrimeiroAcesso, listarSolicitacoes, decidirSolicitacao, pendentesPrimeiro, resumirPlanoSolicitado } from "./dados/solicitacoes";
