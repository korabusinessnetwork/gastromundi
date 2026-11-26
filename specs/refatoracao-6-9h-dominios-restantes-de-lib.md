# Refatoração 6.9h: os domínios que ainda moravam em `src/lib/` passam para `src/features/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T20h, acrescentada antes
> da 6.12: o "pronto quando" da fase 6 exige `src/lib/` sem regra de negócio.

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

| Domínio | Para onde | Arquivos |
|---|---|---|
| Jarvas | `features/jarvas/dados/` | `jarvas.js` (eventos e insights), `jarvasAssistente.js`, `jarvasEngine.js` (motor de regras, que consulta o banco) |
| Importação de planilha | `features/importacao/regras/` e `dados/` | regras: `planilha`, `plano`, `xlsxEntrada`, `pdfCardapio`, `pdfExtrator`, `ocrTesseract`; dados: `clientes`, `estoque`, `produtos`, `iaCardapio` |
| Assinatura | `features/assinatura/dados/` | `assinatura.js` |
| Ponte | `features/ponte/` | `dados/ponte.js` (fala com o servidor local), `regras/ponteComandas.js`, `regras/ponteDownload.js` |
| Sessão | `features/sessao/` | `dados/adminAuth.js`, `dados/loginTentativas.js`, `regras/navegacaoInicial.js` |

33 arquivos movidos, 121 com import reescrito, testes junto.

**Quem importa de fora do app, conferido:**
- a função de borda `importar-dados` e o bot importador de cardápio importam `planilha.js`,
  `plano.js` e `xlsxEntrada.js` por caminho relativo. Os caminhos foram reescritos; dentro de
  `regras/` os três continuam se importando com caminho relativo e extensão `.js`, como o Deno exige;
- o `bot/README.md` e o README do importador apontam para `src/features/importacao/`.

**Guardas que dependem do caminho de `assinatura.js`:** a exceção nomeada do guarda de travessão
(a frase que o banco levanta, duplicada de propósito) é por caminho, e dois guardas de SQL leem o
arquivo com `join(__dirname, "assinatura.js")`. Os três foram corrigidos; o CLAUDE.md, que descreve
a exceção, também. A conferência de caminhos lidos pelos testes passa a cobrir `join(__dirname, ...)`.

## O que fica em `src/lib/`, e por quê

Só utilidade técnica e de plataforma, sem regra de um domínio: o cliente do Supabase e o prazo de
rede, o tema e a marca do estabelecimento (`tema`, `tenant`, `tenantSlug`, `identidadeTenant`,
`brandingCache`, `slugEstabelecimento`), a fila offline (`offline/`), o log de operações e a
observabilidade, a recuperação de deploy, e as funções pequenas usadas por vários domínios
(`telefone`, `documento`, `busca`, `periodos`, `uidLista`, `qrCodeSvg`, `overlayFechar`,
`camposPermitidos`, `useCorHook`). Os guardas de SQL e de texto também ficam lá. É o papel que a
estrutura-alvo dá a `shared/lib/`; renomear a pasta mexeria em 143 imports só do Supabase sem ganho
para quem mantém, então o nome fica e a 6.12 registra o papel dela.

## Diferenças

DIFERENCAS

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Nenhum arquivo de regra de negócio de domínio fica em `src/lib/` | lista de `src/lib/` acima |
| 2 | Nenhum import nem leitura de fonte aponta para o caminho antigo, inclusive bot e função de borda | busca e guardas da suíte |
| 3 | Nenhuma tela muda | `comparar` com as 209 telas |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 273 arquivos e 4462 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: FORA_DE_DADOS.
- Qualidade: nenhum crítico ou importante.
