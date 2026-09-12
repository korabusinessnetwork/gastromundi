# TAREFAS, rodada 3 do refino (frentes paralelas)

Legenda: `[ ]` pendente, `[~]` em andamento, `[x]` concluída e verificada, `[!]` travada com diagnóstico.

Rodada 1: 8 de 8. Rodada 2: 32 de 32. Nada revertido por quebra.
Baseline no início da rodada 3, medido com a máquina livre: 252 arquivos, 4334
testes, build limpo.

O que sobrou da varredura são achados de infraestrutura invisível: coisas que
falham calado, longe dos olhos de quem opera. Três trilhas mais a minha parte.

## Trilha `offline-contexto`
Dono de: `src/context/AppContext.jsx`, `src/lib/offline/`, `src/components/shared/IndicadorRede.jsx`

| # | id | eixo | Tarefa |
|---|----|------|--------|
| [ ] O01 | V102 | robustez | O dreno da fila offline volta a tentar sozinho, e o indicador para de afirmar que está enviando o que não está |
| [ ] O02 | V106 | robustez | Quando o IndexedDB não abre, a tela diz que os pedidos estão guardados só naquela aba |

## Trilha `impressao`
Dono de: `src/hooks/useImpressaoLancamentos.js`, `src/components/shared/ImpressaoLancamentosBridge.jsx`, `src/components/shared/AvisoImpressaoPonte.jsx`

| # | id | eixo | Tarefa |
|---|----|------|--------|
| [ ] I01 | V101 | robustez | Falha na impressão automática do pedido do Palm chega ao humano, como já chega no caminho da Ponte |
| [ ] I02 | V108 | qualidade | O hook da impressão automática ganha teste, cobrindo semeadura, lançamento novo e eco do realtime |

## Trilha `telas-menores`
Dono de: `src/components/pautas/`, `src/components/shared/Notification.jsx`, `src/components/shared/JarvasPanel.jsx`, `src/utils/hooks.js`, `src/components/desktop/views/PDVView/MesaReservasView.jsx`

| # | id | eixo | Tarefa |
|---|----|------|--------|
| [ ] T01 | V105 | robustez | Falha ao ler as mesas deixa de virar "nenhuma mesa cadastrada" |
| [ ] T02 | V110 | robustez | O painel do Jarvas distingue busca que falhou de "não há insight", e desfaz a remoção que o banco recusou |
| [ ] T03 | V107 | ux | Mudar o status de uma pauta que o banco recusou avisa, em vez de fingir que nada aconteceu |
| [ ] T04 | V109 | robustez | O aviso compartilhado para de apagar a mensagem nova antes da hora |

## Do maestro
| # | id | eixo | Tarefa |
|---|----|------|--------|
| [ ] M01 | V103 | ux | O PWA para de recarregar a aba do caixa sem avisar, e passa a oferecer a atualização |
| [ ] M02 | N04 | ux | Título de aba por tela, com o nome do estabelecimento |
| [ ] M03 | - | qualidade | `npm audit fix` nas duas falhas de dependência de build |
| [ ] M04 | N05 | qualidade | Medir o bundle por rota antes de decidir o que separar do chunk principal |
