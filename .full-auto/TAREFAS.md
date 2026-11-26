# TAREFAS

Legenda: `[ ]` pendente, `[~]` em andamento, `[x]` concluída e verificada, `[!]` travada com diagnóstico.

Base verificada em 2026-11-25: commit `b87b0435`, suíte 268 arquivos e 4435 testes verdes.

Cada rodada segue o padrão do plano: roteiro de fotos antes, captura de referência, conversão,
suíte, lint, build, comparação de telas com cada diferença vista, spec em `specs/`, entrada em
`specs/_loop.md`, linha em `refatoracao_metricas.md` e no plano, commit, PR e merge na main.
Rodada com migration não é mesclada sem o dono (regra 5 do plano).

| # | Tarefa | Critério de pronto | trilha | depende |
|---|--------|--------------------|--------|---------|
| [x] T01 | 5.22 Impostos: `ImpostosAdmin` (15, 2 emoji), `impostos/ModalFiscal` (7), `impostos/FSel` (1) | os três fora da linha de base de estilo e de emoji, telas iguais ou diferença explicada, suíte e build verdes | ui | , |
| [x] T02 | 5.23 Abertura de caixa e login: `AberturaCaixaModal` (14, 1 emoji), `LoginPage` (14) | idem | ui | , |
| [x] T03 | 5.24 Casca e telas de acesso: `DesktopLayout` (13), `AssinaturaBloqueada` (8), `SemAcesso` (4), `UpgradeNecessario` (4), `AssinaturaBanner` (3), `main.jsx` (4) | idem | ui | , |
| [x] T04 | 5.25 Configurações restantes: `UnidadesMedidaTab`, `CategoriasGrupoTab`, `DeliveryTab`, `ConfiguracoesView`, `PonteLocalConfig`, `ImportarExportarTab` e os componentes pequenos (`StrengthBar`, `Avatar`, `ErrBox`, `PermCheck`, `RoleBadge`, `ToggleChip`) | idem | ui | , |
| [x] T05 | 5.26 Cozinha: `CozinhaView` (13, 1 emoji) | idem | ui | , |
| [x] T06 | 5.27 Financeiro: `FinanceiroView`, `LancamentosList`, `NovoLancamentoModal`, `ResumoCards` | idem | ui | , |
| [x] T07 | 5.28 O que sobrar de estilo inline (estoque, demo, console, cardápio público, delivery, notificação, celular) | guard de estilo inline em zero, sem lista de exceções | ui | T01..T06 |
| [ ] T08 | 5.z Emoji de código restante (fora o campo de emoji do produto) | guard de emoji só com o que é do campo do produto, listado arquivo a arquivo | ui | T07 |
| [ ] T09 | 5.x Cores hexadecimais no JSX para `var(--gm-*)` | métrica "cor hexadecimal em JSX" em zero | ui | T07 |
| [ ] T10 | Decisão 037, rodada própria: o campo de emoji do produto sai (escolha no cadastro e exibição no PDV, cozinha, cardápio, relatório) | guard de emoji em zero, sem migration (a coluna fica no banco, sem uso) | ui | T08 |
| [ ] T11 | 5.y Prova do white-label: roteiro de fotos com dois temas de tenant | nenhuma cor da marca padrão aparece no tema do outro | ui | T09, T10 |
| [ ] T12 | 6.1 Mover fiscal para `src/features/fiscal/` | domínio movido com `git mv`, testes junto, suíte verde | pastas | T11 |
| [ ] T13 | 6.2 delivery | idem | pastas | T12 |
| [ ] T14 | 6.3 estoque | idem | pastas | T13 |
| [ ] T15 | 6.4 caixa | idem | pastas | T14 |
| [ ] T16 | 6.5 PDV | idem | pastas | T15 |
| [ ] T17 | 6.6 clientes | idem | pastas | T16 |
| [ ] T18 | 6.7 console | idem | pastas | T17 |
| [ ] T19 | 6.8 pautas | idem | pastas | T18 |
| [ ] T20 | 6.9 apex | idem | pastas | T19 |
| [ ] T21 | 6.10 Roteador por superfície em `src/app/rotas/` | `routes/index.jsx` só escolhe a superfície, suíte verde | pastas | T20 |
| [ ] T22 | 6.11 README de `ponte/` e `bot/` | READMEs existem e dizem o que é, como rodar, se compartilham código | docs | , |
| [ ] T23 | 6.12 Documentação final e ADR-015 aceito | docs de arquitetura descrevem o estado real | docs | T21 |
| [ ] T24 | Fase F, auditoria e correção em laço até zero achados | F.1 a F.4 com zero achados na mesma passada, relatório final | auditoria | T23 |
