# Fase F, passada 1: achados e correções

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T24. A fase F repete
> F.1 a F.4 até uma passada sem achado; esta é a primeira passada e as correções dela.

## Achados

| # | Etapa | Achado | Correção |
|---|---|---|---|
| 1 | F.1 métricas | 10 chamadas ao Supabase fora de `dados/` (meta: 0, cobrado por lint): `lib/tenant.js`, `lib/identidadeTenant.js`, `lib/logger.js` e três ganchos de `utils/hooks.js`. A métrica contava também o Supabase falso dos testes | `tenant` e `identidadeTenant` vão para a feature nova `src/features/tenant/dados/`, o log para `features/auditoria/dados/`. As buscas e gravações dos ganchos de mesas e cozinha viram `listarMesas`, `alterarStatusManualMesa` e `listarPedidosCozinha`; as assinaturas de tempo real passam por `src/lib/dados/tempoReal.js`. A métrica deixa `src/test/` de fora, como já fazia na conta de emoji. **Lint:** a fronteira passa a valer para todo `src/` fora de `dados/` (antes só telas e contexto), conferida com arquivos de teste em `utils/`, num gancho de feature e no celular |
| 2 | F.4 segurança | A 5.34 passou a escrever a cor resolvida do tema dentro do `<style>` da janela de impressão. Variável CSS aceita quase qualquer texto, então um tema adulterado poderia fechar a tag e rodar script na mesma origem do app. Risco baixo: as cores do tema só são gravadas pela `alterar_layout_tenant`, do super-admin da plataforma | Só entra no papel valor com forma de cor (hexadecimal, `rgb`, `rgba`, `hsl`, `hsla` ou nome); o resto fica fora e o CSS cai na cor reserva. Teste antes, vermelho com o valor `</style><img onerror>` e verde depois, mais um teste das formas de cor aceitas |
| 3 | F.2 critérios | Nenhuma regressão: nada do que uma rodada entregou foi desfeito. Três critérios falhavam por documentação desatualizada (README da ponte com o caminho antigo do teste, índice dos ADRs com o ADR-015 "em implementação", arquitetura sem a feature `tenant`) e quatro lacunas antigas de unificação que as rodadas 4.8 a 4.10 não pegaram | A documentação foi corrigida (e os caminhos antigos de `memory/patterns.md`). Lacunas: a busca do PDV do celular passa a usar `nomeBateComBusca` (sem acento, teste novo, vermelho e depois verde); o aviso de assinatura usa `ehGerencia`; a baixa de estoque usa `itensNaoCancelados`; o relatório usa o catálogo único dos meios de pagamento |

**F.4, o que foi conferido além do achado 2:** desde o commit de partida (`940d8db0`) o banco
ganhou 4 migrations, todas funções atômicas `SECURITY INVOKER` (rodam com as políticas de quem
chama), com `search_path` fixo, execução tirada de `anon`, e nenhuma política de RLS foi
alterada. As funções de borda só mudaram caminho de import e comentário. Os outros pontos que
montam HTML (`renderizar.js`) usam o CSS fixo do app, e o único `dangerouslySetInnerHTML` (QR
Code) já tem guarda.

**Pendência do dono, não corrigida de propósito:** o `package.json` tem o script `setup:git`
apontando para `scripts/setup-git.mjs`, que só existe num commit nunca mesclado ("Guarda de branch
por dev"). Restaurar traria uma funcionalidade que não foi aprovada; fica em
`.full-auto/PENDENCIAS-DO-MATHEUS.md`.

## Diferenças

Roteiro completo, 209 telas, contra a main: nenhuma diferença e 1 mudança leve de 0,000% nas
Reservas do PDV (ruído conhecido). A captura de depois começou com as três correções aplicadas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Chamadas ao Supabase fora de `dados/`: 0, cobrado por lint | métrica e arquivos de teste reprovados pelo lint |
| 2 | Cor do tema sem forma de cor não entra no HTML da impressão | teste novo |
| 3 | Os achados da F.2 corrigidos | testes e leitura dos arquivos |
| 4 | Suíte verde, build limpo, lint 0 erros, nenhuma tela muda | comandos e `comparar` |

## Revisão

- Spec: 4 de 4 em sim. Suíte 273 arquivos e 4465 testes, verde (3 novos); build limpo; lint 0
  erros e 25 avisos. Chamadas ao Supabase fora de `dados/`: 0.
- Qualidade: nenhum crítico ou importante.
